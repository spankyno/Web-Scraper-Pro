// app/api/monitor/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { scrape } from '@/lib/scrapers/hybrid'
import type { ScrapingMethod } from '@/types'

async function getUserId(req: NextRequest): Promise<string | null> {
  const session = await getServerSession(authOptions).catch(() => null)
  return (session?.user as { id?: string })?.id ?? null
}

// ── GET ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data, error } = await supabaseAdmin
    .from('monitored_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

// ── POST ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const {
    title, url,
    price_selector    = null,
    method            = 'hybrid',
    threshold         = 0,
    alert_price       = null,
    check_interval    = '6h',
    notification_channel = 'telegram',
    custom_selectors  = [],
  } = body

  if (!url)   return NextResponse.json({ error: 'Falta url' }, { status: 400 })
  if (!title) return NextResponse.json({ error: 'Falta title' }, { status: 400 })

  // Límite plan free
  //const { count } = await supabaseAdmin
  //  .from('monitored_items').select('id', { count: 'exact', head: true })
  //  .eq('user_id', userId).eq('is_active', true)
  //const { data: profile } = await supabaseAdmin
  //  .from('profiles').select('plan').eq('id', userId).single()
  //if (profile?.plan === 'free' && (count ?? 0) >= 3) {
  //  return NextResponse.json({ error: 'Plan free: máximo 3 items activos.' }, { status: 403 })
  //}

  // ── Scrape inmediato para obtener el precio real ───────────
  let initialPrice = 0
  let initialStatus = 'stable'
  let initialInStock = true

  try {
    const scrapeResult = await scrape({
      url,
      method: method as ScrapingMethod,
      selector: price_selector ?? undefined,
    })
    if (scrapeResult.price != null) {
      initialPrice  = scrapeResult.price
      initialInStock = scrapeResult.inStock ?? true
      initialStatus  = initialInStock ? 'stable' : 'out_of_stock'
    }
  } catch (e) {
    console.warn('[monitor POST] scrape inicial falló:', (e as Error).message)
  }

  const now = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('monitored_items')
    .insert({
      user_id: userId, title, url,
      price_selector:      price_selector || null,
      method,
      threshold:           Number(threshold),
      alert_price:         alert_price ? Number(alert_price) : null,
      check_interval,
      notification_channel,
      custom_selectors,
      is_active:           true,
      status:              initialStatus,
      price_current:       initialPrice,
      price_previous:      initialPrice,   // mismo al crear
      pricecurrency:       'EUR',
      in_stock:            initialInStock,
      last_checked:        now,
      next_check:          now,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 201 })
}

// ── PATCH ─────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const body = await req.json()
  const EDITABLE = ['title','price_selector','method','threshold','alert_price',
    'check_interval','notification_channel','custom_selectors','is_active']
  const update: Record<string, unknown> = {}
  for (const key of EDITABLE) { if (key in body) update[key] = body[key] }
  if (!Object.keys(update).length) return NextResponse.json({ error: 'Sin campos válidos' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('monitored_items').update(update).eq('id', id).eq('user_id', userId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// ── DELETE ────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { error } = await supabaseAdmin
    .from('monitored_items').delete().eq('id', id).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
