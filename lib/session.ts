// lib/session.ts
// Helper para obtener el userId del usuario autenticado en Route Handlers.
// Usa @supabase/ssr para leer las cookies correctamente.

import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ?? ''

/**
 * Devuelve el userId del usuario autenticado leyendo las cookies de la request,
 * o null si no hay sesión válida.
 *
 * Para usar en Route Handlers (app/api/...).
 */
export async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
  // Creamos una response temporal para que @supabase/ssr pueda escribir cookies
  // si necesita refrescar el token (el resultado de setAll se descarta aquí,
  // pero getUser() funciona igualmente con el token de la cookie de entrada).
  const res = new NextResponse()

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options)
        )
      },
    },
  })

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user.id
}
