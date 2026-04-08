import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { engines } from "./api/lib/engines.js";
import { supabase } from "./api/lib/supabase.js";
import { authenticateToken } from "./api/lib/auth.js";
import { Parser } from "json2csv";
import dotenv from "dotenv";
import { extractPriceSmart } from "./api/lib/price-extractor.js";
import { sendPriceAlert } from "./api/lib/notifications.js";

const getEnv = (key: string) => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) {}
  return "";
};

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AuthRequest extends express.Request {
  user?: any;
}

const expressAuthMiddleware = async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  const auth = await authenticateToken(req, res);
  if (!auth.success) {
    return res.status(auth.status || 500).json({ success: false, error: auth.error });
  }
  req.user = auth.user;
  next();
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    console.log(`Incoming Request: ${req.method} ${req.url}`);
    next();
  });

  // --- API Routes ---

  app.post("/api/scrape", expressAuthMiddleware, async (req: AuthRequest, res) => {
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
      
      const executeScrape = async (m: string) => {
        if (m === "fetch-light") return await (engines as any)["fetch-light"](url);
        if (m === "cheerio") return await (engines as any)["cheerio"](url);
        if (m === "gemini-ai") {
          if (!getEnv("GEMINI_API_KEY")) throw new Error("GEMINI_API_KEY not configured");
          return await (engines as any)["gemini-ai"](url, instruction || "Extract current price and product title");
        }
        if (m === "playwright") {
          if (!getEnv("BROWSERLESS_API_KEY")) throw new Error("BROWSERLESS_API_KEY not configured");
          return await (engines as any)["playwright"](url);
        }
        if (m === "importxml") return await (engines as any)["importxml"](url, query);
        throw new Error(`Method '${m}' not implemented.`);
      };

      // Try primary method
      try {
        result = await executeScrape(method);
        
        // Fallback logic if confidence is low or result is poor
        const needsFallback = (method === "fetch-light" || method === "cheerio") && 
                             (!result.price || (result.confidence && result.confidence < 60));

        if (needsFallback) {
          console.log(`Low confidence (${result.confidence}%) with ${method}. Trying Gemini fallback...`);
          try {
            const fallbackResult = await executeScrape("gemini-ai");
            if (fallbackResult && fallbackResult.price) {
              result = { ...fallbackResult, fallback_from: method };
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
        console.error(`Primary method ${method} failed. Trying fallback...`);
        if (method !== "gemini-ai") {
          result = await executeScrape("gemini-ai");
        } else {
          throw primaryErr;
        }
      }

      const duration = Date.now() - start;
      
      // Save to Supabase if possible
      if (req.user) {
        try {
          await supabase.from("scrape_jobs").insert({
            user_id: req.user.id,
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
          const body = typeof error.response.data === 'string' 
            ? error.response.data.substring(0, 200) 
            : JSON.stringify(error.response.data).substring(0, 200);
          
          errorMessage = `The target website (${new URL(url).hostname}) returned a ${status} ${statusText} error. This usually means the specific page doesn't exist or is restricting access.`;
          console.error(`Axios Response Error: ${status} ${statusText}`, body);
        } else if (error.request) {
          errorMessage = `Could not connect to ${new URL(url).hostname}. The site might be blocking our scraper, or it could be temporarily down.`;
        }
      }
      
      res.status(500).json({ success: false, error: errorMessage });
    }
  });

  app.post("/api/monitor/check/:id", expressAuthMiddleware, async (req: AuthRequest, res) => {
    const { id } = req.params;
    console.log(`Manual check requested for item: ${id}`);
    try {
      // 1. Get item
      const { data: item, error: fetchError } = await supabase
        .from("monitored_items")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !item) {
        return res.status(404).json({ success: false, error: "Item not found in database" });
      }

      // 2. Scrape
      const response = await axios.get(item.url, { 
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Referer': 'https://www.google.com/'
        },
        timeout: 25000
      });
      
      const smartPrice = await extractPriceSmart(response.data, item.url);
      const currentPrice = smartPrice.price || 0;

      // 3. Detect changes
      let status = "stable";
      if (currentPrice > 0 && item.price_current > 0) {
        if (currentPrice < item.price_current) status = "down";
        else if (currentPrice > item.price_current) status = "up";
      }

      const isPriceDrop = currentPrice > 0 && item.price_current > 0 && currentPrice < item.price_current;
      const dropPct = isPriceDrop ? ((item.price_current - currentPrice) / item.price_current) * 100 : 0;
      const threshold = item.threshold || 10;
      const alertPrice = item.alert_price || 0;

      // 4. Notify
      const shouldNotify = (isPriceDrop && dropPct >= threshold) || (currentPrice > 0 && alertPrice > 0 && currentPrice <= alertPrice);
      if (shouldNotify) {
        await sendPriceAlert(item, currentPrice, dropPct);
      }

      // 5. Update item
      const updatePayload = {
        price_previous: item.price_current,
        price_current: currentPrice,
        status: status,
        last_checked: new Date().toISOString(),
        price_confidence: smartPrice.confidence,
        price_extraction_method: smartPrice.method,
        last_error: null
      };

      const { error: updateError } = await supabase
        .from("monitored_items")
        .update(updatePayload)
        .eq("id", id);

      if (updateError) throw updateError;

      res.json({ success: true, price: currentPrice, notified: shouldNotify });
    } catch (error: any) {
      console.error(`Check Item Error [${id}]:`, error.message);
      res.status(500).json({ success: false, error: error.message || "Unknown server error" });
    }
  });

  app.post("/api/export", async (req, res) => {
    const { data, format } = req.body;
    try {
      if (format === "json") {
        res.setHeader("Content-Type", "application/json");
        res.send(JSON.stringify(data, null, 2));
      } else if (format === "csv") {
        const parser = new Parser();
        const csv = parser.parse(data);
        res.setHeader("Content-Type", "text/csv");
        res.send(csv);
      } else {
        res.status(400).send("Invalid format or format not supported");
      }
    } catch (error: any) {
      res.status(500).send(error.message);
    }
  });

  app.post("/api/notifications/test", async (req, res) => {
    const { chatId } = req.body;
    const token = getEnv("TELEGRAM_BOT_TOKEN");
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
  });

  // Catch-all for undefined API routes
  app.all("/api/*", (req, res) => {
    console.warn(`[API] 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ success: false, error: `API route not found: ${req.method} ${req.url}` });
  });

  // --- Vite Middleware ---
  const nodeEnv = getEnv("NODE_ENV");

  if (nodeEnv !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("[SERVER ERROR]", err);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: err.message || "Internal Server Error",
        stack: getEnv("NODE_ENV") !== "production" ? err.stack : undefined
      });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  return app;
}

export const appPromise = startServer();
