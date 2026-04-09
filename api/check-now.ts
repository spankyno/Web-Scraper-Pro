import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from './lib/supabase.js';
import { scrapeUrl, findVariantPrice } from './lib/scraper-service.js';
import { sendPriceAlert } from './lib/notifications.js';
import { authenticateToken } from './lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await authenticateToken(req as any, res as any);
  if (!auth.success) {
    return res.status(auth.status || 401).json({ success: false, error: auth.error });
  }

  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ success: false, error: "Item ID is required" });
  }

  try {
    // 1. Get item
    const { data: item, error: fetchError } = await supabase
      .from("monitored_items")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !item) {
      return res.status(404).json({ success: false, error: "Item not found" });
    }

    // 2. Scrape
    const result = await scrapeUrl(item.url, item.method || 'fetch-light');
    
    let currentPrice = result.price || 0;

    // Check if we need to find a specific variant
    if (item.price_selector && result.variants && result.variants.length > 0) {
      const variantPrice = findVariantPrice(result.variants, item.price_selector);
      if (variantPrice) {
        console.log(`Found variant price for ${item.price_selector}: ${variantPrice}`);
        currentPrice = variantPrice;
      }
    }

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
      price_confidence: result.confidence,
      price_extraction_method: result.method,
      last_error: null
    };

    const { error: updateError } = await supabase
      .from("monitored_items")
      .update(updatePayload)
      .eq("id", id);

    if (updateError) throw updateError;

    return res.status(200).json({ success: true, price: currentPrice, notified: shouldNotify });
  } catch (error: any) {
    console.error(`Check Item Error [${id}]:`, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
