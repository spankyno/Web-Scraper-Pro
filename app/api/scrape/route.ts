// app/api/scrape/route.ts
// POST /api/scrape
// Columnas reales de scrape_jobs: id, user_id, url, method, result (jsonb), duration, created_at
// Sin: status, rows_count, duration_ms, error_msg

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { scrape, suggestMethod } from '@/lib/scrapers/hybrid'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAnonLimit } from '@/lib/rateLimiter'
import type { ScrapeRequest } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body: ScrapeRequest = await req.json()
    const { url, method, selector, aiInstruction } = body

    if (!url || !URL.canParse(url)) {
      return NextResponse.json({ error: 'URL inválida' }, { status: 400 })
    }

    // ── Auth ──────────────────────────────────────────────────────
    const session = await getServerSession(authOptions)
    const userId  = (session?.user as { id?: string })?.id ?? null

    // ── Rate limit anónimos ───────────────────────────────────────
    if (!userId) {
      const ip = req.headers.get('x-client-ip')      // puesto por middleware
        ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? '0.0.0.0'

      const limit = await checkAnonLimit(ip)

      if (!limit.allowed) {
        return NextResponse.json(
          {
            error: 'Límite de extracciones alcanzado',
            resetAt: limit.resetAt,
            message: 'Regístrate gratis para extracciones ilimitadas',
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': limit.resetAt,
            },
          },
        )
      }
    }

    // ── Ejecutar scraping ─────────────────────────────────────────
    const t0 = Date.now()
    const result = await scrape({
      url,
      method: method ?? 'hybrid',
      selector,
      aiInstruction,
    })
    const duration = Date.now() - t0

    // ── Guardar job en scrape_jobs ────────────────────────────────
    // Columnas reales: url, method, result (jsonb), duration, user_id
    const { data: job } = await supabaseAdmin
      .from('scrape_jobs')
      .insert({
        user_id:  userId,
        url,
        method:   result.method,       // método que realmente se usó
        duration,
        result: {
          price:              result.price,
          price_text:         String(result.price ?? ''),
          product_name:       result.productName ?? null,
          in_stock:           result.inStock ?? true,
          currency:           result.currency ?? 'EUR',
          confidence:         result.price != null ? 90 : 0,
          extraction_method:  result.method,
          data:               result.data,
          error:              result.error ?? null,
        },
      })
      .select('id')
      .single()

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'Extracción fallida' },
        { status: 422 },
      )
    }

    return NextResponse.json({
      jobId:           job?.id ?? null,
      url:             result.url,
      method:          result.method,
      data:            result.data,
      price:           result.price,
      productName:     result.productName,
      inStock:         result.inStock,
      currency:        result.currency,
      durationMs:      duration,
      suggestedMethod: suggestMethod(url),
    })

  } catch (err) {
    console.error('[/api/scrape]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
