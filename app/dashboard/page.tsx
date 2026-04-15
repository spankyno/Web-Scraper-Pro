// app/dashboard/page.tsx — reescrito para usar los nuevos componentes
'use client'

import { useState } from 'react'
import type { MonitoredItem } from '@/types'
import { useMonitoredItems } from '@/hooks/useMonitoredItems'
import MonitorCard from '@/components/MonitorCard'
import AddMonitorModal from '@/components/AddMonitorModal'
import AlertLog from '@/components/AlertLog'
import StatsRow from '@/components/StatsRow'
import { getEffectiveActive } from '@/lib/format'

type Tab = 'cards' | 'logs'
type Filter = 'all' | 'active' | 'drops' | 'errors'

export default function DashboardPage() {
  const { items, loading, error, refetch, toggle, remove, checkNow } = useMonitoredItems()
  const [tab, setTab] = useState<Tab>('cards')
  const [filter, setFilter] = useState<Filter>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<MonitoredItem | null>(null)

  const visibleItems = items.filter(item => {
    if (filter === 'active') return getEffectiveActive(item)
    if (filter === 'drops') return item.status === 'price_drop'
    if (filter === 'errors') return item.status === 'error' || !!item.last_error
    return true
  })

  async function handleSave(data: Partial<MonitoredItem>) {
    const method = editItem ? 'PATCH' : 'POST'
    const url = editItem ? `/api/monitor?id=${editItem.id}` : '/api/monitor'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const { error } = await res.json()
      throw new Error(error ?? 'Error guardando')
    }
    await refetch()
    setEditItem(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0f14' }}>
      {/* TOPBAR */}
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        background: '#0d0f14', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🕸</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#00d4aa', fontFamily: 'monospace' }}>WebScraper Pro</span>
        </a>
        <div style={{ flex: 1, display: 'flex', gap: 4, background: '#1e2330', borderRadius: 9, padding: 3, width: 'fit-content' }}>
          {([['cards', '📡 Monitorización'], ['logs', '📋 Historial']] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
              background: tab === t ? '#0d0f14' : 'transparent',
              color: tab === t ? '#e8eaf0' : '#555c6e',
              border: tab === t ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
            }}>{label}</button>
          ))}
        </div>
        <button onClick={() => { setEditItem(null); setModalOpen(true) }} style={{
          padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', background: '#00d4aa', color: '#000', border: 'none',
        }}>＋ Monitorizar URL</button>
        <a href="/" style={{
          padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
          background: '#1e2330', color: '#8b909e', border: '1px solid rgba(255,255,255,0.08)', textDecoration: 'none',
        }}>⚡ Extraer</a>
      </div>

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1400, margin: '0 auto' }}>
        {tab === 'cards' && (
          <>
            {!loading && items.length > 0 && <StatsRow items={items} />}

            {!loading && items.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {(['all', 'active', 'drops', 'errors'] as Filter[]).map(f => {
                  const labels: Record<Filter, string> = { all: 'Todos', active: 'Activos', drops: '↓ Bajadas', errors: '⚠ Errores' }
                  const counts: Record<Filter, number> = {
                    all: items.length,
                    active: items.filter(getEffectiveActive).length,
                    drops: items.filter(i => i.status === 'price_drop').length,
                    errors: items.filter(i => i.status === 'error' || !!i.last_error).length,
                  }
                  return (
                    <button key={f} onClick={() => setFilter(f)} style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                      cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                      background: filter === f ? 'rgba(0,212,170,0.1)' : '#1e2330',
                      color: filter === f ? '#00d4aa' : '#8b909e',
                      border: `1px solid ${filter === f ? 'rgba(0,212,170,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    }}>
                      {labels[f]}
                      {counts[f] > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '0 5px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: '#555c6e' }}>{counts[f]}</span>}
                    </button>
                  )
                })}
                <button onClick={refetch} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', background: '#1e2330', color: '#555c6e', border: '1px solid rgba(255,255,255,0.08)' }}>🔄</button>
              </div>
            )}

            {loading && <div style={{ textAlign: 'center', padding: 60, color: '#555c6e' }}>📡 Cargando…</div>}
            {error && <div style={{ padding: '12px 16px', borderRadius: 8, fontSize: 13, background: 'rgba(255,77,109,0.08)', color: '#ff6b87', border: '1px solid rgba(255,77,109,0.2)' }}>⚠ {error}</div>}

            {!loading && items.length === 0 && (
              <div style={{ textAlign: 'center', padding: 80, color: '#555c6e' }}>
                <p style={{ fontSize: 48, marginBottom: 12 }}>📭</p>
                <p style={{ fontSize: 15, color: '#8b909e', marginBottom: 20 }}>Sin items monitorizados todavía</p>
                <a href="/" style={{ padding: '9px 20px', borderRadius: 8, fontSize: 13, background: '#00d4aa', color: '#000', textDecoration: 'none', fontWeight: 600 }}>⚡ Ir al extractor</a>
              </div>
            )}

            {!loading && visibleItems.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16 }}>
                {visibleItems.map(item => (
                  <MonitorCard
                    key={item.id} item={item}
                    onToggle={toggle} onDelete={remove} onCheckNow={checkNow}
                    onEdit={i => { setEditItem(i); setModalOpen(true) }}
                  />
                ))}
              </div>
            )}
          </>
        )}
        {tab === 'logs' && <AlertLog />}
      </div>

      <AddMonitorModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(null) }}
        onSave={handleSave}
        editItem={editItem}
      />
    </div>
  )
}
