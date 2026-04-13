// types/index.ts — alineado con el esquema real de Supabase

export type ScrapingMethod =
  | 'fetch-light'
  | 'browserless'
  | 'gemini'
  | 'hybrid'
  | 'auto'

export type ItemStatus = 'stable' | 'price_drop' | 'price_rise' | 'out_of_stock' | 'error'

export type NotificationChannel = 'telegram' | 'email' | 'both' | 'none'

export type ExportFormat = 'json' | 'csv' | 'xml' | 'xlsx'

// ─── Tabla monitored_items (esquema real Supabase) ────────────────────────────
export interface MonitoredItem {
  id: string
  user_id: string | null
  url: string
  title: string | null
  price_current: number
  price_previous: number
  pricecurrent: number | null
  priceprevious: number | null
  pricecurrency: string
  status: ItemStatus
  last_checked: string
  lastchecked: string | null
  is_active: boolean
  isactive: boolean | null
  created_at: string
  next_check: string
  check_interval: string             // '1h' | '6h' | '12h' | '24h'
  notification_channel: NotificationChannel
  custom_selectors: CustomSelector[]
  price_selector: string | null
  threshold: number
  alert_price: number | null
  method: ScrapingMethod
  price_confidence: number | null
  price_extraction_method: string | null
  last_error: string | null
  image_url: string | null
}

export interface CustomSelector {
  name: string
  selector: string
}

// ─── Tabla scrape_jobs (esquema real Supabase) ────────────────────────────────
export interface ScrapeJob {
  id: string
  user_id: string | null
  url: string
  method: string
  result: ScrapeJobResult | null
  duration: number | null
  created_at: string
}

export interface ScrapeJobResult {
  price?: number | null
  price_text?: string
  product_name?: string
  in_stock?: boolean
  currency?: string
  confidence?: number
  extraction_method?: string
  data?: Record<string, unknown>[]
  error?: string
}

export interface ScrapeRequest {
  url: string
  method?: ScrapingMethod
  selector?: string
  aiInstruction?: string
}

export interface PriceHistoryPoint {
  price: number
  scraped_at: string
  in_stock?: boolean
}

export interface PriceComparison {
  direction: 'up' | 'down' | 'same'
  diffAbsolute: number
  diffPercent: number
  shouldAlert: boolean
}

// ─── Resultado de scraping (retornado por los motores) ────────────────────────
export interface ScrapeResult {
  success: boolean
  url: string
  method: ScrapingMethod
  data: Record<string, unknown>[]
  price: number | null
  currency?: string
  inStock?: boolean
  productName?: string
  durationMs: number
  error?: string
}
