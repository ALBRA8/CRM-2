/**
 * wa-connections-view-model.ts — lógica de presentación del panel de conexiones
 * WhatsApp multi-número (F2 del plan definitivo).
 *
 * Regla 9 del repo: la lógica vive en un módulo PURA para que las pruebas la
 * ejerciten sin React ni red. El componente (wa-connections-page.tsx) solo
 * renderiza y llama a la API; ninguna decisión de estado/color/texto se toma ahí.
 *
 * La API que consume esta vista es /api/whatsapp/connections (Meta Cloud API por
 * organización, decisión 2026-11-11): cada org ve SOLO sus números, con límite
 * por plan y aislamiento garantizado server-side.
 */

export interface WaConnectionView {
  id: string
  phoneNumber: string
  displayName: string | null
  status: string
  statusDetail: string | null
  source: string | null
  phoneNumberId: string
  wabaId: string | null
  tokenExpiresAt: string | null
  lastVerifiedAt: string | null
  lastErrorAt: string | null
  createdAt: string
  updatedAt: string
}

export interface WaPlanInfo {
  id: string
  label: string
  maxConnections: number
  activeConnections: number
}

export interface WaEventView {
  id: string
  type: string
  detail: string | null
  createdAt: string
}

export type WaHealthTone = 'ok' | 'warn' | 'bad' | 'off'

export interface WaStatusMeta {
  label: string
  /** Clases Tailwind del badge (fondo + texto). */
  badgeClass: string
  /** Clases Tailwind del punto de estado. */
  dotClass: string
  /** Texto explicativo corto para la tarjeta. */
  hint: string
}

/* ──── Estados de conexión ──── */

const ACTIVE_STATUSES = new Set(['connected', 'pending'])

const STATUS_META: Record<string, WaStatusMeta> = {
  connected: {
    label: 'Conectado',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
    hint: 'El número recibe y envía mensajes con las credenciales de esta organización.',
  },
  pending: {
    label: 'Pendiente',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-500',
    hint: 'Registrada pero aún sin verificar contra Meta.',
  },
  disconnected: {
    label: 'Desconectado',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    dotClass: 'bg-slate-400',
    hint: 'Sin token activo. Reconéctala para volver a usarla.',
  },
  revoked: {
    label: 'Revocado',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    dotClass: 'bg-red-500',
    hint: 'Meta revocó la autorización o fue retirada. Requiere reconectar.',
  },
}

/** Metadatos de presentación por estado; estado desconocido → gris. */
export function statusMeta(status: string | null | undefined): WaStatusMeta {
  if (!status) return STATUS_META.disconnected
  return STATUS_META[status] ?? {
    label: status,
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    dotClass: 'bg-slate-400',
    hint: 'Estado de conexión no reconocido.',
  }
}

/** true si el estado ocupa cupo del plan (misma regla que ACTIVE_STATUSES server-side). */
export function isActiveStatus(status: string | null | undefined): boolean {
  return ACTIVE_STATUSES.has(status ?? '')
}

/* ──── Orden de la lista ──── */

/**
 * Conexiones activas primero (conectadas antes que pendientes), luego por
 * updatedAt descendente. Los históricos desconectados/revocados quedan al final.
 */
export function sortConnections(connections: WaConnectionView[]): WaConnectionView[] {
  const rank = (c: WaConnectionView): number => (c.status === 'connected' ? 0 : c.status === 'pending' ? 1 : 2)
  return [...connections].sort((a, b) => {
    const r = rank(a) - rank(b)
    if (r !== 0) return r
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

/* ──── Uso del plan ──── */

export interface PlanUsageSummary {
  /** "2 de 5 números conectados". */
  text: string
  /** 0-100 para la barra de progreso. */
  pct: number
  isAtLimit: boolean
  /** maxConnections < 0 = ilimitado (plan alto). */
  isUnlimited: boolean
}

export function planUsageSummary(plan: WaPlanInfo | null | undefined): PlanUsageSummary {
  if (!plan) {
    return { text: 'Plan sin límites cargados', pct: 0, isAtLimit: false, isUnlimited: false }
  }
  const unlimited = plan.maxConnections < 0
  if (unlimited) {
    return {
      text: `${plan.activeConnections} número(s) conectado(s) · plan ${plan.label}`,
      pct: 100,
      isAtLimit: false,
      isUnlimited: true,
    }
  }
  const atLimit = plan.activeConnections >= plan.maxConnections
  return {
    text: `${plan.activeConnections} de ${plan.maxConnections} número(s) · plan ${plan.label}`,
    pct: plan.maxConnections === 0 ? 100 : Math.min(100, Math.round((plan.activeConnections / plan.maxConnections) * 100)),
    isAtLimit: atLimit,
    isUnlimited: false,
  }
}

/* ──── Salud y expiración del token ──── */

export interface TokenExpiryMeta {
  label: string
  tone: WaHealthTone
}

/** Ventana de aviso: expira en menos de 7 días → warn. */
const EXPIRY_WARN_DAYS = 7

export function tokenExpiryMeta(tokenExpiresAt: string | null | undefined, now = Date.now()): TokenExpiryMeta {
  if (!tokenExpiresAt) return { label: 'Sin fecha de expiración', tone: 'ok' }
  const exp = new Date(tokenExpiresAt).getTime()
  if (Number.isNaN(exp)) return { label: 'Fecha de expiración inválida', tone: 'warn' }
  const days = Math.floor((exp - now) / 86_400_000)
  if (exp <= now) return { label: 'Token expirado', tone: 'bad' }
  if (days < EXPIRY_WARN_DAYS) return { label: `Token expira en ${days} día(s)`, tone: 'warn' }
  return { label: `Token vigente (${days} días)`, tone: 'ok' }
}

/**
 * Tono de salud de la conexión para el borde/acento de la tarjeta:
 * 'ok' conectada verificada, 'warn' pendiente o expiración próxima,
 * 'bad' revocada o con error reciente, 'off' desconectada.
 */
export function connectionHealth(conn: WaConnectionView, now = Date.now()): WaHealthTone {
  if (conn.status === 'connected') {
    if (conn.lastErrorAt) {
      const err = new Date(conn.lastErrorAt).getTime()
      const upd = new Date(conn.updatedAt).getTime()
      if (err > upd) return 'bad'
    }
    const expiry = tokenExpiryMeta(conn.tokenExpiresAt, now)
    if (expiry.tone === 'bad') return 'bad'
    if (expiry.tone === 'warn') return 'warn'
    return 'ok'
  }
  if (conn.status === 'pending') return 'warn'
  if (conn.status === 'revoked') return 'bad'
  return 'off'
}

export const HEALTH_BORDER_CLASS: Record<WaHealthTone, string> = {
  ok: 'border-l-emerald-500',
  warn: 'border-l-amber-500',
  bad: 'border-l-red-500',
  off: 'border-l-slate-300',
}

/* ──── Etiquetas secundarias ──── */

/** Fuente de la conexión en texto legible. */
export function sourceLabel(source: string | null | undefined): string {
  switch (source) {
    case 'embedded_signup': return 'Embedded Signup (Meta)'
    case 'manual': return 'Registro manual'
    default: return source || 'Desconocida'
  }
}

export interface EventMeta {
  label: string
  tone: WaHealthTone
}

/** Etiqueta y tono por tipo de evento del historial de la conexión. */
export function eventMeta(type: string): EventMeta {
  switch (type) {
    case 'connected': return { label: 'Conectada', tone: 'ok' }
    case 'verified': return { label: 'Verificada', tone: 'ok' }
    case 'disconnected': return { label: 'Desconectada', tone: 'off' }
    case 'revoked': return { label: 'Revocada', tone: 'bad' }
    case 'plan_limit_blocked': return { label: 'Bloqueada por límite de plan', tone: 'warn' }
    case 'error': return { label: 'Error', tone: 'bad' }
    default: return { label: type || 'Evento', tone: 'off' }
  }
}

/** Fecha/hora corta en formato es (p. ej. "20 nov 14:32"). */
export function formatMoment(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(d)
}

/* ──── Formulario de registro manual (admin) ──── */

export interface ManualConnectionForm {
  phoneNumberId: string
  accessToken: string
  displayName: string
  wabaId: string
  phoneNumber: string
}

export function manualFormDefaults(): ManualConnectionForm {
  return { phoneNumberId: '', accessToken: '', displayName: '', wabaId: '', phoneNumber: '' }
}

export interface FormValidation {
  ok: boolean
  errors: Partial<Record<keyof ManualConnectionForm, string>>
}

/**
 * Validación PREVIA al POST (el servidor re-valida todo): phoneNumberId numérico
 * de 6-20 dígitos y token de al menos 16 caracteres — las mismas reglas mínimas
 * que aplica createConnection en wa-connections.ts.
 */
export function validateManualForm(form: ManualConnectionForm): FormValidation {
  const errors: FormValidation['errors'] = {}
  if (!/^\d{6,20}$/.test(form.phoneNumberId.trim())) {
    errors.phoneNumberId = 'phoneNumberId numérico de 6 a 20 dígitos (lo da Meta en WhatsApp Manager)'
  }
  if (form.accessToken.trim().length < 16) {
    errors.accessToken = 'El token de acceso es demasiado corto (mínimo 16 caracteres)'
  }
  return { ok: Object.keys(errors).length === 0, errors }
}

/* ──── Presentación del Embedded Signup ──── */

export interface EmbeddedSignupConfigView {
  appId: string
  configId?: string
  graphVersion: string
  state: string
}

/**
 * Acción recomendada para conectar según el plan y la configuración de Meta:
 *  - 'embedded' si la app de Meta está configurada (el flujo oficial es el
 *    preferido: el cliente NUNCA toca tokens);
 *  - 'manual' como camino alternativo (solo administradores).
 */
export function recommendedAction(embeddedAvailable: boolean, isAdmin: boolean): 'embedded' | 'manual' | 'none' {
  if (embeddedAvailable) return 'embedded'
  if (isAdmin) return 'manual'
  return 'none'
}

/** Texto de estado del flujo Embedded Signup para la UI. */
export function embeddedFlowMessage(phase: 'idle' | 'loading' | 'sdk' | 'awaiting' | 'exchanging' | 'done' | 'error'): string {
  switch (phase) {
    case 'idle': return ''
    case 'loading': return 'Consultando la configuración de Meta…'
    case 'sdk': return 'Cargando el SDK de Meta…'
    case 'awaiting': return 'Completa el flujo en la ventana de Meta…'
    case 'exchanging': return 'Registrando la conexión con el código de Meta…'
    case 'done': return 'Conexión registrada correctamente.'
    case 'error': return 'El flujo de Meta no se completó.'
  }
}
