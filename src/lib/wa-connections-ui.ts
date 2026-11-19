/**
 * wa-connections-ui.ts — Modelo PURO de la UI de conexiones WhatsApp (F2).
 *
 * Regla 9 del repo: la lógica que la UI necesita para decidir QUÉ mostrar y
 * QUÉ permitir vive aquí, sin React, sin fetch y sin Next, para que las
 * pruebas unitarias la ejerciten como unidad pura (el componente solo
 * consume este módulo + las rutas API ya probadas en integración).
 *
 * Fuente de verdad:
 *  - Estados de WhatsAppConnection: pending | connected | disconnected |
 *    revoked | error (prisma/schema.prisma).
 *  - Permisos: el SERVIDOR decide de verdad (requireAuth + isAdmin en las
 *    rutas); esta capa solo OCULTA botones — nunca es la autoridad.
 *  - Veredicto de sesión daemon: src/lib/whatsapp-session-verdict.ts (P0.1).
 */

import type { OwnershipVerdict } from './whatsapp-session-verdict'

// ---------- Metadatos de estado de conexión ----------

export type WaConnectionStatus = 'pending' | 'connected' | 'disconnected' | 'revoked' | 'error'

export interface WaStatusMeta {
  label: string
  /** Tono para el badge: success | warning | neutral | destructive */
  tone: 'success' | 'warning' | 'neutral' | 'destructive'
  description: string
}

const STATUS_META: Record<WaConnectionStatus, WaStatusMeta> = {
  connected: {
    label: 'Conectado',
    tone: 'success',
    description: 'El número está activo y puede enviar y recibir mensajes.',
  },
  pending: {
    label: 'Pendiente',
    tone: 'warning',
    description: 'Registrado pero aún sin verificar contra Meta. Verifica el token.',
  },
  disconnected: {
    label: 'Desconectado',
    tone: 'neutral',
    description: 'Desconectado a petición de la organización. Reconecta para usarlo.',
  },
  revoked: {
    label: 'Revocado',
    tone: 'destructive',
    description: 'El token fue revocado en Meta o desde aquí. Hay que reconectar.',
  },
  error: {
    label: 'Error',
    tone: 'destructive',
    description: 'Último intento falló. Revisa el detalle y verifica la conexión.',
  },
}

/** Metadatos seguros ante estados desconocidos (fail-closed a "Error"). */
export function waStatusMeta(status: string | null | undefined): WaStatusMeta {
  const known = STATUS_META[status as WaConnectionStatus]
  if (known) return known
  return { label: 'Desconocido', tone: 'neutral', description: `Estado "${status ?? ''}" no reconocido` }
}

/** Estados que ocupan cupo del plan (igual que ACTIVE_STATUSES del servidor). */
export function occupiesQuota(status: string): boolean {
  return status === 'connected' || status === 'pending'
}

// ---------- Forma de conexión consumida por la UI ----------

/** Refleja el select SIN secretos de GET /api/whatsapp/connections. */
export interface WaConnectionView {
  id: string
  wabaId?: string | null
  phoneNumberId: string
  phoneNumber?: string | null
  displayName?: string | null
  status: string
  statusDetail?: string | null
  source?: string | null
  tokenExpiresAt?: string | null
  lastVerifiedAt?: string | null
  lastErrorAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface WaPlanView {
  id?: string
  label?: string
  maxConnections: number
  activeConnections: number
}

/** Acciones que la UI puede ofrecer para una conexión. */
export interface WaConnectionActions {
  canVerify: boolean
  canDisconnect: boolean
  /** Reconectar = alta de nuevo número; solo se ofrece si hay cupo y no está activo. */
  canReconnect: boolean
  canViewEvents: boolean
}

/**
 * Qué acciones tiene sentido mostrar para ESTA conexión dado el rol.
 * El servidor re-verifica cada permiso; aquí solo se oculta lo inútil:
 *  - verify: siempre útil salvo si ya está desconectada/revocada (sin token).
 *  - disconnect: solo si está activa (connected/pending) — las demás ya lo están.
 *  - reconnect (alta manual): solo admin y SOLO si la conexión no ocupa cupo.
 *  - events: siempre (el historial audita también las desconexiones).
 */
export function connectionUiState(
  connection: Pick<WaConnectionView, 'status'>,
  isAdmin: boolean,
): WaConnectionActions {
  const active = occupiesQuota(connection.status)
  const hasTokenMaterial = connection.status !== 'disconnected' && connection.status !== 'revoked'
  return {
    canVerify: isAdmin && hasTokenMaterial,
    canDisconnect: isAdmin && active,
    canReconnect: isAdmin && !active,
    canViewEvents: true,
  }
}

// ---------- Cupo del plan ----------

export interface PlanQuotaSummary {
  used: number
  limit: number
  canAdd: boolean
  /** Mensaje corto para la UI (cupo libre o bloqueo). */
  message: string
  /** 0..1 para barra de progreso; clamp defensivo. */
  ratio: number
}

export function planQuotaSummary(plan: WaPlanView): PlanQuotaSummary {
  const limit = Number.isFinite(plan.maxConnections) && plan.maxConnections > 0 ? plan.maxConnections : 1
  const used = Number.isFinite(plan.activeConnections) && plan.activeConnections >= 0 ? plan.activeConnections : 0
  const canAdd = used < limit
  const ratio = Math.min(1, Math.max(0, limit > 0 ? used / limit : 1))
  return {
    used,
    limit,
    canAdd,
    ratio,
    message: canAdd
      ? `${used} de ${limit} número(s) activos — puedes conectar ${limit - used} más`
      : `Cupo agotado: ${used} de ${limit} número(s) activos. Desconecta uno o mejora de plan.`,
  }
}

// ---------- Doble confirmación de desconexión (máquina de estados pura) ----------

export type DisconnectConfirmState =
  | { phase: 'idle' }
  | { phase: 'armed'; connectionId: string } // primer click: botón "¿Seguro?"
  | { phase: 'working'; connectionId: string } // segundo click: llamando a la API

export type DisconnectConfirmAction =
  | { type: 'ARM'; connectionId: string }
  | { type: 'CONFIRM'; connectionId: string }
  | { type: 'DONE' }
  | { type: 'CANCEL' }
  | { type: 'RESET_OTHER' }

/**
 * Máquina de desconexión con confirmación doble:
 *  idle → ARM → armed → CONFIRM → working → DONE → idle
 *  armed → CANCEL/ARM(otra) → idle/armed(otra)
 * Reglas:
 *  - ARM sobre otra conexión re-arma sobre la nueva (una sola a la vez).
 *  - CONFIRM solo confirma si es la MISMA conexión armada (anti-click-doble).
 */
export function disconnectConfirmReducer(
  state: DisconnectConfirmState,
  action: DisconnectConfirmAction,
): DisconnectConfirmState {
  switch (action.type) {
    case 'ARM':
      return { phase: 'armed', connectionId: action.connectionId }
    case 'CONFIRM':
      return state.phase === 'armed' && state.connectionId === action.connectionId
        ? { phase: 'working', connectionId: action.connectionId }
        : state
    case 'DONE':
      return { phase: 'idle' }
    case 'CANCEL':
    case 'RESET_OTHER':
      return { phase: 'idle' }
    default:
      return state
  }
}

/** Etiqueta del botón de desconexión según la fase (para el componente). */
export function disconnectButtonLabel(state: DisconnectConfirmState, connectionId: string): string {
  if (state.phase === 'armed' && state.connectionId === connectionId) return '¿Confirmar desconexión?'
  if (state.phase === 'working' && state.connectionId === connectionId) return 'Desconectando…'
  return 'Desconectar'
}

// ---------- Eventos de conexión (timeline) ----------

export interface WaConnectionEventView {
  id: string
  type: string
  detail?: string | null
  createdAt: string
}

export function connectionEventUi(type: string): { label: string; tone: WaStatusMeta['tone'] } {
  switch (type) {
    case 'connected': return { label: 'Conectado', tone: 'success' }
    case 'verified': return { label: 'Token verificado', tone: 'success' }
    case 'token_refreshed': return { label: 'Token renovado', tone: 'success' }
    case 'disconnected': return { label: 'Desconectado', tone: 'neutral' }
    case 'revoked': return { label: 'Revocado', tone: 'destructive' }
    case 'error': return { label: 'Error', tone: 'destructive' }
    case 'plan_limit_blocked': return { label: 'Cupo bloqueado', tone: 'warning' }
    case 'incoming_message': return { label: 'Mensaje entrante', tone: 'neutral' }
    default: return { label: type || 'Evento', tone: 'neutral' }
  }
}

// ---------- Sesión daemon (QR Baileys) ----------

export interface DaemonSessionBadge {
  tone: WaStatusMeta['tone']
  label: string
  description: string
}

/**
 * Traduce el veredicto P0.1 + estado de sesión del daemon al badge de la UI.
 * `session` puede venir de GET /status del daemon multi-org (sessions[]).
 */
export function daemonSessionBadge(
  verdict: OwnershipVerdict,
  session?: { status?: unknown; phone?: unknown; lastError?: unknown } | null,
): DaemonSessionBadge {
  const st = typeof session?.status === 'string' ? session.status : ''
  if (verdict === 'SAME_ORG' && st === 'connected') {
    return { tone: 'success', label: 'QR conectado', description: 'Sesión Baileys activa para esta organización.' }
  }
  if (verdict === 'SAME_ORG' && (st === 'waiting_qr' || st === 'connecting')) {
    return { tone: 'warning', label: 'Esperando QR', description: 'Escanea el código QR con el teléfono.' }
  }
  if (verdict === 'SAME_ORG') {
    return { tone: 'warning', label: 'Sesión en estado ' + (st || 'desconocido'), description: 'Revisa el estado del daemon.' }
  }
  if (verdict === 'UNLINKED') {
    return { tone: 'neutral', label: 'Sin sesión QR', description: 'Esta organización no tiene sesión Baileys activa.' }
  }
  if (verdict === 'OTHER_ORG') {
    // En el daemon multi-org ya no debería ocurrir (sessions[] por org), pero
    // el fallback legacy sí puede: se informa SIN exponer la otra org.
    return { tone: 'destructive', label: 'Sesión de otra organización', description: 'No puedes operarla desde aquí.' }
  }
  return { tone: 'neutral', label: 'Estado del daemon desconocido', description: 'El daemon no respondió con datos válidos.' }
}

// ---------- Formato ----------

/** Enmascara un teléfono E.164 dejando visibles los últimos 4 dígitos. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 4) return `****${digits}`
  return `**** ${digits.slice(-4)}`
}

/** Fecha corta es-CO para lastVerifiedAt/tokenExpiresAt. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Aviso si el token expira pronto (< 7 días) — Embedded Signup entrega tokens cortos. */
export function tokenExpiryWarning(tokenExpiresAt: string | null | undefined): string | null {
  if (!tokenExpiresAt) return null
  const t = new Date(tokenExpiresAt)
  if (Number.isNaN(t.getTime())) return null
  const days = (t.getTime() - Date.now()) / (24 * 3600 * 1000)
  if (days <= 0) return 'El token ya expiró: reconecta el número.'
  if (days < 7) return `El token expira en ${Math.ceil(days)} día(s).`
  return null
}

/** Etiqueta legible de la fuente de alta. */
export function sourceLabel(source: string | null | undefined): string {
  if (source === 'embedded_signup') return 'Embedded Signup'
  if (source === 'manual') return 'Manual'
  return source || '—'
}
