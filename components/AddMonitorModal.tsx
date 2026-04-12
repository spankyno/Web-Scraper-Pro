// components/AddMonitorModal.tsx
'use client'

import { useState, useEffect } from 'react'
import type { MonitoredItem, ScrapingMethod, NotificationChannel } from '@/types'

interface FormState {
  title: string
  url: string
  price_selector: string
  method: ScrapingMethod
  threshold: number
  alert_price: string
  check_interval: string
  notification_channel: NotificationChannel
  custom_selectors: { name: string; selector: string }[]
}

const DEFAULT_FORM: FormState = {
  title: '',
  url: '',
  price_selector: '',
  method: 'fetch-light',
  threshold: 5,
  alert_price: '',
  check_interval: '6h',
  notification_channel: 'telegram',
  custom_selectors: [],
}

interface Props {
  open: boolean
  onClose: () => void
  onSave: (data: Partial<MonitoredItem>) => Promise<void>
  initialUrl?: string
  initialTitle?: string
  editItem?: MonitoredItem | null
}

const INTERVALS = [
  { value: '1h',  label: 'Cada hora' },
  { value: '6h',  label: 'Cada 6 horas' },
  { value: '12h', label: 'Cada 12 horas' },
  { value: '24h', label: 'Cada 24 horas' },
  { value: '48h', label: 'Cada 2 días' },
]

const METHODS: { value: ScrapingMethod; label: string; desc: string }[] = [
  { value: 'fetch-light', label: '⚡ Fetch light', desc: 'Rápido, sin JS' },
  { value: 'browserless', label: '🌐 Browserless', desc: 'JS completo + XHR' },
  { value: 'gemini',      label: '✨ Gemini AI',   desc: 'Screenshot + IA' },
  { value: 'hybrid',      label: '🔄 Hybrid',      desc: 'Fallback automático' },
]

const CHANNELS: { value: NotificationChannel; label: string }[] = [
  { value: 'telegram', label: '📱 Telegram' },
  { value: 'email',    label: '📧 Email' },
  { value: 'both',     label: '📱📧 Ambos' },
  { value: 'none',     label: '🔇 Sin alertas' },
]

// Estilos base reutilizables
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#0d0f14',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, padding: '9px 12px',
  color: '#e8eaf0', fontSize: 13,
  fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: 10, color: '#555c6e',
  letterSpacing: '0.07em', textTransform: 'uppercase',
  display: 'block', marginBottom: 5,
}

export default function AddMonitorModal({
  open, onClose, onSave, initialUrl, initialTitle, editItem,
}: Props) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [customInput, setCustomInput] = useState({ name: '', selector: '' })

  // Inicializar formulario
  useEffect(() => {
    if (editItem) {
      setForm({
        title: editItem.title ?? '',
        url: editItem.url,
        price_selector: editItem.price_selector ?? '',
        method: editItem.method,
        threshold: editItem.threshold ?? 5,
        alert_price: editItem.alert_price != null ? String(editItem.alert_price) : '',
        check_interval: editItem.check_interval ?? '6h',
        notification_channel: editItem.notification_channel ?? 'telegram',
        custom_selectors: Array.isArray(editItem.custom_selectors) ? editItem.custom_selectors : [],
      })
    } else {
      setForm({
        ...DEFAULT_FORM,
        url: initialUrl ?? '',
        title: initialTitle ?? '',
      })
    }
    setError('')
  }, [editItem, initialUrl, initialTitle, open])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function addCustomSelector() {
    if (!customInput.name || !customInput.selector) return
    set('custom_selectors', [...form.custom_selectors, { ...customInput }])
    setCustomInput({ name: '', selector: '' })
  }

  function removeCustomSelector(i: number) {
    set('custom_selectors', form.custom_selectors.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    if (!form.url) { setError('La URL es obligatoria'); return }
    if (!form.title) { setError('El nombre es obligatorio'); return }

    setSaving(true)
    setError('')
    try {
      await onSave({
        ...form,
        alert_price: form.alert_price ? Number(form.alert_price) : null,
        threshold: Number(form.threshold),
      } as Partial<MonitoredItem>)
      onClose()
    } catch (e) {
      setError((e as Error).message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    // Backdrop
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{
        background: '#13161d',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 16,
        width: '100%', maxWidth: 520,
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#e8eaf0' }}>
            {editItem ? '✏ Editar monitorización' : '📡 Nueva monitorización'}
          </span>
          <button
            onClick={onClose}
            style={{
              background: '#1e2330', border: '1px solid rgba(255,255,255,0.08)',
              color: '#8b909e', borderRadius: 6, width: 28, height: 28,
              cursor: 'pointer', fontSize: 14, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Body scrollable */}
        <div style={{ overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* URL */}
          <div>
            <label style={labelStyle}>URL del producto *</label>
            <input
              style={inputStyle}
              type="url"
              value={form.url}
              onChange={e => set('url', e.target.value)}
              placeholder="https://www.amazon.es/dp/..."
            />
          </div>

          {/* Nombre */}
          <div>
            <label style={labelStyle}>Nombre del artículo *</label>
            <input
              style={inputStyle}
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Ej: AirPods Pro 2ª gen Amazon"
            />
          </div>

          {/* Selector de precio */}
          <div>
            <label style={labelStyle}>Selector de precio (CSS o XPath)</label>
            <input
              style={{ ...inputStyle, fontFamily: 'monospace' }}
              type="text"
              value={form.price_selector}
              onChange={e => set('price_selector', e.target.value)}
              placeholder=".a-price-whole, //span[@class='price']"
            />
          </div>

          {/* Método + Frecuencia en fila */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Motor de extracción</label>
              <select
                style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                value={form.method}
                onChange={e => set('method', e.target.value as ScrapingMethod)}
              >
                {METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label} — {m.desc}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Frecuencia de verificación</label>
              <select
                style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                value={form.check_interval}
                onChange={e => set('check_interval', e.target.value)}
              >
                {INTERVALS.map(i => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Umbral + Precio objetivo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Umbral de alerta (%)</label>
              <input
                style={inputStyle}
                type="number"
                min={0} max={100} step={0.5}
                value={form.threshold}
                onChange={e => set('threshold', Number(e.target.value))}
                placeholder="5"
              />
              <p style={{ fontSize: 10, color: '#555c6e', marginTop: 4 }}>
                Avisar si el precio baja más de este %
              </p>
            </div>
            <div>
              <label style={labelStyle}>Precio objetivo (€)</label>
              <input
                style={inputStyle}
                type="number"
                min={0} step={0.01}
                value={form.alert_price}
                onChange={e => set('alert_price', e.target.value)}
                placeholder="Ej: 150.00"
              />
              <p style={{ fontSize: 10, color: '#555c6e', marginTop: 4 }}>
                Avisar si baja de este precio
              </p>
            </div>
          </div>

          {/* Canal de notificación */}
          <div>
            <label style={labelStyle}>Canal de notificación</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {CHANNELS.map(ch => (
                <button
                  key={ch.value}
                  onClick={() => set('notification_channel', ch.value)}
                  style={{
                    flex: 1, padding: '7px 4px', borderRadius: 7, fontSize: 11,
                    fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                    background: form.notification_channel === ch.value
                      ? 'rgba(0,212,170,0.1)' : '#0d0f14',
                    color: form.notification_channel === ch.value ? '#00d4aa' : '#8b909e',
                    border: `1px solid ${form.notification_channel === ch.value
                      ? 'rgba(0,212,170,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  {ch.label}
                </button>
              ))}
            </div>
          </div>

          {/* Selectores custom (custom_selectors jsonb) */}
          <div>
            <label style={labelStyle}>Selectores adicionales (custom_selectors)</label>

            {form.custom_selectors.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {form.custom_selectors.map((cs, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: '#0d0f14', borderRadius: 6, padding: '5px 10px',
                    fontSize: 11, fontFamily: 'monospace',
                  }}>
                    <span style={{ color: '#8b909e', minWidth: 80 }}>{cs.name}</span>
                    <span style={{ color: '#555c6e', flex: 1 }}>{cs.selector}</span>
                    <button
                      onClick={() => removeCustomSelector(i)}
                      style={{ background: 'none', border: 'none', color: '#ff6b87', cursor: 'pointer', fontSize: 12 }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={{ ...inputStyle, flex: '0 0 110px' }}
                placeholder="nombre"
                value={customInput.name}
                onChange={e => setCustomInput(p => ({ ...p, name: e.target.value }))}
              />
              <input
                style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                placeholder=".selector-css"
                value={customInput.selector}
                onChange={e => setCustomInput(p => ({ ...p, selector: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addCustomSelector()}
              />
              <button
                onClick={addCustomSelector}
                style={{
                  padding: '0 14px', borderRadius: 7, cursor: 'pointer',
                  background: '#1e2330', color: '#00d4aa',
                  border: '1px solid rgba(0,212,170,0.2)', fontSize: 16,
                  fontFamily: 'inherit',
                }}
              >＋</button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p style={{
              fontSize: 12, color: '#ff6b87',
              background: 'rgba(255,77,109,0.08)',
              border: '1px solid rgba(255,77,109,0.2)',
              borderRadius: 6, padding: '7px 12px',
            }}>
              ⚠ {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          background: '#0d0f14',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px', borderRadius: 8, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit',
              background: '#1e2330', color: '#8b909e',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13,
              fontWeight: 600, cursor: saving ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
              background: '#00d4aa', color: '#000',
              border: 'none', transition: 'opacity 0.15s',
            }}
          >
            {saving ? 'Guardando…' : editItem ? 'Guardar cambios' : '📡 Activar monitorización'}
          </button>
        </div>
      </div>
    </div>
  )
}
