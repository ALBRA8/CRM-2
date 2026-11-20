/**
 * wa-connections-view.ts — Modelo de vista del panel de Conexiones WhatsApp (F2).
 *
 * F2 (plan definitivo §5.1, F3-T02): la API de conexiones multi-número (Baileys
 * por organización + Cloud API de Meta) está completa y probada, pero no existía
 * ninguna pantalla. Este módulo centraliza la LÓGICA DE PRESENTACIÓN del panel:
 *
 *  - traduce el estado crudo (conexiones Cloud API + veredicto de sesión del
 *    daemon Baileys) a tarjetas con estado de UI accionable;
 *  - decide qué acciones muestra (conectar / verificar / desconectar) según
 *    rol de administrador y estado real — la AUTORIDAD sigue en el servidor
 *    (RBAC + gates del proxy); la UI solo oculta lo que el servidor negaría;
 *  - expone el consumo del plan (cupos activos / límite).
 *
 * Módulo PURO (sin fetch, sin Prisma, sin Next): lo ejercitan los tests
 * unitarios y lo consume la ruta agregada /api/whatsapp/connections-panel,
 * que es de donde la UI lee el panel completo en una sola llamada.
 *
 * Contrato del daemon multi-org (GET /status), ver whatsapp-session-verdict.ts:
 *   { status, phone, orgLinked, linkedOrgId, lastError,
 *     sessions: [{ orgId, status, phone, lastUpdate, lastError }] }
 */

import type { OwnershipVerdict } from '@/lib/whatsapp-session-verdict'

// ---------------------------------------------------------------------------
// Tipos de la vista
// ---------------------------------------------------------------------------

/** Estados que la UI sabe representar (badge con color y texto). */
export type ChannelUiStatus =
  | 'connected'
  | 'waiting_qr'
  | 'connecting'
  | 'disconnected'
  | 'revoked'
  | 'error'
  | 'unknown'

export interface CloudConnectionRow {
  id: string
  phoneNumberId: string
  phoneNumber: string
  displayName: string | null
  status: string
  statusDetail: string | null
  source: string
  lastVerifiedAt: string | Date | null
  lastErrorAt: string | Date | null
  createdAt: string | Date | null
}

/** Entrada de sessions[] del daemon para la organización consultada. */
export interface BaileysSessionInfo {
  status?: string | null
  phone?: string | null
  lastUpdate?: string | null
  lastError?: string | null
}

export interface PlanSummary {
  plan: string
  label: string
  maxConnections: number
  activeConnections: number
}

/** Una tarjeta del panel: la sesión Baileys de la org o una conexión Cloud. */
export interface ConnectionCard {
  /** 'baileys' = sesión QR del daemon; 'meta_cloud' = conexión oficial Meta. */
  kind: 'baileys' | 'meta_cloud'
  /** Id de conexión Cloud, o el literal 'baileys' para la sesión QR. */
  id: string
  title: string
  subtitle: string | null
  status: ChannelUiStatus
  statusLabel: string
  detail: string | null
  /** Acciones disponibles para ESTA tarjeta (el servidor re-verifica todo). */
  canDisconnect: boolean
  canVerify: boolean
  lastVerifiedAt: string | null
}

export interface ConnectionsPanelView {
  cards: ConnectionCard[]
  plan: PlanSummary
  /** ¿Puede la org registrar otra conexión Cloud según su plan? */
  canAddCloud: boolean
  /** Motivo accionable si el plan bloquea el alta (null si puede). */
  addBlockReason: string | null
  baileys: {
    /** false = daemon caído / respuesta ambigua: fail-closed, sin estado fingido. */
    available: boolean
    status: ChannelUiStatus
    phone: string | null
    lastUpdate: string | null
    lastError: string | null
    canConnect: boolean
    canDisconnect: boolean
  }
}

// ---------------------------------------------------------------------------
// Etiquetas de estado (invariante de textos: un único catálogo)
// ---------------------------------------------------------------------------

export const CHANNEL_STATUS_LABELS: Record<ChannelUiStatus, string> = {
  connected: 'Conectado',
  waiting_qr: 'Esperando QR',
  connecting: 'Conectando',
  disconnected: 'Desconectado',
  revoked: 'Revocado',
  error: 'Con error',
  unknown: 'Sin verificar',
}

// ---------------------------------------------------------------------------
// Traducción de estados crudos → estado de UI
// ---------------------------------------------------------------------------

/** Estado de UI para una conexión Cloud API (WhatsAppConnection.status). */
export function uiStatusFromCloud(status: string | null | undefined): ChannelUiStatus {
  switch (status) {
    case 'connected': return 'connected'
    case 'pending': return 'waiting_qr'
    case 'disconnected': return 'disconnected'
    case 'revoked': return 'revoked'
    case 'error': return 'error'
    default: return 'unknown'
  }
}

/**
 * Estado de UI para la sesión Baileys de la organización. La duda NUNCA se
 * resuelve a favor del llamador (mismo principio del proxy fail-closed):
 *  - daemon caído / veredicto UNKNOWN → 'unknown' (sin fingir desconexión);
 *  - UNLINKED → 'disconnected' (el daemon VERIFICÓ que no hay sesión);
 *  - SAME_ORG → traduce el status interno del daemon ('connected',
 *    'waiting_qr', 'qr_expired', 'connecting'...).
 */
export function uiStatusFromBaileys(
  verdict: OwnershipVerdict,
  session: BaileysSessionInfo | null,
): ChannelUiStatus {
  if (verdict === 'SAME_ORG') {
    switch (session?.status) {
      case 'connected': return 'connected'
      case 'waiting_qr': return 'waiting_qr'
      case 'qr_expired': return 'waiting_qr'
      case 'connecting': return 'connecting'
      case 'disconnected': return 'disconnected'
      default: return 'unknown'
    }
  }
  if (verdict === 'UNLINKED') return 'disconnected'
  return 'unknown'
}

// ---------------------------------------------------------------------------
// Construcción del panel completo
// ---------------------------------------------------------------------------

function isoOrNull(v: string | Date | null | undefined): string | null {
  if (!v) return null
  if (typeof v === 'string') return v
  try { return new Date(v).toISOString() } catch { return null }
}

function subtitleFor(conn: CloudConnectionRow): string {
  const phone = conn.phoneNumber && conn.phoneNumber !== 'desconocido' ? conn.phoneNumber : null
  return phone ?? `phoneNumberId ${conn.phoneNumberId}`
}

/**
 * Construye el modelo de vista del panel de conexiones de UNA organización.
 *
 * @param cloudConnections filas de WhatsAppConnection de la org (jamás de otra:
 *        el aislamiento lo garantiza la consulta con organizationId).
 * @param plan consumo del plan (límite autoridad en whatsapp-plans.ts).
 * @param baileysVerdict veredicto de propiedad calculado contra el daemon.
 * @param baileysSession entrada de sessions[] correspondiente a la org (o null).
 * @param isAdmin acciones sensibles (desconectar/verificar) solo para admin.
 */
export function buildConnectionsPanelView(input: {
  cloudConnections: CloudConnectionRow[]
  plan: PlanSummary
  baileysVerdict: OwnershipVerdict
  baileysSession: BaileysSessionInfo | null
  isAdmin: boolean
}): ConnectionsPanelView {
  const { cloudConnections, plan, baileysVerdict, baileysSession, isAdmin } = input

  // --- Tarjeta de la sesión Baileys (QR, canal principal del CRM) ---
  const baileysStatus = uiStatusFromBaileys(baileysVerdict, baileysSession)
  const cards: ConnectionCard[] = [
    {
      kind: 'baileys',
      id: 'baileys',
      title: 'WhatsApp (QR / Baileys)',
      subtitle: (baileysVerdict === 'SAME_ORG' && baileysSession?.phone) || null,
      status: baileysStatus,
      statusLabel: CHANNEL_STATUS_LABELS[baileysStatus],
      detail:
        baileysVerdict === 'UNKNOWN'
          ? 'No se pudo verificar el estado de la sesión (daemon no disponible). Operaciones denegadas por seguridad hasta verificar.'
          : baileysSession?.lastError ?? null,
      canDisconnect: isAdmin && baileysStatus === 'connected',
      canVerify: false, // la sesión Baileys se verifica conectando (QR), no vía Graph
      lastVerifiedAt: isoOrNull(baileysSession?.lastUpdate ?? null),
    },
  ]

  // --- Tarjetas de conexiones Cloud API de la organización ---
  for (const conn of cloudConnections) {
    const status = uiStatusFromCloud(conn.status)
    cards.push({
      kind: 'meta_cloud',
      id: conn.id,
      title: conn.displayName || 'WhatsApp Cloud API',
      subtitle: subtitleFor(conn),
      status,
      statusLabel: CHANNEL_STATUS_LABELS[status],
      detail: conn.statusDetail ?? null,
      canDisconnect: isAdmin && (status === 'connected' || status === 'waiting_qr'),
      canVerify: isAdmin && status === 'connected',
      lastVerifiedAt: isoOrNull(conn.lastVerifiedAt),
    })
  }

  // --- Consumo del plan (autoridad en el servidor; aquí solo presentación) ---
  const canAddCloud = plan.activeConnections < plan.maxConnections
  const addBlockReason = canAddCloud
    ? null
    : `Tu plan (${plan.label}) permite ${plan.maxConnections} número(s) conectado(s). Libera un número o mejora de plan.`

  return {
    cards,
    plan,
    canAddCloud,
    addBlockReason,
    baileys: {
      available: baileysVerdict !== 'UNKNOWN',
      status: baileysStatus,
      phone: (baileysVerdict === 'SAME_ORG' && baileysSession?.phone) || null,
      lastUpdate: isoOrNull(baileysSession?.lastUpdate ?? null),
      lastError: baileysSession?.lastError ?? null,
      // conectar: permitido sin sesión propia o para regenerar QR (el gate del
      // proxy re-verifica); desconectar: solo con sesión CONECTADA de la org.
      canConnect: isAdmin && baileysStatus !== 'connected',
      canDisconnect: isAdmin && baileysStatus === 'connected',
    },
  }
}

/**
 * ¿Debe la UI sondear automáticamente? Mientras haya una sesión esperando QR o
 * una conexión pendiente, el panel se refresca solo para reflejar la conexión
 * sin exigir clicks al operador.
 */
export function shouldPollPanel(view: ConnectionsPanelView): boolean {
  if (view.baileys.status === 'waiting_qr' || view.baileys.status === 'connecting') return true
  return view.cards.some(
    (c) => c.status === 'waiting_qr' || c.status === 'connecting',
  )
}

/**
 * Texto accionable del catálogo de errores del panel (patron U3: el operador
 * ve QUÉ hacer, no la pila técnica). Entrada: código de error de la API.
 */
export function panelActionableError(code: string | null | undefined, fallback: string): string {
  switch (code) {
    case 'plan_limit':
      return 'Límite del plan alcanzado: desconecta un número o mejora de plan para conectar otro.'
    case 'duplicate':
      return 'Ese número ya está conectado en otra cuenta. Solo puede pertenecer a una organización.'
    case 'invalid_token':
      return 'Meta rechazó el token. Genera uno nuevo en Meta Business y vuelve a intentarlo.'
    case 'daemon_down':
      return 'El daemon de WhatsApp no responde. Verifica que esté corriendo (puerto 3002) y reintenta.'
    default:
      return fallback
  }
}
