// hooks/useMonitoredItems.ts
'use client'

import { useEffect, useState, useCallback } from 'react'
import type { MonitoredItem } from '@/types'

export function useMonitoredItems() {
  const [items, setItems] = useState<MonitoredItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/monitor')
      if (!res.ok) throw new Error('Error cargando items')
      const { items } = await res.json()
      setItems(items ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch_() }, [fetch_])

  const toggle = useCallback(async (id: string, active: boolean) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_active: active } : i))
    await fetch(`/api/monitor?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: active }),
    })
  }, [])

  const remove = useCallback(async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    await fetch(`/api/monitor?id=${id}`, { method: 'DELETE' })
  }, [])

  const checkNow = useCallback(async (item: MonitoredItem) => {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: item.url,
        method: item.method,
        selector: item.price_selector ?? undefined,
      }),
    })
    if (res.ok) await fetch_()
    return res.ok
  }, [fetch_])

  return { items, loading, error, refetch: fetch_, toggle, remove, checkNow }
}
