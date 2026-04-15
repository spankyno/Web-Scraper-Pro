// middleware.ts
// 1. Páginas privadas (/dashboard, /settings…) → redirige a /login si no hay sesión
// 2. Páginas de auth (/login, /signup…)        → redirige a /dashboard si ya hay sesión
// 3. /api/scrape sin sesión                     → añade IP real y delega rate-limit al handler
// 4. /api/monitor sin sesión                    → 401 directamente
//
// Autenticación: Supabase nativo (sin NextAuth)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ?? ''

const PRIVATE_PAGES = ['/dashboard', '/settings', '/profile']
const AUTH_PAGES    = ['/login', '/signup', '/forgot-password', '/reset-password']

async function getSessionUserId(req: NextRequest): Promise<string | null> {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const accessToken  = extractSupabaseToken(cookieHeader)
  if (!accessToken) return null

  try {
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return null
    return user.id
  } catch {
    return null
  }
}

function extractSupabaseToken(cookieStr: string): string | null {
  const cookies = Object.fromEntries(
    cookieStr.split(';').map(c => {
      const [k, ...v] = c.trim().split('=')
      return [k.trim(), decodeURIComponent(v.join('='))]
    })
  )
  for (const [key, value] of Object.entries(cookies)) {
    if (key.includes('auth-token') || key === 'supabase-auth-token') {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed) && parsed[0]) return parsed[0]
        if (parsed?.access_token) return parsed.access_token
      } catch {
        if (value && !value.includes(' ')) return value
      }
    }
  }
  return null
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Páginas privadas → redirigir a login si no hay sesión ────
  if (PRIVATE_PAGES.some(p => pathname.startsWith(p))) {
    const userId = await getSessionUserId(req)
    if (!userId) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  // ── Páginas de auth → redirigir a dashboard si ya hay sesión ─
  if (AUTH_PAGES.some(p => pathname.startsWith(p))) {
    const userId = await getSessionUserId(req)
    if (userId) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  // ── /api/monitor → requiere sesión ───────────────────────────
  if (pathname.startsWith('/api/monitor')) {
    const userId = await getSessionUserId(req)
    if (!userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    return NextResponse.next()
  }

  // ── /api/scrape → añadir IP real para el rate limiter ────────
  if (pathname.startsWith('/api/scrape')) {
    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      '0.0.0.0'
    const res = NextResponse.next()
    res.headers.set('x-client-ip', ip)
    return res
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/settings/:path*',
    '/profile/:path*',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/api/scrape',
    '/api/monitor/:path*',
  ],
}
