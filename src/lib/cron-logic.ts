import { createClient } from "@supabase/supabase-js";
import { scrapeUrl, findVariantPrice } from "../../api/lib/scraper-service.js";
import { sendPriceAlert } from "../../api/lib/notifications.js";

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
      
      // 2. Scrape using ScraperService
      const result = await scrapeUrl(item.url, item.method || 'fetch-light');
      
      let currentPrice = result.price || 0;

      // Check if we need to find a specific variant
      if (item.price_selector && result.variants && result.variants.length > 0) {
        const variantPrice = findVariantPrice(result.variants, item.price_selector);
        if (variantPrice) {
          console.log(`Found variant price for ${item.price_selector}: ${variantPrice}`);
          currentPrice = variantPrice;
        }
      }
      
      // 3. Detect changes
      let status: "up" | "down" | "stable" | "out_of_stock" = "stable";
      if (!result.inStock) {
        status = "out_of_stock";
      } else if (currentPrice > 0 && item.price_current > 0) {
        if (currentPrice < item.price_current) status = "down";
        else if (currentPrice > item.price_current) status = "up";
      }
      if (currentPrice === 0 && status !== "out_of_stock") status = "out_of_stock";

      const isPriceDrop = currentPrice > 0 && item.price_current > 0 && currentPrice < item.price_current;
      const dropPct = isPriceDrop ? ((item.price_current - currentPrice) / item.price_current) * 100 : 0;
      const threshold = item.threshold || 10;
      const alertPrice = item.alert_price || 0;

      // 4. Notify
      const shouldNotify = (isPriceDrop && dropPct >= threshold) || (currentPrice > 0 && alertPrice > 0 && currentPrice <= alertPrice);

      if (shouldNotify && telegramToken) {
        await sendPriceAlert(item, currentPrice, dropPct);
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
        price_confidence: result.confidence,
        price_extraction_method: result.method,
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
