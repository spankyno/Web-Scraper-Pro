import { authenticateToken } from "./lib/auth.js";
import { engines } from "./lib/engines.js";
import { supabase } from "./lib/supabase.js";
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

    console.log(`Scrape Request: ${method} for ${url}`);
    
    try {
      let result;
      const start = Date.now();
      
      if (method === "fetch-light") result = await (engines as any)["fetch-light"](url);
      else if (method === "cheerio") result = await (engines as any)["cheerio"](url);
      else if (method === "gemini-ai") {
        if (!process.env.GEMINI_API_KEY) {
          throw new Error("GEMINI_API_KEY is not configured in Vercel environment variables.");
        }
        result = await (engines as any)["gemini-ai"](url, instruction);
      }
      else if (method === "playwright") {
        if (!process.env.BROWSERLESS_API_KEY) {
          throw new Error("BROWSERLESS_API_KEY is not configured in Vercel environment variables.");
        }
        result = await (engines as any)["playwright"](url);
      }
      else if (method === "importxml") result = await (engines as any)["importxml"](url, query);
      else throw new Error(`Method '${method}' not implemented or invalid.`);

      const duration = Date.now() - start;
      
      // Save to Supabase if possible
      if (auth.user) {
        try {
          await supabase.from("scrape_jobs").insert({
            user_id: auth.user.id,
            url,
            method,
            result,
            duration,
          });
        } catch (dbErr: any) {
          console.error("Supabase Save Error:", dbErr.message);
        }
      }

      res.json({ success: true, result, duration });
    } catch (error: any) {
      console.error(`Scrape Error [${method}]:`, error.message);
      
      let errorMessage = error.message;
      if (axios.isAxiosError(error)) {
        if (error.response) {
          const status = error.response.status;
          const statusText = error.response.statusText;
          errorMessage = `The target website (${new URL(url).hostname}) returned a ${status} ${statusText} error. This usually means the specific page doesn't exist or is restricting access.`;
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
