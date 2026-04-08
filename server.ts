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
  });

  // --- Vite Middleware ---

  if (process.env.NODE_ENV !== "production") {
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  return app;
}

export const appPromise = startServer();
