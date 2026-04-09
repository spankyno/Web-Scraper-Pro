import { engines } from './engines.js';
import { extractPriceSmart, extractAllVariants } from './price-extractor.js';

const ANTIBOT_DOMAINS = [
  'pccomponentes.com',
  'carrefour.es',
  'mediamarkt.es',
  'elcorteingles.es',
  'amazon.es',
  'amazon.com',
  'zara.com',
  'nike.com',
  'adidas.es'
];

export function requiresBrowser(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return ANTIBOT_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export async function scrapeUrl(url: string, method: string = 'fetch-light', query?: string) {
  let effectiveMethod = method;
  let antibotOverride = false;

  if (requiresBrowser(url) && method !== 'playwright') {
    if (process.env.BROWSERLESS_API_KEY) {
      effectiveMethod = 'playwright';
      antibotOverride = true;
      console.log(`Anti-bot domain detected (${new URL(url).hostname}), overriding method to playwright`);
    }
  }

  const executeScrape = async (m: string, htmlContext?: string) => {
    if (m === "fetch-light") return await (engines as any)["fetch-light"](url);
    if (m === "cheerio") return await (engines as any)["cheerio"](url);
    if (m === "gemini-ai") {
      if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
      return await (engines as any)["gemini-ai"](url, "Extract current price and product title", htmlContext);
    }
    if (m === "playwright") {
      if (!process.env.BROWSERLESS_API_KEY) throw new Error("BROWSERLESS_API_KEY not configured");
      return await (engines as any)["playwright"](url);
    }
    if (m === "importxml") return await (engines as any)["importxml"](url, query);
    throw new Error(`Method '${m}' not implemented.`);
  };

  try {
    let result = await executeScrape(effectiveMethod);

    // Fallback logic if confidence is low
    const needsFallback = (!result.price || (result.confidence && result.confidence < 60));

    if (needsFallback) {
      console.log(`Low confidence (${result.confidence}%) with ${effectiveMethod}. Trying Gemini fallback...`);
      try {
        const htmlContext = (effectiveMethod === 'playwright') ? result.data : undefined;
        
        if (requiresBrowser(url) && !htmlContext) {
           // Skip direct gemini-ai if it's an anti-bot domain and we don't have HTML yet
        } else {
          const fallbackResult = await executeScrape("gemini-ai", htmlContext);
          if (fallbackResult && fallbackResult.price) {
            result = { ...fallbackResult, fallback_from: effectiveMethod };
          }
        }
      } catch (geminiErr) {
        console.error("Gemini fallback failed", geminiErr);
      }
    }

    return {
      ...result,
      inStock: result.inStock ?? true,
      productImage: result.productImage || null,
      effectiveMethod,
      antibotOverride
    };
  } catch (error: any) {
    // If primary failed and it's an anti-bot domain, don't try axios-based fallbacks
    if (requiresBrowser(url)) {
      throw error;
    }

    if (effectiveMethod !== "gemini-ai") {
      try {
        const fallbackResult = await executeScrape("gemini-ai");
        return { 
          ...fallbackResult, 
          inStock: fallbackResult.inStock ?? true,
          productImage: fallbackResult.productImage || null,
          fallback_from: effectiveMethod, 
          effectiveMethod: "gemini-ai" 
        };
      } catch (e) {
        throw error;
      }
    } else {
      throw error;
    }
  }
}

export function findVariantPrice(variants: any[], selector: string): number | null {
  if (!variants || !selector) return null;
  
  // Try to find by SKU first
  const bySku = variants.find(v => v.sku === selector);
  if (bySku) return bySku.price;
  
  // Try to find by name
  const byName = variants.find(v => v.name === selector);
  if (byName) return byName.price;
  
  // Try partial match
  const partial = variants.find(v => v.name?.toLowerCase().includes(selector.toLowerCase()));
  if (partial) return partial.price;

  return null;
}
