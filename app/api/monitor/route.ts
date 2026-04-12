// app/api/monitor/route.ts — adaptada al esquema real de Supabase
// Columnas reales: price_current, price_previous, is_active, last_checked,
// next_check, check_interval ('1h'), notification_channel, custom_selectors (jsonb),
// threshold, alert_price, method, price_selector, title, status, image_url

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

async function getUserId(req: NextRequest): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return (session?.user as { id?: string })?.id ?? null
}

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

export async function POST(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const body = await req.json()
  const { title, url, price_selector, method = 'fetch-light', threshold = 0,
    alert_price = null, check_interval = '6h', notification_channel = 'telegram',
    custom_selectors = [] } = body
  if (!url) return NextResponse.json({ error: 'Falta url' }, { status: 400 })
  if (!title) return NextResponse.json({ error: 'Falta title' }, { status: 400 })
  const { count } = await supabaseAdmin
    .from('monitored_items').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('is_active', true)
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('plan').eq('id', userId).single()
  if (profile?.plan === 'free' && (count ?? 0) >= 3) {
    return NextResponse.json({ error: 'Plan free: máximo 3 items activos. Actualiza a Pro.' }, { status: 403 })
  }
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('monitored_items')
    .insert({ user_id: userId, title, url, price_selector: price_selector || null, method,
      threshold: Number(threshold), alert_price: alert_price ? Number(alert_price) : null,
      check_interval, notification_channel, custom_selectors, is_active: true,
      status: 'stable', price_current: 0, price_previous: 0, pricecurrency: 'EUR',
      last_checked: now, next_check: now })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 201 })
}

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
