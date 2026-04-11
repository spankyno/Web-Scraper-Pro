import axios from "axios";

export default async function handler(req: any, res: any) {
  const { chatId } = req.body;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ success: false, error: "TELEGRAM_BOT_TOKEN not configured" });
  
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: "🔔 *WebScraper Pro Test*\n\nYour Telegram connection is working correctly!",
      parse_mode: "Markdown"
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
