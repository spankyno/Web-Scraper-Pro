// components/AnonBanner.tsx
'use client'

import { useState, useEffect } from 'react'

interface Props {
  remaining: number   // extracciones restantes (de 5)
  total?: number      // límite total (default 5)
  resetAt?: string    // ISO date de reset
}

export default function AnonBanner({ remaining, total = 5, resetAt }: Props) {
  const [visible, setVisible] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Recuperar de sessionStorage para no mostrar si ya fue cerrado
    const key = 'anon_banner_dismissed'
    if (sessionStorage.getItem(key) === '1') setDismissed(true)
  }, [])

  function dismiss() {
    sessionStorage.setItem('anon_banner_dismissed', '1')
    setVisible(false)
    setTimeout(() => setDismissed(true), 300)
  }

  if (dismissed || !visible) return null

  const used = total - remaining
  const pct = (used / total) * 100
  const urgency = remaining === 0 ? 'none' : remaining === 1 ? 'high' : remaining === 2 ? 'medium' : 'low'

  const colors = {
    none:   { accent: '#ff4d6d', bg: 'rgba(255,77,109,0.08)',   border: 'rgba(255,77,109,0.25)',   bar: '#ff4d6d' },
    high:   { accent: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.25)',   bar: '#f59e0b' },
    medium: { accent: '#f59e0b', bg: 'rgba(245,158,11,0.06)',   border: 'rgba(245,158,11,0.18)',   bar: '#f59e0b' },
    low:    { accent: '#00d4aa', bg: 'rgba(0,212,170,0.05)',    border: 'rgba(0,212,170,0.15)',    bar: '#00d4aa' },
  }
  const c = colors[urgency]

  const resetLabel = resetAt
    ? new Date(resetAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
    : '30 días'

  return (
    <div
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        transition: 'opacity 0.3s, transform 0.3s',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-8px)',
      }}
    >
      {/* Icono */}
      <span style={{ fontSize: 18, flexShrink: 0 }}>
        {urgency === 'none' ? '🚫' : urgency === 'high' ? '⚡' : '⚡'}
      </span>

      {/* Texto + barra */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, color: '#e8eaf0', marginBottom: 5 }}>
          {urgency === 'none'
            ? <>Has agotado tus <strong style={{ color: c.accent }}>5 extracciones gratuitas</strong> del mes.</>
            : <>Tienes <strong style={{ color: c.accent }}>{remaining} extracción{remaining !== 1 ? 'es' : ''}</strong> disponibles este mes.{' '}
               <a href="/login" style={{ color: c.accent, textDecoration: 'none', fontWeight: 600 }}>
                 Regístrate gratis →
               </a>
             </>
          }
        </p>

        {/* Mini barra de progreso con puntos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: total }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: i < used ? c.bar : 'rgba(255,255,255,0.1)',
                  border: `1px solid ${i < used ? c.bar : 'rgba(255,255,255,0.15)'}`,
                  transition: 'background 0.3s',
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 10, color: '#555c6e' }}>
            {used}/{total} · se reinicia el {resetLabel}
          </span>
        </div>
      </div>

      {/* CTA */}
      {urgency !== 'low' && (
        <a
          href="/login"
          style={{
            flexShrink: 0,
            padding: '6px 14px', borderRadius: 7,
            fontSize: 12, fontWeight: 600,
            background: c.accent,
            color: urgency === 'none' ? '#fff' : '#000',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {urgency === 'none' ? 'Crear cuenta' : 'Regístrate'}
        </a>
      )}

      {/* Cerrar */}
      <button
        onClick={dismiss}
        style={{
          background: 'none', border: 'none',
          color: '#555c6e', cursor: 'pointer', fontSize: 14,
          padding: '2px 4px', flexShrink: 0,
          lineHeight: 1,
        }}
        title="Cerrar"
      >
        ✕
      </button>
    </div>
  )
}
