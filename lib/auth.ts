// lib/auth.ts
// NextAuth usando Supabase Auth como fuente de verdad para credenciales.
// El login con email+password llama a supabase.auth.signInWithPassword,
// que ya maneja hashing y verifica el email_confirmed_at internamente.

import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabase'

// Cliente anon para signInWithPassword (no necesita service role)
const supabaseAuth = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
)

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    // ── Google OAuth ──────────────────────────────────────────────
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // ── Email + password via Supabase Auth ────────────────────────
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',      type: 'email'    },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const { data, error } = await supabaseAuth.auth.signInWithPassword({
          email:    credentials.email,
          password: credentials.password,
        })

        if (error || !data.user) return null

        // Rechazar si el email aún no está verificado
        if (!data.user.email_confirmed_at) {
          throw new Error('EMAIL_NOT_VERIFIED')
        }

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

      // Google: sincronizar perfil en tabla profiles
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
