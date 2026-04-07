/// <reference types="@cloudflare/workers-types" />
import { runPriceCheck } from "./src/lib/cron-logic";

export interface Env {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  GEMINI_API_KEY: string;
  BROWSERLESS_API_KEY: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log("Running scheduled price check...");
    try {
      const result = await runPriceCheck(env);
      console.log("Price check completed:", JSON.stringify(result));
    } catch (error: any) {
      console.error("Price check failed:", error.message);
    }
  },

  // Also allow manual trigger via HTTP for testing
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/run-cron") {
      const result = await runPriceCheck(env);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  },
};
