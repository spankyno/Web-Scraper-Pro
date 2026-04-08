// api/lib/price-extractor.ts
import * as cheerio from "cheerio";

export async function extractPriceSmart(html: string, url: string): Promise<{
  price: number | null;
  currency: string;
  confidence: number; // 0-100
  method: string;
}> {
  const $ = cheerio.load(html);

  // 1. JSON-LD (el más fiable hoy en día)
  const jsonLd = $('script[type="application/ld+json"]').get()
    .map(script => {
      try { return JSON.parse($(script).html() || '{}'); } catch { return {}; }
    })
    .flatMap(obj => Array.isArray(obj) ? obj : [obj]);

  for (const data of jsonLd) {
    // Handle nested @graph or direct objects
    const items = data["@graph"] ? data["@graph"] : [data];
    for (const item of items) {
      const offer = item.offers || (Array.isArray(item.offers) ? item.offers[0] : null);
      if (offer?.price || offer?.priceSpecification?.price) {
        const val = offer.price || offer.priceSpecification?.price;
        return {
          price: typeof val === 'string' ? parsePrice(val) : val,
          currency: offer.priceCurrency || "EUR",
          confidence: 95,
          method: "json-ld"
        };
      }
    }
  }

  // 2. Meta tags + Open Graph + Twitter
  const metaPrice = $('meta[property*="price:amount"]').attr('content') || 
                   $('meta[name*="price"]').attr('content') || 
                   $('meta[itemprop*="price"]').attr('content');
  
  if (metaPrice) {
    const num = parsePrice(metaPrice);
    if (num) return { price: num, currency: "EUR", confidence: 80, method: "meta" };
  }

  // 3. Selectores ultra-comunes (ampliados)
  const selectors = [
    '[data-price]', '[data-product-price]', '[data-test="price"]', 
    '.price--current', '.product-price', '.price__current', 
    '[class*="price"] strong', '[class*="price"] span', 
    '#price', '.current-price', 'meta[property="product:price:amount"]'
  ];
  
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      const text = el.text().trim() || el.attr('content') || '';
      const num = parsePrice(text);
      if (num) return { price: num, currency: detectCurrency(text), confidence: 70, method: "selector" };
    }
  }

  // 4. Regex agresiva en todo el HTML (último recurso)
  // Buscamos patrones de precio comunes
  const priceRegex = /(?<!\d)(?:\€|\$|USD|EUR)?\s*(\d{1,6}(?:[.,]\d{2})?)\b/g;
  const matches = [...html.matchAll(priceRegex)];
  if (matches.length) {
    // Intentamos encontrar el que parezca más un precio (no el primero necesariamente, pero aquí simplificamos)
    const candidate = parseFloat(matches[0][1].replace(',', '.'));
    if (!isNaN(candidate)) {
      return { price: candidate, currency: "EUR", confidence: 50, method: "regex" };
    }
  }

  return { price: null, currency: "", confidence: 0, method: "failed" };
}

function parsePrice(text: string): number | null {
  if (!text) return null;
  // Remove currency symbols and spaces, handle comma as decimal separator
  const clean = text.replace(/[^\d.,]/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

function detectCurrency(text: string): string {
  if (text.includes('€') || text.includes('EUR')) return 'EUR';
  if (text.includes('$') || text.includes('USD')) return 'USD';
  return 'EUR';
}
