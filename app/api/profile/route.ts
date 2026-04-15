// app/api/profile/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromRequest } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('telegram_chat_id, email_notif, name')
    .eq('id', userId)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ profile: data ?? {} })
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserIdFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const allowed = ['telegram_chat_id', 'email_notif', 'name']
  const update: Record<string, unknown> = {}
  for (const k of allowed) { if (k in body) update[k] = body[k] }

  if (!Object.keys(update).length) return NextResponse.json({ ok: true })

  const { error } = await supabaseAdmin
    .from('profiles')
    .upsert({ id: userId, ...update }, { onConflict: 'id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
