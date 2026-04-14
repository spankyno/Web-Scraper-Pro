// app/api/profile/test-telegram/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { chatId } = await req.json()
  if (!chatId) return NextResponse.json({ error: 'Falta chatId' }, { status: 400 })

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return NextResponse.json({ error: 'Bot token no configurado' }, { status: 500 })

  const text = `✅ *WebScraper Pro* — Notificaciones configuradas correctamente\\. Recibirás alertas de precio en este chat\\.`

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2' }),
  })

  if (!res.ok) {
    const err = await res.json()
    return NextResponse.json({ error: err.description ?? 'Error Telegram' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
