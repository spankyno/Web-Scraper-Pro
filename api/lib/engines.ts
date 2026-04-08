import axios from "axios";
import * as cheerio from "cheerio";
import { GoogleGenAI, Type } from "@google/genai";
import { DOMParser } from "xmldom";
import xpath from "xpath";
import { extractPriceSmart } from "./price-extractor";

// Helper for retries
const fetchWithRetry = async (url: string, options: any, retries = 1, delay = 800) => {
  try {
    return await axios.get(url, options);
  } catch (err) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return await axios.get(url, options);
    }
    throw err;
  }
};

export const engines = {
  "fetch-light": async (url: string) => {
    const response = await fetchWithRetry(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Referer': 'https://www.google.com/',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      timeout: 20000
    });
    
    const smartPrice = await extractPriceSmart(response.data, url);
    const $ = cheerio.load(response.data);

    return { 
      html: response.data.substring(0, 2000), 
      title: $("title").text().trim(),
      price: smartPrice.price,
      currency: smartPrice.currency,
      confidence: smartPrice.confidence,
      method: smartPrice.method,
      url
    };
  },
  "cheerio": async (url: string) => {
    const response = await axios.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://www.google.com/',
      },
      timeout: 15000
    });
    
    const smartPrice = await extractPriceSmart(response.data, url);
    const $ = cheerio.load(response.data);
    
    return {
      title: $("title").text().trim(),
      h1: $("h1").first().text().trim(),
      price: smartPrice,
      rawHtmlSnippet: response.data.substring(0, 1000)
    };
  },
  "gemini-ai": async (url: string, instruction: string) => {
    const response = await axios.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' 
      },
      timeout: 20000
    });
    
    // Clean HTML even more
    const $ = cheerio.load(response.data);
    $('script, style, noscript, iframe, svg, canvas').remove();
    const cleanHtml = $('body').html()?.substring(0, 45000) || response.data.substring(0, 40000);
    
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const model = (ai as any).getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 300,
      }
    });

    const prompt = `Extrae SOLO el precio actual del producto de esta página.
Devuelve ÚNICAMENTE un JSON válido con esta estructura exacta:
{
  "price": 49.99,
  "currency": "EUR",
  "title": "...",
  "confidence": 85
}
Si no ves precio claro, usa la función extractPriceSmart que ya está en el backend. HTML (primeros 45.000 caracteres limpios):
${cleanHtml}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    try {
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
    
    const cleanUrl = url.split('?')[0];

    const response = await axios.post(`https://chrome.browserless.io/scrape?token=${apiKey}`, {
      url: cleanUrl,
      waitFor: 8000,
      elements: [
        { selector: "title" },
        { selector: "h1" },
        { selector: ".price" },
        { selector: "#price" },
        { selector: '[class*="price"]' },
        { selector: '.current-price' }
      ],
      scripts: [`window.__PRICE__ = document.querySelector('[data-price]')?.innerText || 
                 document.querySelector('.price')?.innerText || null;`]
    }, { timeout: 45000 });
    
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
