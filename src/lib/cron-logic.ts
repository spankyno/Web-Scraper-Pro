import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import * as cheerio from "cheerio";

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
      // 2. Scrape (using a simple fetch-light logic)
      const response = await axios.get(item.url, { 
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
        },
        timeout: 15000
      });
      
      const $ = cheerio.load(response.data);
      let currentPrice = 0;
      
      if (item.price_selector) {
        const priceText = $(item.price_selector).text().trim();
        currentPrice = parseFloat(priceText.replace(/[^0-9.,]/g, '').replace(',', '.'));
      }

      if (isNaN(currentPrice)) currentPrice = 0;

      // 3. Detect changes
      let status = "stable";
      if (currentPrice < item.price_current) status = "down";
      else if (currentPrice > item.price_current) status = "up";
      if (currentPrice === 0) status = "out_of_stock";

      const isPriceDrop = currentPrice > 0 && item.price_current > 0 && currentPrice < item.price_current;
      const dropPct = isPriceDrop ? ((item.price_current - currentPrice) / item.price_current) * 100 : 0;
      const threshold = item.threshold || 10;

      // 4. Notify
      if (isPriceDrop && dropPct >= threshold && telegramToken) {
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

      await supabase
        .from("monitored_items")
        .update({
          price_previous: item.price_current,
          price_current: currentPrice,
          status: status,
          last_checked: now,
          next_check: nextCheckDate.toISOString()
        })
        .eq("id", item.id);

      results.push({ id: item.id, status: "updated", change: isPriceDrop });
    } catch (itemErr: any) {
      console.error(`Error checking item ${item.id}:`, itemErr.message);
      results.push({ id: item.id, status: "error", error: itemErr.message });
    }
  }

  return { success: true, results };
}
