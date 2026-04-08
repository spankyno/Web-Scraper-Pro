import axios from "axios";
import * as cheerio from "cheerio";
import { GoogleGenAI, Type } from "@google/genai";
import { DOMParser } from "xmldom";
import xpath from "xpath";

export const engines = {
  "fetch-light": async (url: string) => {
    const response = await axios.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      timeout: 15000
    });
    const $ = cheerio.load(response.data);
    
    // Attempt to find price automatically
    let price = "";
    const priceSelectors = [
      '[class*="price"]', '[id*="price"]', '.current-price', '.amount', 
      'meta[property="product:price:amount"]', 'meta[name="twitter:data1"]'
    ];
    
    for (const selector of priceSelectors) {
      const el = $(selector);
      if (el.length > 0) {
        if (selector.startsWith('meta')) {
          price = el.attr('content') || "";
        } else {
          price = el.first().text().trim();
        }
        if (price) break;
      }
    }

    return { 
      html: response.data.substring(0, 1000), 
      title: $("title").text(),
      price: price || "Not found automatically",
      url
    };
  },
  "cheerio": async (url: string) => {
    const response = await axios.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      },
      timeout: 15000
    });
    const $ = cheerio.load(response.data);
    const data: any[] = [];
    $("a").each((i, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr("href");
      if (text || href) data.push({ text, href });
    });
    return { data, count: data.length };
  },
  "gemini-ai": async (url: string, instruction: string) => {
    const response = await axios.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      },
      timeout: 20000
    });
    const html = response.data.substring(0, 40000); 
    
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Extract data from this HTML based on these instructions: ${instruction}\n\nHTML:\n${html}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            data: {
              type: Type.ARRAY,
              items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, value: { type: Type.STRING } } }
            }
          }
        }
      }
    });
    const result = await model;
    return JSON.parse(result.text || "{}");
  },
  "playwright": async (url: string) => {
    const apiKey = process.env.BROWSERLESS_API_KEY;
    if (!apiKey) throw new Error("BROWSERLESS_API_KEY not configured");
    
    const response = await axios.post(`https://chrome.browserless.io/content?token=${apiKey}`, {
      url,
      gotoOptions: { waitUntil: "networkidle2", timeout: 30000 },
      setExtraHTTPHeaders: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      },
      elements: [
        { selector: "title" },
        { selector: "h1" },
        { selector: ".price" },
        { selector: "#price" },
        { selector: '[class*="price"]' }
      ]
    });
    return response.data;
  },
  "importxml": async (url: string, query: string) => {
    const response = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    
    // Use a more forgiving parser setup
    const parser = new DOMParser({
      errorHandler: {
        warning: () => {},
        error: () => {},
        fatalError: (msg) => { console.warn("DOMParser Fatal Error:", msg); }
      }
    });
    
    const doc = parser.parseFromString(response.data, "text/html");
    const nodes = xpath.select(query, doc);
    
    if (Array.isArray(nodes)) {
      return nodes.map((n: any) => n.toString());
    }
    return [nodes.toString()];
  }
};
