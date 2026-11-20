/**
 * Helpers puros de la UI de conexiones WhatsApp multi-número (F3-T02 / F2).
 *
 * Mantenido deliberadamente SIN dependencias de React ni de red para que la
 * lógica de presentación (estados, etiquetas, progreso de plan) sea testeable
 * con Vitest sin harness de componentes (el proyecto no tiene jsdom).
 */

/** Estados persistidos de una conexión Cloud API (model WhatsAppConnection). */
export type ConnectionStatus = 'pending' | 'connected' | 'disconnected' | 'revoked' | 'error' | string

/** Estados de la sesión Baileys del daemon (vía /api/whatsapp/daemon-proxy). */
export type DaemonSessionStatus = 'connected' | 'connecting' | 'waiting_qr' | 'qr_expired' | 'disconnected' | string

/** Veredicto de propiedad de sesión (src/lib/whatsapp-session-verdict.ts). */
export type OwnershipVerdict = 'SAME_ORG' | 'UNLINKED' | 'OTHER_ORG' | 'UNKNOWN'

export interface StatusPresentation {
  label: string
  /** Clases Tailwind del Badge (variante outline) por estado. */
  badgeClass: string
  /** Clases Tailwind del punto de estado ("dot"). */
  dotClass: string
  /** true si el estado representa un número utilizable ahora mismo. */
  active: boolean
}

const CONNECTION_PRESENTATION: Record<string, StatusPresentation> = {
  connected: { label: 'Conectado', badgeClass: 'border-emerald-200 text-emerald-700 bg-emerald-50', dotClass: 'bg-emerald-500', active: true },
  pending: { label: 'Pendiente de verificar', badgeClass: 'border-amber-200 text-amber-700 bg-amber-50', dotClass: 'bg-amber-500', active: true },
  disconnected: { label: 'Desconectado', badgeClass: 'border-slate-200 text-slate-500 bg-slate-50', dotClass: 'bg-slate-400', active: false },
  revoked: { label: 'Token revocado', badgeClass: 'border-red-200 text-red-700 bg-red-50', dotClass: 'bg-red-500', active: false },
  error: { label: 'Error', badgeClass: 'border-red-200 text-red-700 bg-red-50', dotClass: 'bg-red-500', active: false },
}

/** Etiqueta/badge por estado de conexión Cloud API; estado desconocido → neutro. */
export function connectionStatusPresentation(status: ConnectionStatus): StatusPresentation {
  return (
    CONNECTION_PRESENTATION[status] ?? {
      label: status || 'Desconocido',
      badgeClass: 'border-slate-200 text-slate-500 bg-slate-50',
      dotClass: 'bg-slate-400',
      active: false,
    }
  )
}

const DAEMON_PRESENTATION: Record<string, StatusPresentation> = {
  connected: { label: 'Conectado', badgeClass: 'border-emerald-200 text-emerald-700 bg-emerald-50', dotClass: 'bg-emerald-500', active: true },
  connecting: { label: 'Conectando…', badgeClass: 'border-blue-200 text-blue-700 bg-blue-50', dotClass: 'bg-blue-500', active: false },
  waiting_qr: { label: 'QR listo para escanear', badgeClass: 'border-amber-200 text-amber-700 bg-amber-50', dotClass: 'bg-amber-500', active: false },
  qr_expired: { label: 'QR expirado', badgeClass: 'border-amber-200 text-amber-700 bg-amber-50', dotClass: 'bg-amber-500', active: false },
  disconnected: { label: 'Desconectado', badgeClass: 'border-slate-200 text-slate-500 bg-slate-50', dotClass: 'bg-slate-400', active: false },
}

/** Etiqueta/badge por estado de la sesión Baileys (daemon). */
export function daemonStatusPresentation(status: DaemonSessionStatus): StatusPresentation {
  return (
    DAEMON_PRESENTATION[status] ?? {
      label: status || 'Desconocido',
      badgeClass: 'border-slate-200 text-slate-500 bg-slate-50',
      dotClass: 'bg-slate-400',
      active: false,
    }
  )
}

const VERDICT_LABELS: Record<OwnershipVerdict, string> = {
  SAME_ORG: 'Sesión de esta organización',
  UNLINKED: 'Sin sesión vinculada',
  OTHER_ORG: 'Sesión de otra organización',
  UNKNOWN: 'No se pudo verificar (fail-closed)',
}

/** Etiqueta legible del veredicto de propiedad de la sesión Baileys. */
export function verdictLabel(verdict: OwnershipVerdict): string {
  return VERDICT_LABELS[verdict] ?? VERDICT_LABELS.UNKNOWN
}

/** true si el veredicto permite VER la sesión de la organización (status/QR). */
export function verdictAllowsView(verdict: OwnershipVerdict): boolean {
  return verdict === 'SAME_ORG' || verdict === 'UNLINKED'
}

/** true si el veredicto permite OPERAR la sesión (desconectar, enviar…). */
export function verdictAllowsOperate(verdict: OwnershipVerdict): boolean {
  return verdict === 'SAME_ORG'
}

export interface PlanProgress {
  /** Porcentaje 0–100 (redondeado) de uso del plan de conexiones. */
  percent: number
  label: string
  /** true si la organización llegó al tope de su plan. */
  atLimit: boolean
}

/** Progreso del plan de conexiones (0 números / límite null → 0 %). */
export function planProgress(active: number, limit: number | null | undefined): PlanProgress {
  const safeActive = Number.isFinite(active) && active >= 0 ? active : 0
  if (!Number.isFinite(limit as number) || (limit as number) <= 0) {
    return { percent: 0, label: `${safeActive} activos`, atLimit: false }
  }
  const percent = Math.min(100, Math.round((safeActive / (limit as number)) * 100))
  return { percent, label: `${safeActive} de ${limit} números activos`, atLimit: safeActive >= (limit as number) }
}

/**
 * Presentación del evento de conexión (model WhatsAppConnectionEvent):
 * etiqueta y color coherentes con los `type` escritos por auditEvent().
 */
export function connectionEventPresentation(type: string): { label: string; dotClass: string } {
  switch (type) {
    case 'connected': return { label: 'Conectado', dotClass: 'bg-emerald-500' }
    case 'disconnected': return { label: 'Desconectado', dotClass: 'bg-slate-400' }
    case 'revoked': return { label: 'Token revocado', dotClass: 'bg-red-500' }
    case 'token_rotated': return { label: 'Token rotado', dotClass: 'bg-blue-500' }
    case 'verified': return { label: 'Verificado con Meta', dotClass: 'bg-emerald-500' }
    case 'error': return { label: 'Error', dotClass: 'bg-red-500' }
    case 'plan_limit_blocked': return { label: 'Bloqueado por límite del plan', dotClass: 'bg-amber-500' }
    default: return { label: type || 'Evento', dotClass: 'bg-slate-400' }
  }
}

/**
 * Etiqueta de un número: prefiere el teléfono E.164 y completa con el nombre
 * visible; nunca inventa datos (todo lo que muestra existe en la conexión).
 */
export function connectionDisplayName(input: { phoneNumber?: string | null; displayName?: string | null; phoneNumberId?: string | null }): string {
  if (input.phoneNumber) {
    return input.displayName ? `${input.phoneNumber} · ${input.displayName}` : input.phoneNumber
  }
  if (input.displayName) return input.displayName
  return input.phoneNumberId ? `ID ${input.phoneNumberId}` : 'Número sin identificar'
}

/** Fecha local corta es-CO para eventos (día mes año hora:minuto). */
export function formatEventDate(value: string | Date | null | undefined): string {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
