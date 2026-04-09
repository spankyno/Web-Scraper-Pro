import { authenticateToken } from "./lib/auth.js";
import { engines } from "./lib/engines.js";
import { supabase } from "./lib/supabase.js";
import axios from "axios";

// Domains known to use aggressive anti-bot (Cloudflare JS challenge, Imperva, etc.)
// These require a real browser (Playwright/Browserless) — axios will always get 403
const ANTIBOT_DOMAINS = [
  'pccomponentes.com',
  'carrefour.es',
  'carrefour.com',
  'amazon.es',
  'amazon.com',
  'amazon.co.uk',
  'mediamarkt.es',
  'elcorteingles.es',
  'fnac.es',
  'zalando.es',
  'zara.com',
  'mango.com',
];

function requiresBrowser(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return ANTIBOT_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export default async function handler(req: any, res: any) {
  try {
    const auth = await authenticateToken(req, res);
    if (!auth.success) {
      return res.status(auth.status).json({ success: false, error: auth.error });
    }

    let { url, method, instruction, query } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: "URL is required" });
    }

    url = url.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }

    try {
      const parsedUrl = new URL(url);
      url = parsedUrl.toString();
    } catch (e) {
      return res.status(400).json({ success: false, error: "The provided URL is not valid. Please check for typos or missing parts." });
    }

    // ── Anti-bot override ────────────────────────────────────────────────────
    // If the target is a known anti-bot domain and the user didn't already pick
    // playwright, switch automatically and log it.
    let effectiveMethod = method;
    let antibotOverride = false;
    if (requiresBrowser(url) && method !== 'playwright') {
      if (!process.env.BROWSERLESS_API_KEY) {
        return res.status(422).json({
          success: false,
          error: `The website (${new URL(url).hostname}) uses anti-bot protection (Cloudflare / Imperva) that requires a real browser to bypass. Please configure BROWSERLESS_API_KEY in your environment variables and select the "Playwright" engine.`
        });
      }
      effectiveMethod = 'playwright';
      antibotOverride = true;
      console.log(`Anti-bot domain detected (${new URL(url).hostname}), overriding method to playwright`);
    }

    console.log(`Scrape Request: ${effectiveMethod} for ${url}`);

    try {
      let result: any;
      const start = Date.now();

      const executeScrape = async (m: string) => {
        if (m === "fetch-light") return await (engines as any)["fetch-light"](url);
        if (m === "cheerio") return await (engines as any)["cheerio"](url);
        if (m === "gemini-ai") {
          if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
          return await (engines as any)["gemini-ai"](url, instruction || "Extract current price and product title");
        }
        if (m === "playwright") {
          if (!process.env.BROWSERLESS_API_KEY) throw new Error("BROWSERLESS_API_KEY not configured");
          return await (engines as any)["playwright"](url);
        }
        if (m === "importxml") return await (engines as any)["importxml"](url, query);
        throw new Error(`Method '${m}' not implemented.`);
      };

      // Try primary (possibly overridden) method
      try {
        result = await executeScrape(effectiveMethod);

        // Fallback logic if confidence is low or result is poor
        // Only for non-browser engines that returned a low-confidence result
        const needsFallback = (effectiveMethod === "fetch-light" || effectiveMethod === "cheerio") &&
                             (!result.price || (result.confidence && result.confidence < 60));

        if (needsFallback) {
          console.log(`Low confidence (${result.confidence}%) with ${effectiveMethod}. Trying Gemini fallback...`);
          try {
            const fallbackResult = await executeScrape("gemini-ai");
            if (fallbackResult && fallbackResult.price) {
              result = { ...fallbackResult, fallback_from: effectiveMethod };
            }
          } catch (geminiErr) {
            console.error("Gemini fallback failed, trying Playwright...", geminiErr);
            try {
              const pwResult = await executeScrape("playwright");
              result = { ...pwResult, fallback_from: "gemini-ai" };
            } catch (pwErr) {
              console.error("All fallbacks failed.");
            }
          }
        }
      } catch (primaryErr) {
        console.error(`Primary method ${effectiveMethod} failed. Trying fallback...`);
        if (effectiveMethod !== "gemini-ai") {
          result = await executeScrape("gemini-ai");
        } else {
          throw primaryErr;
        }
      }

      if (antibotOverride) {
        result = { ...result, antibotOverride: true, originalMethod: method };
      }

      const duration = Date.now() - start;

      // Save to Supabase if possible
      if (auth.user) {
        try {
          await supabase.from("scrape_jobs").insert({
            user_id: auth.user.id,
            url,
            method: effectiveMethod,
            result,
            duration,
          });
        } catch (dbErr: any) {
          console.error("Supabase Save Error:", dbErr.message);
        }
      }

      res.json({ success: true, result, duration });
    } catch (error: any) {
      console.error(`Scrape Error [${effectiveMethod}]:`, error.message);

      let errorMessage = error.message;
      if (axios.isAxiosError(error)) {
        if (error.response) {
          const status = error.response.status;
          const statusText = error.response.statusText;
          if (status === 403) {
            errorMessage = `The website (${new URL(url).hostname}) is blocking access with a ${status} error. This site uses advanced anti-bot protection. Try switching to the "Playwright" engine, which uses a real browser to bypass these restrictions.`;
          } else {
            errorMessage = `The target website (${new URL(url).hostname}) returned a ${status} ${statusText} error. This usually means the specific page doesn't exist or is restricting access.`;
          }
        } else if (error.request) {
          errorMessage = `Could not connect to ${new URL(url).hostname}. The site might be blocking our scraper, or it could be temporarily down.`;
        }
      }

      res.status(500).json({ success: false, error: errorMessage });
    }
  } catch (globalError: any) {
    console.error("Global Scrape Handler Error:", globalError.message);
    res.status(500).json({ success: false, error: "An unexpected server error occurred. Please check Vercel logs for details." });
  }
}
