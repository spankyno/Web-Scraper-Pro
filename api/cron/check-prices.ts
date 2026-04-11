import { runPriceCheck } from "../../src/lib/cron-logic.js";

export default async function handler(req: any, res: any) {
  // Simple security check for cron
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // In Vercel, you can also use Vercel's own cron security
    // return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const env = {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      BROWSERLESS_API_KEY: process.env.BROWSERLESS_API_KEY,
    };

    const result = await runPriceCheck(env);
    res.json(result);
  } catch (error: any) {
    console.error("Cron Job Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}
