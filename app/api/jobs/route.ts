// app/api/jobs/route.ts
// GET /api/jobs — devuelve el historial de scrape_jobs del usuario
// Usa el esquema real: duration (no duration_ms), sin campo status

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string })?.id ?? null

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  let query = supabaseAdmin
    .from('scrape_jobs')
    .select('id, user_id, url, method, result, duration, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Filtrar por usuario si está autenticado; si no, devolver solo anónimos recientes
  if (userId) {
    query = query.eq('user_id', userId)
  } else {
    query = query.is('user_id', null).limit(20)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ jobs: data ?? [] })
}
