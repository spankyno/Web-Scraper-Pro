// app/api/cron/route.ts
// GET /api/cron — verificación diaria de precios
//
// VERCEL HOBBY: máximo 1 ejecución/día → "30 12 * * *" en vercel.json
// El worker de Cloudflare (web-scraper-pro.kbo1.workers.dev/run-cron)
// puede llamarlo con más frecuencia enviando Authorization: Bearer CRON_SECRET
//
// Columnas reales de monitored_items:
//   is_active, price_current, price_previous, check_interval ('1h'/'6h'/'24h'),
//   notification_channel ('telegram'|'email'|'both'|'none'),
//   threshold (%), alert_price (€ absoluto), title, next_check, last_checked,
//   status ('stable'|'price_drop'|'price_rise'|'out_of_stock'|'error'),
//   price_selector, method, last_error, pricecurrency

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { scrape } from '@/lib/scrapers/hybrid'
import { sendTelegramAlert } from '@/lib/telegram'
import type { MonitoredItem, ScrapingMethod } from '@/types'

// Hobby plan: sin maxDuration > 10s en Serverless Functions
// Usamos Edge si queremos más tiempo, pero con Node para cheerio/puppeteer
export const runtime = 'nodejs'
// Pro plan admite 60s; Hobby admite 10s — ajusta según tu plan
export const maxDuration = 10

interface CronResult {
  checked: number
  alerts: number
  skipped: number
  errors: string[]
}

// ── Helpers de intervalo ─────────────────────────────────────────────────────
function intervalToMs(interval: string): number {
  const map: Record<string, number> = {
    '1h':  1  * 60 * 60 * 1000,
    '6h':  6  * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '48h': 48 * 60 * 60 * 1000,
  }
  return map[interval] ?? 24 * 60 * 60 * 1000   // default 24h
}

function nextCheckDate(interval: string): string {
  return new Date(Date.now() + intervalToMs(interval)).toISOString()
}

// ── Lógica de alerta ─────────────────────────────────────────────────────────
function shouldAlert(item: MonitoredItem, newPrice: number): boolean {
  const prev = item.price_current ?? item.pricecurrent ?? 0
  if (!prev || prev === 0) return false

  const pct = ((newPrice - prev) / prev) * 100

  // Alerta por umbral porcentual (bajada)
  if (item.threshold > 0 && pct <= -item.threshold) return true

  // Alerta por precio objetivo absoluto
  if (item.alert_price != null && newPrice <= item.alert_price && prev > item.alert_price) return true

  return false
}

function calcStatus(prev: number, current: number, inStock: boolean): string {
  if (!inStock) return 'out_of_stock'
  if (!prev || prev === 0) return 'stable'
  const pct = ((current - prev) / prev) * 100
  if (pct <= -0.5) return 'price_drop'
  if (pct >= 0.5)  return 'price_rise'
  return 'stable'
}

// ── Handler principal ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Autenticación: Vercel inyecta x-vercel-cron=1; Cloudflare envía Bearer token
  const isVercelCron   = req.headers.get('x-vercel-cron') === '1'
  const isCloudflare   = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`

  if (!isVercelCron && !isCloudflare) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const now = new Date().toISOString()
  const result: CronResult = { checked: 0, alerts: 0, skipped: 0, errors: [] }

  // Obtener items activos cuyo next_check ya pasó
  // Hobby: el cron corre 1 vez/día → selecciona TODOS los activos ese día
  // Cloudflare puede llamar más a menudo y solo procesará los que toca según next_check
  const { data: items, error: fetchError } = await supabaseAdmin
    .from('monitored_items')
    .select('*')
    .eq('is_active', true)
    .lte('next_check', now)
    .order('next_check', { ascending: true })
    .limit(30)   // máx 30 para no superar el timeout de Hobby (10s)

  if (fetchError) {
    console.error('[cron] Error fetch:', fetchError.message)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!items?.length) {
    return NextResponse.json({ ...result, message: 'Nada que verificar' })
  }

  console.log(`[cron] ${items.length} items a verificar`)

  for (const raw of items) {
    const item = raw as MonitoredItem

    try {
      // ── Scraping ────────────────────────────────────────────────
      const scrapeResult = await scrape({
        url:      item.url,
        method:   (item.method ?? 'fetch-light') as ScrapingMethod,
        selector: item.price_selector ?? undefined,
      })

      const newPrice = scrapeResult.price
      const inStock  = scrapeResult.inStock ?? true
      const prevPrice = item.price_current ?? item.pricecurrent ?? 0
      const newStatus = newPrice != null
        ? calcStatus(prevPrice, newPrice, inStock)
        : 'error'

      // ── Guardar en price_history (si existe la tabla) ───────────
      if (newPrice != null) {
        await supabaseAdmin.from('price_history').insert({
          item_id:    item.id,
          price:      newPrice,
          in_stock:   inStock,
          scraped_at: now,
        }).throwOnError()
      }

      // ── Actualizar monitored_item ───────────────────────────────
      await supabaseAdmin
        .from('monitored_items')
        .update({
          price_previous:   prevPrice,
          price_current:    newPrice ?? prevPrice,
          // Sync columnas legacy por si el cron de Cloudflare las usa
          priceprevious:    prevPrice,
          pricecurrent:     newPrice ?? prevPrice,
          status:           newStatus,
          is_active:        true,
          last_checked:     now,
          lastchecked:      now,
          next_check:       nextCheckDate(item.check_interval ?? '24h'),
          last_error:       scrapeResult.error ?? null,
          price_extraction_method: scrapeResult.method,
          price_confidence: scrapeResult.price != null ? 90 : 0,
        })
        .eq('id', item.id)

      // ── Alerta ──────────────────────────────────────────────────
      if (newPrice != null && shouldAlert(item, newPrice)) {
        const pct = prevPrice
          ? ((newPrice - prevPrice) / prevPrice) * 100
          : 0

        const comparison = {
          direction: pct < 0 ? 'down' as const : 'up' as const,
          diffAbsolute: newPrice - prevPrice,
          diffPercent:  pct,
          shouldAlert:  true,
        }

        const channel = item.notification_channel ?? 'telegram'

        if (channel === 'telegram' || channel === 'both') {
          await sendTelegramAlert(item, comparison, newPrice)
        }
        // Email: añadir SendGrid/Resend aquí cuando esté listo
        if (channel === 'email' || channel === 'both') {
          console.log(`[cron] email pendiente → ${item.title ?? item.url}`)
        }

        result.alerts++
        console.log(`[cron] Alerta "${item.title}": ${prevPrice} → ${newPrice} (${pct.toFixed(1)}%)`)
      }

      result.checked++

    } catch (err) {
      const msg = `${item.title ?? item.url}: ${(err as Error).message}`
      console.error('[cron]', msg)
      result.errors.push(msg)

      // Postponer next_check para no bloquear este item para siempre
      await supabaseAdmin
        .from('monitored_items')
        .update({
          next_check:  nextCheckDate('24h'),
          last_error:  (err as Error).message.slice(0, 500),
          status:      'error',
        })
        .eq('id', item.id)
    }
  }

  console.log(`[cron] OK — checked:${result.checked} alerts:${result.alerts} errors:${result.errors.length}`)
  return NextResponse.json(result)
}
