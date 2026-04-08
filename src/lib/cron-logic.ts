import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import { extractPriceSmart } from "../../api/lib/price-extractor.js";
import { engines } from "../../api/lib/engines.js";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function runPriceCheck(env: any) {
  const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);
  const now = new Date().toISOString();
  
  // 1. Get items to check
  const { data: items, error: fetchError } = await supabase
    .from("monitored_items")
    .select("*")
    .eq("is_active", true)
    .lte("next_check", now);

  if (fetchError) throw fetchError;
  if (!items || items.length === 0) {
    return { success: true, message: "No items to check" };
  }

  const results = [];
  const telegramToken = env.TELEGRAM_BOT_TOKEN;

  for (const item of items) {
    try {
      // Rate limiting: 3 seconds between requests
      await delay(3000);

      console.log(`Checking price for: ${item.title} (${item.url})`);
      
      // 2. Scrape using fetch-light + extractPriceSmart
      const response = await axios.get(item.url, { 
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Referer': 'https://www.google.com/'
        },
        timeout: 20000
      });
      
      let smartPrice = await extractPriceSmart(response.data, item.url);
      
      // Fallback to Gemini if confidence is low
      if (!smartPrice.price || smartPrice.confidence < 60) {
        console.log(`Low confidence (${smartPrice.confidence}%). Falling back to Gemini...`);
        try {
          const geminiResult = await (engines as any)["gemini-ai"](item.url, "Extract current price");
          if (geminiResult && geminiResult.price) {
            smartPrice = {
              price: typeof geminiResult.price === 'string' ? parseFloat(geminiResult.price.replace(/[^\d.]/g, '')) : geminiResult.price,
              currency: geminiResult.currency || "EUR",
              confidence: geminiResult.confidence || 80,
              method: "gemini-ai-fallback"
            };
          }
        } catch (e) {
          console.error("Gemini fallback failed in cron:", e);
        }
      }

      const currentPrice = smartPrice.price || 0;
      
      // 3. Detect changes
      let status = "stable";
      if (currentPrice > 0 && item.price_current > 0) {
        if (currentPrice < item.price_current) status = "down";
        else if (currentPrice > item.price_current) status = "up";
      }
      if (currentPrice === 0 && response.status === 200) status = "out_of_stock";

      const isPriceDrop = currentPrice > 0 && item.price_current > 0 && currentPrice < item.price_current;
      const dropPct = isPriceDrop ? ((item.price_current - currentPrice) / item.price_current) * 100 : 0;
      const threshold = item.threshold || 10;
      const alertPrice = item.alert_price || 0;

      // 4. Notify
      // Notify if:
      // 1. There is a price drop AND it's >= threshold %
      // 2. OR current price is <= alert price (even if it didn't change in this check)
      const shouldNotify = (isPriceDrop && dropPct >= threshold) || (currentPrice > 0 && alertPrice > 0 && currentPrice <= alertPrice);

      if (shouldNotify && telegramToken) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("telegram_chat_id")
          .eq("id", item.user_id)
          .single();

        if (profile?.telegram_chat_id) {
          const message = `🔔 *Alerta de precio — WebScraper Pro*\n\n📦 *${item.title}*\n🔗 [Ver producto](${item.url})\n\n💰 Precio anterior: ~~€${item.price_current}~~\n✅ Precio actual: *€${currentPrice}*\n📉 Bajada: -${dropPct.toFixed(1)}%\n\n👉 [Ir a la web](${item.url})`;
          await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            chat_id: profile.telegram_chat_id,
            text: message,
            parse_mode: "Markdown"
          });
        }
      }

      // 5. Update item
      const nextCheckDate = new Date();
      const interval = item.check_interval || "1h";
      if (interval === "15m") nextCheckDate.setMinutes(nextCheckDate.getMinutes() + 15);
      else if (interval === "1h") nextCheckDate.setHours(nextCheckDate.getHours() + 1);
      else if (interval === "6h") nextCheckDate.setHours(nextCheckDate.getHours() + 6);
      else nextCheckDate.setDate(nextCheckDate.getDate() + 1);

      const updatePayload: any = {
        price_previous: item.price_current,
        price_current: currentPrice,
        status: status,
        last_checked: now,
        next_check: nextCheckDate.toISOString(),
        price_confidence: smartPrice.confidence,
        price_extraction_method: smartPrice.method,
        last_error: null
      };

      let { error: updateError } = await supabase
        .from("monitored_items")
        .update(updatePayload)
        .eq("id", item.id);

      // Fallback if columns are missing
      if (updateError && (updateError.message.includes("price_confidence") || updateError.code === "PGRST204")) {
        const basicPayload = { ...updatePayload };
        delete basicPayload.price_confidence;
        delete basicPayload.price_extraction_method;
        delete basicPayload.last_error;
        await supabase
          .from("monitored_items")
          .update(basicPayload)
          .eq("id", item.id);
      }

      results.push({ id: item.id, status: "updated", change: isPriceDrop, price: currentPrice });
    } catch (itemErr: any) {
      console.error(`Error checking item ${item.id}:`, itemErr.message);
      
      // Update last_error in DB with fallback
      const errorPayload: any = { 
        last_error: itemErr.message,
        last_checked: now 
      };
      
      let { error: logError } = await supabase
        .from("monitored_items")
        .update(errorPayload)
        .eq("id", item.id);
      
      if (logError && logError.message.includes("last_error")) {
        delete errorPayload.last_error;
        await supabase
          .from("monitored_items")
          .update(errorPayload)
          .eq("id", item.id);
      }

      results.push({ id: item.id, status: "error", error: itemErr.message });
    }
  }

  return { success: true, results };
}
