import axios from "axios";
import { supabase } from "./supabase.js";

export async function sendPriceAlert(item: any, currentPrice: number, dropPct: number) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!telegramToken) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("telegram_chat_id")
    .eq("id", item.user_id)
    .single();

  if (profile?.telegram_chat_id) {
    const message = `🔔 *Alerta de precio — WebScraper Pro*\n\n📦 *${item.title}*\n🔗 [Ver producto](${item.url})\n\n💰 Precio anterior: ~~€${item.price_current}~~\n✅ Precio actual: *€${currentPrice}*\n📉 Bajada: -${dropPct.toFixed(1)}%\n\n👉 [Ir a la web](${item.url})`;
    try {
      await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        chat_id: profile.telegram_chat_id,
        text: message,
        parse_mode: "Markdown"
      });
      return true;
    } catch (err) {
      console.error("Failed to send Telegram alert:", err);
      return false;
    }
  }
  return false;
}
