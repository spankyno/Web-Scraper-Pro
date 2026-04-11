import { authenticateToken } from "./lib/auth.js";
import { supabase } from "./lib/supabase.js";
import { scrapeUrl } from "./lib/scraper-service.js";
import axios from "axios";

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

    const start = Date.now();

    try {
      const result = await scrapeUrl(url, method, query);
      const duration = Date.now() - start;

      // Save to Supabase if possible
      if (auth.user) {
        try {
          await supabase.from("scrape_jobs").insert({
            user_id: auth.user.id,
            url,
            method: result.effectiveMethod,
            result,
            duration,
            variants: result.variants || [],
            variantsSource: result.variantsSource || null
          });
        } catch (dbErr: any) {
          console.error("Supabase Save Error:", dbErr.message);
        }
      }

      res.json({ 
        success: true, 
        result, 
        duration,
        antibotOverride: result.antibotOverride,
        originalMethod: method
      });
    } catch (error: any) {
      console.error(`Scrape Error:`, error.message);

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
