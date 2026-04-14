// app/api/jobs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

async function getUserId(req: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null)
  return (session?.user as { id?: string })?.id ?? null
}

export async function GET(req: NextRequest) {
  const userId = await getUserId(req)
  const { searchParams } = new URL(req.url)
  const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '50'), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  let query = supabaseAdmin
    .from('scrape_jobs')
    .select('id, user_id, url, method, result, duration, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (userId) {
    query = query.eq('user_id', userId)
  } else {
    query = query.is('user_id', null).limit(20)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data ?? [] })
}

// DELETE /api/jobs?id=xxx  — eliminar un job
// DELETE /api/jobs?all=1   — eliminar todos los del usuario
export async function DELETE(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id  = searchParams.get('id')
  const all = searchParams.get('all')

  if (all === '1') {
    const { error } = await supabaseAdmin
      .from('scrape_jobs').delete().eq('user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: 'all' })
  }

  if (!id) return NextResponse.json({ error: 'Falta id o all=1' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('scrape_jobs').delete().eq('id', id).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: id })
}
