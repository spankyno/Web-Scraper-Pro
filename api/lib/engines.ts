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
      '.price', '#price', '.current-price', '.amount', '.product-price',
      '[class*="price"]', '[id*="price"]', 
      'meta[property="product:price:amount"]', 'meta[name="twitter:data1"]'
    ];
    
    for (const selector of priceSelectors) {
      const el = $(selector);
      if (el.length > 0) {
        if (selector.startsWith('meta')) {
          price = el.attr('content') || "";
        } else {
          // Filter out elements that might contain multiple prices or noise
          const text = el.first().text().trim();
          if (text && /[\d]/.test(text)) {
            price = text;
          }
        }
        if (price) break;
      }
    }

    return { 
      html: response.data.substring(0, 2000), 
      title: $("title").text().trim(),
      price: price || "Not found automatically",
      url
    };
  },
  "cheerio": async (url: string) => {
    const response = await axios.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' 
      },
      timeout: 15000
    });
    const $ = cheerio.load(response.data);
    const result: any = {
      title: $("title").text().trim(),
      h1: $("h1").first().text().trim(),
    };

    // Try to find price in common locations
    const priceSelectors = ['.price', '#price', '.current-price', '.amount', '[class*="price"]'];
    priceSelectors.forEach(sel => {
      const text = $(sel).first().text().trim();
      if (text && /[\d]/.test(text)) {
        result[sel.replace(/[.#\[\]*="]/g, '')] = text;
      }
    });

    return result;
  },
  "gemini-ai": async (url: string, instruction: string) => {
    const response = await axios.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' 
      },
      timeout: 20000
    });
    
    // Clean HTML to fit more content
    const $ = cheerio.load(response.data);
    $('script, style, noscript, iframe').remove();
    const cleanHtml = $('body').html()?.substring(0, 50000) || response.data.substring(0, 40000);
    
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const model = (ai as any).getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Extract data from this HTML based on these instructions: ${instruction}
    Return ONLY a JSON object where keys are the field names and values are the extracted data.
    If multiple items are requested, return an object with descriptive keys.
    
    HTML:
    ${cleanHtml}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    try {
      // Clean potential markdown code blocks
      const jsonStr = text.replace(/```json\n?|```/g, '').trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Gemini Parse Error:", text);
      return { error: "Failed to parse AI response", raw: text };
    }
  },
  "playwright": async (url: string) => {
    const apiKey = process.env.BROWSERLESS_API_KEY;
    if (!apiKey) throw new Error("BROWSERLESS_API_KEY not configured");
    
    // Clean URL to avoid issues with some sites
    const cleanUrl = url.split('?')[0];

    const response = await axios.post(`https://chrome.browserless.io/content?token=${apiKey}`, {
      url: cleanUrl,
      gotoOptions: { waitUntil: "networkidle2", timeout: 30000 },
      setExtraHTTPHeaders: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Referer': 'https://www.google.com/'
      },
      elements: [
        { selector: "title" },
        { selector: "h1" },
        { selector: ".price" },
        { selector: "#price" },
        { selector: '[class*="price"]' },
        { selector: '.current-price' }
      ]
    });
    return response.data;
  },
  "importxml": async (url: string, query: string) => {
    if (!query) throw new Error("XPath expression unspecified. Please provide a query.");
    
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
