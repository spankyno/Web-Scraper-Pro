// components/PriceChart.tsx
'use client'

import { useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import type { PriceHistoryPoint, MonitoredItem } from '@/types'
import { formatPrice, getEffectiveActive } from '@/lib/format'

interface Props {
  item: MonitoredItem
  history: PriceHistoryPoint[]
}

type Range = '7d' | '30d' | '90d' | 'all'

const RANGES: { value: Range; label: string; days: number }[] = [
  { value: '7d',  label: '7d',  days: 7 },
  { value: '30d', label: '30d', days: 30 },
  { value: '90d', label: '90d', days: 90 },
  { value: 'all', label: 'Todo', days: Infinity },
]

function formatDate(iso: string, compact = false): string {
  const d = new Date(iso)
  if (compact) {
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  }
  return d.toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// Tooltip personalizado
function CustomTooltip({ active, payload, currency }: {
  active?: boolean
  payload?: { payload: PriceHistoryPoint & { dateLabel: string } }[]
  currency: string
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: '#1e2330',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      <p style={{ color: '#555c6e', marginBottom: 4 }}>{d.dateLabel}</p>
      <p style={{ color: '#00d4aa', fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>
        {formatPrice(d.price, currency)}
      </p>
      {d.in_stock === false && (
        <p style={{ color: '#ff6b87', fontSize: 11, marginTop: 2 }}>Sin stock</p>
      )}
    </div>
  )
}

export default function PriceChart({ item, history }: Props) {
  const [range, setRange] = useState<Range>('30d')
  const currency = item.pricecurrency ?? 'EUR'

  // Filtrar por rango
  const selectedRange = RANGES.find(r => r.value === range)!
  const cutoff = selectedRange.days === Infinity
    ? new Date(0)
    : new Date(Date.now() - selectedRange.days * 86400000)

  const filtered = history
    .filter(h => new Date(h.scraped_at) >= cutoff)
    .sort((a, b) => new Date(a.scraped_at).getTime() - new Date(b.scraped_at).getTime())
    .map(h => ({
      ...h,
      dateLabel: formatDate(h.scraped_at),
      dateShort: formatDate(h.scraped_at, true),
    }))

  if (filtered.length === 0) {
    return (
      <div style={{
        background: '#1e2330',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        padding: 20,
        textAlign: 'center',
        color: '#555c6e',
        fontSize: 13,
      }}>
        <p style={{ fontSize: 28, marginBottom: 8 }}>📈</p>
        <p>Sin datos de historial para este rango.</p>
        <p style={{ fontSize: 11, marginTop: 4 }}>El historial se irá acumulando con cada verificación.</p>
      </div>
    )
  }

  // Stats del rango
  const prices = filtered.map(d => d.price).filter(Boolean)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const firstPrice = prices[0]
  const lastPrice = prices[prices.length - 1]
  const rangePct = firstPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0

  // Precio de alerta / objetivo como línea de referencia
  const alertPrice = item.alert_price

  const yMin = Math.min(...prices) * 0.97
  const yMax = Math.max(...prices) * 1.03

  return (
    <div style={{
      background: '#1e2330',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#e8eaf0', flex: 1 }}>
          Evolución de precio
        </span>

        {/* Stats rápidos */}
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { label: 'Mín', value: formatPrice(minPrice, currency), color: '#34d399' },
            { label: 'Máx', value: formatPrice(maxPrice, currency), color: '#ff6b87' },
            {
              label: 'Variación',
              value: `${rangePct > 0 ? '+' : ''}${rangePct.toFixed(1)}%`,
              color: rangePct < 0 ? '#34d399' : rangePct > 0 ? '#f59e0b' : '#555c6e',
            },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 10, color: '#555c6e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {s.label}
              </p>
              <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: s.color }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Selector de rango */}
        <div style={{
          display: 'flex', gap: 2,
          background: '#0d0f14', borderRadius: 8, padding: 3,
        }}>
          {RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              style={{
                padding: '4px 10px', borderRadius: 5,
                fontSize: 11, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'inherit',
                background: range === r.value ? '#1e2330' : 'transparent',
                color: range === r.value ? '#e8eaf0' : '#555c6e',
                border: range === r.value ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Gráfico */}
      <div style={{ padding: '20px 20px 8px' }}>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={filtered} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#00d4aa" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />

            <XAxis
              dataKey="dateShort"
              tick={{ fill: '#555c6e', fontSize: 10, fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />

            <YAxis
              domain={[yMin, yMax]}
              tick={{ fill: '#555c6e', fontSize: 10, fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `€${v.toFixed(0)}`}
              width={52}
            />

            <Tooltip content={<CustomTooltip currency={currency} />} />

            {/* Línea de precio objetivo */}
            {alertPrice != null && (
              <ReferenceLine
                y={alertPrice}
                stroke="#8b5cf6"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                label={{
                  value: `Objetivo ${formatPrice(alertPrice, currency)}`,
                  fill: '#8b5cf6',
                  fontSize: 10,
                  position: 'insideTopRight',
                }}
              />
            )}

            <Area
              type="monotone"
              dataKey="price"
              stroke="#00d4aa"
              strokeWidth={2}
              fill="url(#priceGrad)"
              dot={filtered.length < 15 ? {
                fill: '#00d4aa', r: 3,
                strokeWidth: 0,
              } : false}
              activeDot={{ r: 5, fill: '#00d4aa', strokeWidth: 0 }}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer con nº de puntos */}
      <div style={{
        padding: '8px 20px 14px',
        fontSize: 11, color: '#555c6e',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>{filtered.length} registros en el rango</span>
        <span>
          {filtered[0] && `Desde ${formatDate(filtered[0].scraped_at, true)}`}
        </span>
      </div>
    </div>
  )
}
