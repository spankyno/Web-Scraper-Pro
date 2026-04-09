import axios from "axios";
import * as cheerio from "cheerio";
import { GoogleGenAI, Type } from "@google/genai";
import { DOMParser } from "xmldom";
import xpath from "xpath";
import { extractPriceSmart, extractAllVariants } from "./price-extractor.js";

const getEnv = (key: string) => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) {}
  return "";
};

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

// Standard browser-like headers
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  'Referer': 'https://www.google.com/',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

export const engines = {
  "fetch-light": async (url: string) => {
    const response = await fetchWithRetry(url, {
      headers: BROWSER_HEADERS,
      timeout: 20000
    });

    const smartPrice = await extractPriceSmart(response.data, url);
    const variantData = await extractAllVariants(response.data);
    const $ = cheerio.load(response.data);

    return {
      html: response.data.substring(0, 2000),
      title: $("title").text().trim(),
      price: smartPrice.price,
      currency: smartPrice.currency,
      confidence: smartPrice.confidence,
      method: smartPrice.method,
      variants: variantData.variants,
      variantsSource: variantData.source,
      url
    };
  },
  "cheerio": async (url: string) => {
    const response = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: 15000
    });

    const smartPrice = await extractPriceSmart(response.data, url);
    const variantData = await extractAllVariants(response.data);
    const $ = cheerio.load(response.data);

    return {
      title: $("title").text().trim(),
      h1: $("h1").first().text().trim(),
      price: smartPrice,
      variants: variantData.variants,
      variantsSource: variantData.source,
      rawHtmlSnippet: response.data.substring(0, 1000)
    };
  },
  "gemini-ai": async (url: string, instruction: string, html?: string) => {
    let cleanHtml = "";
    let rawHtml = "";

    if (html) {
      rawHtml = html;
      const $ = cheerio.load(html);
      $('script, style, noscript, iframe, svg, canvas').remove();
      cleanHtml = $('body').html()?.substring(0, 45000) || html.substring(0, 40000);
    } else {
      const response = await axios.get(url, {
        headers: BROWSER_HEADERS,
        timeout: 20000
      });
      rawHtml = response.data;
      const $ = cheerio.load(response.data);
      $('script, style, noscript, iframe, svg, canvas').remove();
      cleanHtml = $('body').html()?.substring(0, 45000) || response.data.substring(0, 40000);
    }

    // Also try to extract variants from raw HTML before sending to AI
    const variantData = await extractAllVariants(rawHtml);

    const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

    const prompt = `Extrae SOLO el precio actual del producto de esta página.
Devuelve ÚNICAMENTE un JSON válido con esta estructura exacta:
{
  "price": 49.99,
  "currency": "EUR",
  "title": "...",
  "confidence": 85
}
Si no ves precio claro, devuelve confidence: 0. HTML (primeros 45.000 caracteres limpios):
${cleanHtml}`;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        temperature: 0,
        maxOutputTokens: 300,
        responseMimeType: "application/json"
      }
    });

    const text = result.text;
    try {
      if (!text) throw new Error("Empty response from AI");
      const parsed = JSON.parse(text);
      return {
        ...parsed,
        variants: variantData.variants,
        variantsSource: variantData.source,
      };
    } catch (e) {
      console.error("Gemini Parse Error:", text);
      return { error: "Failed to parse AI response", raw: text };
    }
  },
  "playwright": async (url: string) => {
    const apiKey = getEnv("BROWSERLESS_API_KEY");
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
      scripts: [
        // Extract price
        `window.__PRICE__ = document.querySelector('[data-price]')?.innerText || 
                 document.querySelector('.price')?.innerText || null;`,
        // Extract variants from page state (Shopify / generic)
        `(function() {
          try {
            // Shopify
            if (window.ShopifyAnalytics?.meta?.product?.variants) {
              window.__VARIANTS__ = window.ShopifyAnalytics.meta.product.variants.map(v => ({
                name: [v.option1, v.option2, v.option3].filter(Boolean).join(' / ') || v.title,
                price: v.price > 1000 ? v.price / 100 : v.price,
                currency: 'EUR',
                sku: v.sku
              }));
              return;
            }
            // Generic: look for a global variants array
            const keys = ['__INITIAL_STATE__', '__STATE__', 'pageData', 'productData'];
            for (const k of keys) {
              const obj = window[k];
              if (!obj) continue;
              const str = JSON.stringify(obj);
              const m = str.match(/"variants":\s*(\[.+?\])/);
              if (m) { window.__VARIANTS__ = JSON.parse(m[1]); return; }
            }
          } catch(e) {}
        })()`
      ]
    }, { timeout: 45000 });

    const html = response.data.data;
    const smartPrice = await extractPriceSmart(html, url);
    const variantData = await extractAllVariants(html);

    return {
      ...response.data,
      price: smartPrice.price,
      currency: smartPrice.currency,
      confidence: smartPrice.confidence,
      method: smartPrice.method,
      variants: variantData.variants,
      variantsSource: variantData.source,
      html: html.substring(0, 2000)
    };
  },
  "importxml": async (url: string, query: string) => {
    if (!query) throw new Error("XPath expression unspecified. Please provide a query.");

    const response = await axios.get(url, {
      headers: BROWSER_HEADERS
    });

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
