// lib/auth.ts
import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabase'

// Lee la URL y key de Supabase probando todas las variantes de nombre
// que pueden estar definidas en Vercel (.env usa VITE_, Next.js prefiere NEXT_PUBLIC_)
function getSupabaseEnv() {
  const url =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL

  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    console.error('[auth] Faltan variables de Supabase. Definidas:', Object.keys(process.env).filter(k => k.includes('SUPA')))
    throw new Error('Supabase URL o ANON KEY no encontradas en variables de entorno')
  }
  return { url, anonKey }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID     ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),

    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',      type: 'email'    },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        let supabaseEnv: { url: string; anonKey: string }
        try {
          supabaseEnv = getSupabaseEnv()
        } catch (e) {
          console.error('[auth] No se pudo crear cliente Supabase:', e)
          return null
        }

        // Crear cliente en cada llamada (evita problemas de estado compartido en serverless)
        const supabase = createClient(supabaseEnv.url, supabaseEnv.anonKey, {
          auth: { persistSession: false },
        })

        const { data, error } = await supabase.auth.signInWithPassword({
          email:    credentials.email,
          password: credentials.password,
        })

        if (error) {
          console.error('[auth] signInWithPassword error:', error.message)
          return null
        }

        if (!data.user) return null

        if (!data.user.email_confirmed_at) {
          console.warn('[auth] Email no verificado:', credentials.email)
          throw new Error('EMAIL_NOT_VERIFIED')
        }

        console.log('[auth] Login OK:', data.user.email)
        return {
          id:    data.user.id,
          email: data.user.email ?? '',
          name:  data.user.user_metadata?.name ?? data.user.email ?? '',
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, account }) {
      if (user) token.userId = user.id

      if (account?.provider === 'google' && user?.email) {
        await supabaseAdmin.from('profiles').upsert(
          { id: user.id, email: user.email, name: user.name ?? '', plan: 'free' },
          { onConflict: 'id', ignoreDuplicates: true },
        )
      }
      return token
    },

    async session({ session, token }) {
      if (token?.userId && session.user) {
        (session.user as { id?: string }).id = token.userId as string
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
    error:  '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge:   30 * 24 * 60 * 60,
  },
}
