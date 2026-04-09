// api/lib/price-extractor.ts
import * as cheerio from "cheerio";

export async function extractPriceSmart(html: string, url: string): Promise<{
  price: number | null;
  currency: string;
  confidence: number;
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
    const items = data["@graph"] ? data["@graph"] : [data];
    for (const item of items) {
      const offersRaw = item.offers;
      const offer = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw;
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

  // 3. Selectores ultra-comunes
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
  const priceRegex = /(?<!\d)(?:\€|\$|USD|EUR)?\s*(\d{1,6}(?:[.,]\d{2}))\b/g;
  const matches = [...html.matchAll(priceRegex)];
  if (matches.length) {
    const candidate = parseFloat(matches[0][1].replace(',', '.'));
    if (!isNaN(candidate)) {
      return { price: candidate, currency: "EUR", confidence: 50, method: "regex" };
    }
  }

  return { price: null, currency: "", confidence: 0, method: "failed" };
}

// ─── NEW: Extract all product variants with their prices ─────────────────────
export async function extractAllVariants(html: string): Promise<{
  variants: Array<{ name: string; price: number; currency: string; sku?: string }>;
  source: string;
}> {
  const $ = cheerio.load(html);
  const variants: Array<{ name: string; price: number; currency: string; sku?: string }> = [];

  // 1. JSON-LD with multiple offers
  const jsonLdScripts = $('script[type="application/ld+json"]').get();
  for (const script of jsonLdScripts) {
    try {
      const raw = $(script).html() || '{}';
      const data = JSON.parse(raw);
      const items = data['@graph'] ? data['@graph'] : [data];
      for (const item of items) {
        const offersRaw = item.offers;
        const offers = Array.isArray(offersRaw) ? offersRaw : (offersRaw ? [offersRaw] : []);
        if (offers.length > 1) {
          for (const offer of offers) {
            const rawPrice = offer.price ?? offer.priceSpecification?.price;
            const price = typeof rawPrice === 'string'
              ? parseFloat(rawPrice.replace(',', '.'))
              : rawPrice;
            if (price && !isNaN(price)) {
              variants.push({
                name: offer.name || offer.sku || offer.description || 'Variante',
                price,
                currency: offer.priceCurrency || 'EUR',
                sku: offer.sku
              });
            }
          }
          if (variants.length) return { variants, source: 'json-ld-offers' };
        }
      }
    } catch { /* continue */ }
  }

  // 2. Inline scripts — Shopify, WooCommerce, Next.js, generic patterns
  const allScripts = $('script:not([src]):not([type="application/ld+json"])')
    .map((_, el) => $(el).html() || '')
    .get()
    .join('\n');

  // --- Shopify
  const shopifyPatterns = [
    /var\s+meta\s*=\s*(\{[\s\S]*?"variants"[\s\S]*?\})\s*;/,
    /window\.ShopifyAnalytics\.meta\s*=\s*(\{[\s\S]*?"variants"[\s\S]*?\})\s*;/,
    /"variants"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
  ];
  for (const pattern of shopifyPatterns) {
    const match = allScripts.match(pattern);
    if (match) {
      try {
        let parsed: any;
        try { parsed = JSON.parse(match[1]); } catch {
          parsed = JSON.parse(`{"variants":${match[1]}}`);
          parsed = parsed.variants;
        }
        const variantList = Array.isArray(parsed) ? parsed : parsed?.variants;
        if (Array.isArray(variantList)) {
          for (const v of variantList) {
            const rawPrice = v.price ?? v.price_min;
            if (rawPrice == null) continue;
            const price = typeof rawPrice === 'number' && rawPrice > 1000
              ? rawPrice / 100
              : rawPrice;
            const title = [v.option1, v.option2, v.option3].filter(Boolean).join(' / ') || v.title || 'Variante';
            variants.push({ name: title, price, currency: v.currency || 'EUR', sku: v.sku });
          }
          if (variants.length) return { variants, source: 'shopify' };
        }
      } catch { /* continue */ }
    }
  }

  // --- WooCommerce
  const wooPatterns = [
    /wc_product_block_data\s*=\s*(\{[\s\S]*?\})\s*;/,
    /"variations"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
  ];
  for (const pattern of wooPatterns) {
    const match = allScripts.match(pattern);
    if (match) {
      try {
        let parsed: any = JSON.parse(match[1]);
        const variantList = Array.isArray(parsed) ? parsed : parsed?.variations;
        if (Array.isArray(variantList)) {
          for (const v of variantList) {
            const price = parseFloat(String(v.display_price || v.price || '0').replace(',', '.'));
            if (isNaN(price) || price === 0) continue;
            const attrs = v.attributes ? Object.values(v.attributes).filter(Boolean).join(' / ') : '';
            variants.push({ name: attrs || `Variante ${v.variation_id || ''}`, price, currency: 'EUR', sku: String(v.variation_id || '') });
          }
          if (variants.length) return { variants, source: 'woocommerce' };
        }
      } catch { /* continue */ }
    }
  }

  // --- Next.js __NEXT_DATA__
  const nextDataEl = $('script#__NEXT_DATA__').html();
  if (nextDataEl) {
    try {
      const nextData = JSON.parse(nextDataEl);
      const variantList = deepFind(nextData, 'variants') || deepFind(nextData, 'skus');
      if (Array.isArray(variantList) && variantList.length > 1) {
        for (const v of variantList) {
          const price = parseFloat(String(v.price || v.salePrice || v.currentPrice || '0').replace(',', '.'));
          if (isNaN(price) || price === 0) continue;
          const name = v.title || v.name || v.sku || v.color || v.size || 'Variante';
          variants.push({ name, price, currency: v.currency || 'EUR', sku: v.sku || v.id });
        }
        if (variants.length) return { variants, source: 'next-data' };
      }
    } catch { /* continue */ }
  }

  // --- Generic __INITIAL_STATE__ / window.__STATE__
  const statePatterns = [
    /__INITIAL_STATE__\s*=\s*(\{[\s\S]{0,200000}\})\s*(?:;|<)/,
    /window\.__STATE__\s*=\s*(\{[\s\S]{0,200000}\})\s*;/,
    /window\.__data__\s*=\s*(\{[\s\S]{0,200000}\})\s*;/,
  ];
  for (const pattern of statePatterns) {
    const match = allScripts.match(pattern);
    if (match) {
      try {
        const state = JSON.parse(match[1]);
        const variantList = deepFind(state, 'variants') || deepFind(state, 'skus') || deepFind(state, 'options');
        if (Array.isArray(variantList) && variantList.length > 1) {
          for (const v of variantList) {
            const price = parseFloat(String(v.price || v.salePrice || v.currentPrice || '0').replace(',', '.'));
            if (isNaN(price) || price === 0) continue;
            variants.push({ name: v.title || v.name || v.label || 'Variante', price, currency: 'EUR', sku: v.sku || v.id });
          }
          if (variants.length) return { variants, source: 'initial-state' };
        }
      } catch { /* continue */ }
    }
  }

  return { variants: [], source: 'none' };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parsePrice(text: string): number | null {
  if (!text) return null;
  const clean = text.replace(/[^\d.,]/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

function detectCurrency(text: string): string {
  if (text.includes('€') || text.includes('EUR')) return 'EUR';
  if (text.includes('$') || text.includes('USD')) return 'USD';
  return 'EUR';
}

function deepFind(obj: any, key: string, depth = 0): any[] | null {
  if (depth > 6 || obj === null || typeof obj !== 'object') return null;
  if (key in obj && Array.isArray(obj[key]) && obj[key].length > 0) return obj[key];
  for (const v of Object.values(obj)) {
    const found = deepFind(v, key, depth + 1);
    if (found) return found;
  }
  return null;
}
