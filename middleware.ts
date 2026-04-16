// middleware.ts
// Autenticación con Supabase SSR (@supabase/ssr).
// IMPORTANTE: Este middleware refresca el token automáticamente y lo persiste
// en cookies, lo que garantiza que las rutas protegidas funcionen correctamente.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const supabaseUrl =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ?? ''

const PRIVATE_PAGES = ['/dashboard', '/settings', '/profile']
const AUTH_PAGES    = ['/login', '/signup', '/forgot-password', '/reset-password']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  let res = NextResponse.next({ request: req })

  // Crear cliente SSR que lee y escribe cookies en la response
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        // Escribir cookies en la request (para que el código siguiente las vea)
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
        // Re-crear la response con las cookies actualizadas
        res = NextResponse.next({ request: req })
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options)
        )
      },
    },
  })

  // Obtener usuario — esto también refresca el token si está expirado
  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  // ── Páginas privadas → redirigir a login si no hay sesión ────
  if (PRIVATE_PAGES.some(p => pathname.startsWith(p))) {
    if (!isLoggedIn) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return res
  }

  // ── Páginas de auth → redirigir a dashboard si ya hay sesión ─
  if (AUTH_PAGES.some(p => pathname.startsWith(p))) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return res
  }

  // ── /api/monitor → requiere sesión ───────────────────────────
  if (pathname.startsWith('/api/monitor')) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    return res
  }

  // ── /api/scrape → añadir IP real para el rate limiter ────────
  if (pathname.startsWith('/api/scrape')) {
    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      '0.0.0.0'
    res.headers.set('x-client-ip', ip)
    return res
  }

  return res
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
