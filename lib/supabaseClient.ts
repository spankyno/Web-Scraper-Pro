// lib/supabaseClient.ts
// Cliente Supabase para componentes del navegador.
// Usa @supabase/ssr para sincronizar la sesión en cookies (no solo localStorage),
// de modo que el middleware y los Route Handlers puedan leerla sin problemas.

import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!supabaseUrl) console.error('[supabaseClient] Falta NEXT_PUBLIC_SUPABASE_URL')
if (!anonKey)     console.error('[supabaseClient] Falta NEXT_PUBLIC_SUPABASE_ANON_KEY')

// createBrowserClient de @supabase/ssr guarda la sesión en cookies además
// de localStorage, lo que permite que el middleware SSR la lea correctamente.
export const supabase = createBrowserClient(supabaseUrl, anonKey)
