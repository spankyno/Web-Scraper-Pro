// lib/supabaseServer.ts
// Cliente Supabase para uso en Server Components y Route Handlers (App Router).
// Usa @supabase/ssr para leer y escribir cookies automáticamente.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseUrl =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ?? ''

/**
 * Crea un cliente Supabase que lee/escribe cookies de Next.js.
 * Usar en Server Components, Route Handlers y Server Actions.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // setAll puede lanzar en Server Components de solo lectura — se ignora
        }
      },
    },
  })
}

/**
 * Devuelve el userId del usuario autenticado, o null si no hay sesión.
 */
export async function getServerUserId(): Promise<string | null> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
