// components/StatsRow.tsx
'use client'

import type { MonitoredItem } from '@/types'
import { getEffectivePrice, getEffectivePrev, getEffectiveActive, priceDiffPercent, formatPrice } from '@/lib/format'

interface Props {
  items: MonitoredItem[]
}

export default function StatsRow({ items }: Props) {
  const active = items.filter(getEffectiveActive)
  const priceDrops = items.filter(i => i.status === 'price_drop')
  const outOfStock = items.filter(i => i.status === 'out_of_stock')
  const errors = items.filter(i => i.status === 'error' || i.last_error)

  // Mayor bajada de precio en el conjunto actual
  let maxDrop: { item: MonitoredItem; pct: number } | null = null
  for (const item of items) {
    const curr = getEffectivePrice(item)
    const prev = getEffectivePrev(item)
    if (curr != null && prev != null && prev > 0) {
      const pct = priceDiffPercent(curr, prev)
      if (pct < 0 && (!maxDrop || pct < maxDrop.pct)) {
        maxDrop = { item, pct }
      }
    }
  }

  const stats = [
    {
      label: 'Items activos',
      value: `${active.length}`,
      sub: `de ${items.length} monitorizados`,
      color: '#00d4aa',
      icon: '📡',
    },
    {
      label: 'Bajadas de precio',
      value: String(priceDrops.length),
      sub: priceDrops.length > 0 ? priceDrops.map(i => i.title ?? '').filter(Boolean).slice(0, 2).join(', ') : 'Sin novedades',
      color: priceDrops.length > 0 ? '#34d399' : '#555c6e',
      icon: '📉',
    },
    {
      label: 'Mayor bajada',
      value: maxDrop
        ? `${maxDrop.pct.toFixed(1)}%`
        : '—',
      sub: maxDrop
        ? (maxDrop.item.title ?? new URL(maxDrop.item.url).hostname)
        : 'Sin cambios relevantes',
      color: maxDrop ? '#34d399' : '#555c6e',
      icon: '💰',
    },
    {
      label: 'Sin stock / Error',
      value: `${outOfStock.length + errors.length}`,
      sub: outOfStock.length > 0
        ? `${outOfStock.length} sin stock`
        : errors.length > 0
          ? `${errors.length} con error`
          : 'Todo en orden',
      color: (outOfStock.length + errors.length) > 0 ? '#ff6b87' : '#555c6e',
      icon: outOfStock.length > 0 ? '📭' : errors.length > 0 ? '⚠️' : '✅',
    },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 12,
    }}>
      {stats.map(s => (
        <div
          key={s.label}
          style={{
            background: '#1e2330',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '16px',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 14 }}>{s.icon}</span>
            <span style={{
              fontSize: 10, color: '#555c6e',
              textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 500,
            }}>
              {s.label}
            </span>
          </div>
          <p style={{
            fontSize: 26, fontWeight: 700, fontFamily: 'monospace',
            color: s.color, marginBottom: 3, lineHeight: 1,
          }}>
            {s.value}
          </p>
          <p style={{
            fontSize: 11, color: '#555c6e',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {s.sub}
          </p>
        </div>
      ))}
    </div>
  )
}
