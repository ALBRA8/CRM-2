import { db } from './db'

/**
 * Bandeja omnicanal (Fase 4 del plan maestro; criterio M7 2026-11-20).
 *
 * Unifica en una sola lista las conversaciones de los 5 canales:
 *   - WhatsApp (daemon Baileys) → tabla WhatsAppConversation/WhatsAppMessage
 *   - WhatsApp Cloud API multi-número → modelo canónico ChannelConversation (key "cc:")
 *   - Telegram  → TimelineEvent type="telegram" agrupado por cliente
 *   - Instagram → TimelineEvent type="instagram" agrupado por cliente
 *   - Facebook  → TimelineEvent type="facebook" agrupado por cliente (Messenger de la Página)
 *
 * Decisiones de diseño:
 *  - Cada conversación tiene una `key` estable: "wa:<convId>" | "tg:<clientId>" |
 *    "ig:<clientId>" | "fb:<clientId>" | "cc:<convId>". Es el único identificador
 *    que viaja al frontend y vuelve en cada petición.
 *  - El merge es READ-ONLY sobre las fuentes (no migra datos): Telegram/Instagram
 *    ya viven como timeline y WhatsApp como tablas propias; la bandeja es una
 *    vista coherente encima. Cero riesgo de duplicación o pérdida.
 *  - CRITERIO M7 DE UNIFICACIÓN (canónico primero, respaldo del daemon): si el
 *    MISMO contacto en el MISMO canal existe en el modelo canónico y en una fuente
 *    legacy, gana SIEMPRE la conversación canónica ("cc:") y la legacy se oculta
 *    de la lista unificada SIN borrarse: su historial sigue íntegro en la ficha
 *    del cliente (ficha 360) y en sus tablas. Los no leídos de la fila oculta se
 *    SUMAN al contador del ganador para que ninguna señal de atención se pierda.
 *    Dos conversaciones canónicas del mismo teléfono por números distintos son
 *    legítimas (multi-número) y NUNCA se deduplican entre sí.
 *  - Nunca lanza: si un canal falla, se degrada a lista vacía de ese canal.
 */

export type InboxChannel = 'whatsapp' | 'telegram' | 'instagram' | 'facebook' | 'tiktok'

export interface InboxConversation {
  key: string
  /** Nombre seguro de la cuenta conectada; solo presente en conversaciones canónicas. */
  connectionName?: string | null
  channel: InboxChannel
  channelLabel: 'WhatsApp' | 'Telegram' | 'Instagram' | 'Messenger' | 'TikTok'
  contactName: string
  /** Handle real para ENVIAR: teléfono WA / chatId TG / recipientId IG. */
  contactHandle: string
  clientId: string | null
  lastMessage: string
  lastMessageAt: string | null
  /** 'in' = entrante (contacto), 'out' = saliente (agente o usuario). */
  lastMessageFrom: 'in' | 'out'
  unreadCount: number
  isAutoReply: boolean
}

export interface InboxMessage {
  id: string
  direction: 'in' | 'out'
  senderType: 'contact' | 'agent' | 'user'
  text: string
  createdAt: string
  /** 'voice' si es una nota de voz transcrita (chip 🎙 en la UI). */
  messageType?: string
  deliveryStatus?: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'delivery_failed' | 'unknown'
}

const CHANNEL_LABELS: Record<InboxChannel, InboxConversation['channelLabel']> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  instagram: 'Instagram',
  facebook: 'Messenger',
  tiktok: 'TikTok',
}

/** Prefijo de la key del canal WhatsApp directo (sin conversación previa). */
const WA_NEW_PREFIX = 'wa-new'

/**
 * Normaliza un teléfono al formato que usa el daemon (E.164 sin '+', solo
 * dígitos: '573001110000'). Quita TODO lo que no sea dígito (espacios, '+',
 * guiones…). Devuelve null si no quedan dígitos suficientes (fail-closed):
 * nunca se ofrece/envía a un teléfono basura.
 */
export function normalizeWaPhone(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 7 ? digits : null
}

/**
 * Parseo de la key del canal WhatsApp directo "wa-new:<teléfono>".
 * Devuelve el teléfono normalizado o null si la key no es wa-new:/el teléfono
 * es inválido (fail-closed). Es la key que ofrece el diálogo de IA de cierre
 * cuando el cliente tiene teléfono pero NUNCA ha tenido conversación: el envío
 * crea la conversación bajo demanda (find-or-create).
 */
export function parseWaNewKey(key: string): string | null {
  if (typeof key !== 'string' || !key.startsWith(`${WA_NEW_PREFIX}:`)) return null
  return normalizeWaPhone(key.slice(WA_NEW_PREFIX.length + 1))
}

// ---------- helpers de key (puros, testeables) ----------

export function makeInboxKey(channel: InboxChannel, id: string): string {
  const prefix = channel === 'whatsapp' ? 'wa' : channel === 'telegram' ? 'tg' : channel === 'instagram' ? 'ig' : 'fb'
  return `${prefix}:${id}`
}

/** Parseo estricto: devuelve null ante cualquier key malformada (fail-closed). */
export function parseInboxKey(key: string): { channel: InboxChannel | null; id: string } | null {
  if (typeof key !== 'string' || key.length < 3 || key.length > 200) return null
  const idx = key.indexOf(':')
  if (idx < 1) return null
  const prefix = key.slice(0, idx)
  const id = key.slice(idx + 1)
  if (!id || /[\s]/.test(id)) return null
  if (prefix === 'cc') return { channel: null, id }
  if (prefix === 'wa') return { channel: 'whatsapp', id }
  if (prefix === 'tg') return { channel: 'telegram', id }
  if (prefix === 'ig') return { channel: 'instagram', id }
  if (prefix === 'fb') return { channel: 'facebook', id }
  return null
}

function safeMetadata(raw: string | null | undefined): Record<string, unknown> {
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Eventos de timeline → mensajes normalizados (asc por fecha). */
export function timelineToMessages(
  events: Array<{
    id: string
    title: string
    description: string | null
    metadata: string | null
    createdAt: Date
    source: string
  }>
): InboxMessage[] {
  return events
    .map((e) => {
      const meta = safeMetadata(e.metadata)
      const direction: 'in' | 'out' = meta.direction === 'out' ? 'out' : 'in'
      return {
        id: e.id,
        direction,
        senderType: direction === 'in' ? 'contact' : e.source === 'agent' ? 'agent' : 'user',
        text: e.description || e.title || '',
        createdAt: e.createdAt.toISOString(),
        ...(meta.voice ? { messageType: 'voice' } : {}),
      } satisfies InboxMessage
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

// ---------- criterio M7 de unificación (puro, testeable) ----------

/** Fuente de una conversación de la bandeja: modelo canónico o legacy. */
export type InboxSource = 'canonical' | 'legacy'

export function inboxSource(key: string): InboxSource {
  return key.startsWith('cc:') ? 'canonical' : 'legacy'
}

/**
 * Identidad de dedup de un contacto: canal + cuenta/contacto normalizados.
 *  - WhatsApp: teléfono normalizado a dígitos (daemon usa '573…', Cloud '+573…').
 *  - Telegram/Instagram/Facebook/TikTok: handle de la plataforma tal cual.
 * Devuelve null cuando no hay identity fiable (no participa en dedup).
 */
function dedupIdentity(conv: InboxConversation): string | null {
  if (conv.channel === 'whatsapp') {
    const phone = normalizeWaPhone(conv.contactHandle)
    return phone ? `whatsapp:${phone}` : null
  }
  const handle = conv.contactHandle?.trim()
  if (!handle) return null
  return `${conv.channel}:${handle.toLowerCase()}`
}

export interface DedupeResult {
  /** Lista deduplicada (orden de entrada preservado dentro de cada fuente). */
  list: InboxConversation[]
  /** Conversaciones ocultas por el criterio (legado cubierto por canónico). */
  suppressed: InboxConversation[]
}

/**
 * Criterio M7: un contacto, una conversación en la bandeja.
 *
 * Reglas:
 *  1. Las conversaciones CANÓNICAS ("cc:") NUNCA se ocultan entre sí: dos
 *     conversaciones del mismo teléfono por números distintos son legítimas
 *     (multi-número, partición por conexión).
 *  2. Una fila LEGACY (daemon/timeline) cuya identidad (canal+contacto) coincide
 *     con CUALQUIER conversación canónica se oculta; sus no leídos se SUMAN al
 *     canónico más reciente de esa identidad (ninguna señal de atención se pierde).
 *  3. Entre dos legacy de la misma identidad sin canónico se conserva la más
 *     reciente y se suman los no leídos del resto (estado degenerado protegido).
 *  4. Sin identidad fiable (handle vacío/teléfono basura) → la fila pasa intacta.
 *
 * READ-ONLY: nunca toca base de datos; el historial oculto sigue en la ficha.
 */
export function dedupeInboxConversations(conversations: InboxConversation[]): DedupeResult {
  const suppressed: InboxConversation[] = []

  // Pass 1: canónicas indexadas por identidad (pueden convivir N por identidad).
  const canonicalByIdentity = new Map<string, InboxConversation[]>()
  for (const conv of conversations) {
    if (inboxSource(conv.key) !== 'canonical') continue
    const identity = dedupIdentity(conv)
    if (!identity) continue
    const bucket = canonicalByIdentity.get(identity)
    if (bucket) bucket.push(conv)
    else canonicalByIdentity.set(identity, [conv])
  }

  // Pass 2: las canónicas pasan siempre; las legacy se ocultan si hay canónico
  // para su identidad (acumulando no leídos en el más reciente) o se agrupan
  // entre sí (se conserva la más reciente) cuando no hay canónico.
  const visible: InboxConversation[] = []
  const legacyExtras = new Map<InboxConversation, number>()
  const legacyByIdentity = new Map<string, InboxConversation[]>()
  for (const conv of conversations) {
    if (inboxSource(conv.key) === 'canonical') {
      visible.push(conv)
      continue
    }
    const identity = dedupIdentity(conv)
    if (!identity) {
      visible.push(conv)
      continue
    }
    const canonicals = canonicalByIdentity.get(identity)
    if (canonicals && canonicals.length > 0) {
      suppressed.push(conv)
      const winner = canonicals
        .slice()
        .sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))[0]
      legacyExtras.set(winner, (legacyExtras.get(winner) ?? 0) + conv.unreadCount)
      continue
    }
    const bucket = legacyByIdentity.get(identity)
    if (bucket) bucket.push(conv)
    else legacyByIdentity.set(identity, [conv])
    visible.push(conv)
  }

  // Degenerado: dos legacy sin canónico → conservar la más reciente por identidad.
  const legacyDropped = new Map<InboxConversation, number>()
  for (const [identity, rows] of legacyByIdentity) {
    if (rows.length <= 1) continue
    const sorted = rows.slice().sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))
    const winner = sorted[0]
    for (const older of sorted.slice(1)) {
      suppressed.push(older)
      legacyDropped.set(winner, (legacyDropped.get(winner) ?? 0) + older.unreadCount)
      const idx = visible.indexOf(older)
      if (idx >= 0) visible.splice(idx, 1)
    }
    void identity
  }

  // Aplicar los no leídos acumulados de las filas ocultas.
  const list = visible.map((conv) => {
    const extra = (legacyExtras.get(conv) ?? 0) + (legacyDropped.get(conv) ?? 0)
    return extra > 0 ? { ...conv, unreadCount: conv.unreadCount + extra } : conv
  })

  return { list, suppressed }
}

// ---------- listado unificado ----------

async function listWhatsAppConversations(orgId: string, limit: number): Promise<InboxConversation[]> {
  try {
    const rows = await db.whatsAppConversation.findMany({
      where: { organizationId: orgId, status: 'active' },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      select: {
        id: true,
        contactPhone: true,
        contactName: true,
        lastMessage: true,
        lastMessageAt: true,
        lastMessageFrom: true,
        unreadCount: true,
        isAutoReply: true,
        clientId: true,
      },
    })
    return rows.map((c) => ({
      key: makeInboxKey('whatsapp', c.id),
      channel: 'whatsapp' as const,
      channelLabel: CHANNEL_LABELS.whatsapp,
      contactName: c.contactName || c.contactPhone,
      contactHandle: c.contactPhone,
      clientId: c.clientId,
      lastMessage: c.lastMessage || '',
      lastMessageAt: c.lastMessageAt?.toISOString() || null,
      lastMessageFrom: c.lastMessageFrom === 'out' ? ('out' as const) : ('in' as const),
      unreadCount: c.unreadCount,
      isAutoReply: c.isAutoReply,
    }))
  } catch (err) {
    console.error('[inbox] canal whatsapp no disponible', err)
    return []
  }
}

/**
 * Conversaciones derivadas de timeline (Telegram e Instagram).
 * Agrupa por cliente y calcula último mensaje + no leídos (metadata.direction==='in' sin readAt).
 */
async function listTimelineConversations(
  orgId: string,
  channel: 'telegram' | 'instagram' | 'facebook',
  limit: number
): Promise<InboxConversation[]> {
  try {
    const events = await db.timelineEvent.findMany({
      where: { organizationId: orgId, type: channel },
      orderBy: { createdAt: 'desc' },
      take: limit * 10,
    })
    const byClient = new Map<string, typeof events>()
    for (const e of events) {
      if (!e.clientId) continue
      const bucket = byClient.get(e.clientId)
      if (bucket) bucket.push(e)
      else byClient.set(e.clientId, [e])
    }

    const clientIds = [...byClient.keys()].slice(0, limit)
    if (clientIds.length === 0) return []
    const clients = await db.client.findMany({
      where: { organizationId: orgId, id: { in: clientIds } },
      select: { id: true, name: true, phone: true },
    })
    const clientById = new Map(clients.map((c) => [c.id, c]))

    return clientIds.map((clientId) => {
      const clientEvents = byClient.get(clientId)!
      const last = clientEvents[0]
      const lastMeta = safeMetadata(last.metadata)
      // Handle para enviar: el ÚLTIMO handle conocido del contacto en este canal.
      const handle =
        channel === 'telegram'
          ? String(lastMeta.chatId || '')
          : String(lastMeta.senderId || lastMeta.recipientId || '')
      const unread = clientEvents.filter((e) => {
        const meta = safeMetadata(e.metadata)
        return meta.direction === 'in' && !meta.readAt
      }).length
      const client = clientById.get(clientId)
      return {
        key: makeInboxKey(channel, clientId),
        channel,
        channelLabel: CHANNEL_LABELS[channel],
        contactName: client?.name || `Contacto ${CHANNEL_LABELS[channel]}`,
        contactHandle: handle,
        clientId,
        lastMessage: last.description || last.title || '',
        lastMessageAt: last.createdAt.toISOString(),
        lastMessageFrom: lastMeta.direction === 'out' ? ('out' as const) : ('in' as const),
        unreadCount: unread,
        isAutoReply: clientEvents.some((e) => e.source === 'agent'),
      } satisfies InboxConversation
    })
  } catch (err) {
    console.error(`[inbox] canal ${channel} no disponible`, err)
    return []
  }
}

/** Conversaciones nuevas: identidad estable por ChannelConversation y conexión exacta. */
async function listCanonicalChannelConversations(orgId: string, limit: number): Promise<InboxConversation[]> {
  try {
    const rows = await db.channelConversation.findMany({
      where: { organizationId: orgId, status: 'active', connection: { is: { organizationId: orgId } } },
      include: {
        connection: { select: { organizationId: true, displayName: true, status: true, channel: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { direction: true } },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    })
    return rows
      .filter((row) => ['whatsapp', 'instagram', 'facebook', 'telegram', 'tiktok'].includes(row.channel))
      .filter((row) => row.connection.status === 'connected' && row.connection.channel === row.channel)
      .map((row) => ({
        key: 'cc:' + row.id,
        channel: row.channel as InboxChannel,
        channelLabel: CHANNEL_LABELS[row.channel as InboxChannel] || 'WhatsApp',
        connectionName: row.connection.displayName || null,
        contactName: row.contactName || row.externalContactKey,
        contactHandle: row.externalContactKey,
        clientId: null,
        lastMessage: row.lastMessage || '',
        lastMessageAt: row.lastMessageAt?.toISOString() || null,
        lastMessageFrom: row.messages[0]?.direction === 'out' ? 'out' as const : 'in' as const,
        unreadCount: row.unreadCount,
        isAutoReply: false,
      }))
  } catch (err) {
    console.error('[inbox] conversaciones canónicas no disponibles', err)
    return []
  }
}

// ---------- filtros de la bandeja (F3, puros y testeables) ----------

export const INBOX_CHANNELS = ['whatsapp', 'telegram', 'instagram', 'facebook', 'tiktok'] as const

export interface InboxFilters {
  /** Canal exacto (allowlist INBOX_CHANNELS). Ignorado si viene vacío. */
  channel?: string
  /** Cuenta conectada (connectionName canónico). Las legacy no tienen cuenta y quedan excluidas. */
  connection?: string
  /** Búsqueda libre por nombre, teléfono y último mensaje (insensible a mayúsculas/formato). */
  q?: string
}

/**
 * Filtros del plan F3 sobre la lista YA deduplicada (M7): filtrar después del
 * dedup garantiza que "un contacto una vez" se mantenga también filtrado.
 * Búsqueda: nombre/handle/mensaje en texto libre + teléfono normalizado a
 * dígitos (que '+57 300…', '57300…' y '300…' encuentren lo mismo).
 */
export function filterInboxConversations(conversations: InboxConversation[], filters: InboxFilters): InboxConversation[] {
  const channel = filters.channel?.trim().toLowerCase()
  if (channel && !(INBOX_CHANNELS as readonly string[]).includes(channel)) return []
  const connection = filters.connection?.trim().toLowerCase()
  const q = filters.q?.trim().toLowerCase()
  if (!channel && !connection && !q) return conversations
  const qDigits = q ? q.replace(/\D/g, '') : ''
  return conversations.filter((c) => {
    if (channel && c.channel !== channel) return false
    if (connection && (c.connectionName || '').toLowerCase() !== connection) return false
    if (q) {
      const hay = `${c.contactName || ''} ${c.contactHandle || ''} ${c.lastMessage || ''}`.toLowerCase()
      if (!hay.includes(q)) {
        // Segunda oportunidad: solo dígitos (teléfono con o sin '+', espacios).
        if (qDigits.length >= 4) {
          const handleDigits = (c.contactHandle || '').replace(/\D/g, '')
          if (!handleDigits.includes(qDigits)) return false
        } else {
          return false
        }
      }
    }
    return true
  })
}

/**
 * Cuentas conectadas de la organización (para el selector "Cuenta" de la
 * bandeja): displayName de ChannelConnection activas, únicas y ordenadas.
 * Consulta barata que NO depende de que existan conversaciones.
 */
export async function listInboxAccounts(orgId: string): Promise<string[]> {
  try {
    const rows = await db.channelConnection.findMany({
      where: { organizationId: orgId, status: 'connected', displayName: { not: null } },
      select: { displayName: true },
      orderBy: { displayName: 'asc' },
    })
    return [...new Set(rows.map((r) => r.displayName!).filter(Boolean))]
  } catch (err) {
    console.error('[inbox] cuentas no disponibles', err)
    return []
  }
}

/** Lista unificada con criterio M7 (canónico primero), filtros F3 y orden por actividad. */
export async function listInbox(orgId: string, limit = 100, filters: InboxFilters = {}): Promise<InboxConversation[]> {
  const [canonical, wa, tg, ig, fb] = await Promise.all([
    listCanonicalChannelConversations(orgId, limit),
    listWhatsAppConversations(orgId, limit),
    listTimelineConversations(orgId, 'telegram', limit),
    listTimelineConversations(orgId, 'instagram', limit),
    listTimelineConversations(orgId, 'facebook', limit),
  ])
  // M7: el mismo contacto (canal+identidad) aparece UNA sola vez; gana el
  // modelo canónico y el legacy queda visible solo en la ficha del cliente.
  const { list } = dedupeInboxConversations([...canonical, ...wa, ...tg, ...ig, ...fb])
  // F3: filtros DESPUÉS del dedup (la bandeja filtrada nunca muestra duplicados).
  return filterInboxConversations(list, filters)
    .sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))
    .slice(0, limit)
}

// ---------- canales disponibles por cliente (IA de cierre) ----------

export interface ClientChannelOption {
  key: string
  channel: InboxChannel
  channelLabel: InboxConversation['channelLabel']
  /** Handle real para ENVIAR: teléfono WA / chatId TG / recipientId IG. */
  contactHandle: string
}

/**
 * Canales con conversación activa para UN cliente (los consume el diálogo de
 * IA de cierre para ofrecer "Enviar por …"). Misma resolución de handles que el
 * listado de la bandeja: wa:<convId> desde la tabla del daemon; tg:/ig:<clientId>
 * con el handle más reciente del timeline. Nunca lanza: un canal que falle
 * simplemente no se ofrece.
 */
export async function listClientChannels(orgId: string, clientId: string): Promise<ClientChannelOption[]> {
  const options: ClientChannelOption[] = []
  try {
    const conv = await db.whatsAppConversation.findFirst({
      where: { organizationId: orgId, clientId, status: 'active' },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true, contactPhone: true },
    })
    if (conv) {
      options.push({
        key: makeInboxKey('whatsapp', conv.id),
        channel: 'whatsapp',
        channelLabel: 'WhatsApp',
        contactHandle: conv.contactPhone,
      })
    }
  } catch (err) {
    console.error('[inbox] canal whatsapp (cliente) no disponible', err)
  }
  // No se ofrecen destinos WhatsApp directos legacy sin conversación canónica.

  try {
    const events = await db.timelineEvent.findMany({
      where: { organizationId: orgId, clientId, type: { in: ['telegram', 'instagram', 'facebook', 'tiktok'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { type: true, metadata: true },
    })
    const tg = events.find((e) => e.type === 'telegram' && safeMetadata(e.metadata).chatId)
    if (tg) {
      options.push({
        key: makeInboxKey('telegram', clientId),
        channel: 'telegram',
        channelLabel: 'Telegram',
        contactHandle: String(safeMetadata(tg.metadata).chatId),
      })
    }
    const ig = events.find((e) => {
      const m = safeMetadata(e.metadata)
      return e.type === 'instagram' && !!(m.senderId || m.recipientId)
    })
    if (ig) {
      const m = safeMetadata(ig.metadata)
      options.push({
        key: makeInboxKey('instagram', clientId),
        channel: 'instagram',
        channelLabel: 'Instagram',
        contactHandle: String(m.senderId || m.recipientId),
      })
    }
    const fb = events.find((e) => {
      const m = safeMetadata(e.metadata)
      return e.type === 'facebook' && !!(m.senderId || m.recipientId)
    })
    if (fb) {
      const m = safeMetadata(fb.metadata)
      options.push({
        key: makeInboxKey('facebook', clientId),
        channel: 'facebook',
        channelLabel: 'Messenger',
        contactHandle: String(m.senderId || m.recipientId),
      })
    }
    const tt = events.find((e) => {
      const m = safeMetadata(e.metadata)
      return e.type === 'tiktok' && !!m.canonicalConversationId && !!m.conversationId
    })
    if (tt) {
      const m = safeMetadata(tt.metadata)
      options.push({
        key: `cc:${String(m.canonicalConversationId)}`,
        channel: 'tiktok',
        channelLabel: 'TikTok',
        contactHandle: String(m.conversationId),
      })
    }
  } catch (err) {
    console.error('[inbox] canales timeline (cliente) no disponibles', err)
  }
  return options
}

// ---------- hilo de mensajes ----------

export async function getInboxMessages(orgId: string, key: string): Promise<InboxMessage[]> {
  const parsed = parseInboxKey(key)
  if (!parsed) return []

  if (key.startsWith('cc:')) {
    const conversation = await db.channelConversation.findFirst({
      where: { id: parsed.id, organizationId: orgId, connection: { is: { organizationId: orgId } } },
      select: { id: true, channel: true, connection: { select: { organizationId: true, status: true, channel: true } } },
    })
    if (!conversation || conversation.connection.status !== 'connected' || conversation.channel !== conversation.connection.channel) return []
    const [rows, pending] = await Promise.all([
      db.channelMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { id: true, direction: true, senderType: true, body: true, createdAt: true, messageType: true, metadata: true },
      }),
      db.channelOutboundMessage.findMany({
        where: { conversationId: conversation.id, status: { in: ['queued', 'sending', 'failed', 'unknown'] } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, body: true, status: true, createdAt: true },
      }),
    ])
    const persisted = rows.reverse().map((message) => ({
      id: message.id,
      direction: message.direction === 'out' ? 'out' as const : 'in' as const,
      senderType: message.senderType === 'agent' ? 'agent' as const : message.senderType === 'user' ? 'user' as const : 'contact' as const,
      text: message.body,
      createdAt: message.createdAt.toISOString(),
      ...(message.messageType === 'voice' ? { messageType: 'voice' } : {}),
      ...(() => {
        try {
          const metadata = message.metadata ? JSON.parse(message.metadata) as { deliveryStatus?: string } : {}
          return ['sent', 'delivered', 'read'].includes(metadata.deliveryStatus || '')
            ? { deliveryStatus: metadata.deliveryStatus as 'sent' | 'delivered' | 'read' }
            : metadata.deliveryStatus === 'failed'
              ? { deliveryStatus: 'delivery_failed' as const }
              : {}
        } catch {
          return {}
        }
      })(),
    }))
    const pendingMessages = pending.map((message) => ({
      id: `outbox:${message.id}`,
      direction: 'out' as const,
      senderType: 'user' as const,
      text: message.body,
      createdAt: message.createdAt.toISOString(),
      deliveryStatus: message.status as 'queued' | 'sending' | 'failed' | 'unknown',
    }))
    return [...persisted, ...pendingMessages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  if (!parsed.channel) return []

  if (parsed.channel === 'whatsapp') {
    const rows = await db.whatsAppMessage.findMany({
      where: { organizationId: orgId, conversationId: parsed.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, direction: true, senderType: true, text: true, createdAt: true, messageType: true },
    })
    return rows
      .map((m) => ({
        id: m.id,
        direction: m.direction === 'outbound' || m.direction === 'out' ? ('out' as const) : ('in' as const),
        senderType: m.senderType === 'contact' ? ('contact' as const) : m.senderType === 'agent' ? ('agent' as const) : ('user' as const),
        text: m.text || '',
        createdAt: m.createdAt.toISOString(),
        ...(m.messageType === 'voice' ? { messageType: 'voice' } : {}),
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  const events = await db.timelineEvent.findMany({
    where: { organizationId: orgId, type: parsed.channel, clientId: parsed.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return timelineToMessages(events)
}

/** Marca la conversación como leída (best-effort; nunca lanza). */
export async function markInboxRead(orgId: string, key: string): Promise<void> {
  const parsed = parseInboxKey(key)
  if (!parsed) return
  try {
    if (key.startsWith('cc:')) {
      const conversation = await db.channelConversation.findFirst({
        where: { id: parsed.id, organizationId: orgId, connection: { is: { organizationId: orgId } } },
        select: { channel: true, connection: { select: { organizationId: true, channel: true, status: true } } },
      })
      if (!conversation || conversation.connection.status !== 'connected' || conversation.channel !== conversation.connection.channel) return
      await db.channelConversation.updateMany({
        where: {
          id: parsed.id,
          organizationId: orgId,
          connection: { is: { organizationId: orgId, status: 'connected' } },
        },
        data: { unreadCount: 0 },
      })
      return
    }
    if (!parsed.channel) return
    if (parsed.channel === 'whatsapp') {
      await db.whatsAppConversation.updateMany({
        where: { organizationId: orgId, id: parsed.id },
        data: { unreadCount: 0 },
      })
      return
    }
    // Telegram/Instagram: marcar readAt en los eventos entrantes sin leer (acotado).
    const events = await db.timelineEvent.findMany({
      where: { organizationId: orgId, type: parsed.channel, clientId: parsed.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    for (const e of events) {
      const meta = safeMetadata(e.metadata)
      if (meta.direction === 'in' && !meta.readAt) {
        await db.timelineEvent.update({
          where: { id: e.id },
          data: { metadata: JSON.stringify({ ...meta, readAt: new Date().toISOString() }) },
        })
      }
    }
  } catch (err) {
    console.error('[inbox] markInboxRead falló (no bloquea)', err)
  }
}

// ---------- envío por canal ----------

export interface InboxSendResult {
  ok: boolean
  error?: string
}

/**
 * Los envíos legacy directos se han retirado. El endpoint de bandeja solo
 * admite conversaciones canónicas y persiste una intención en la outbox.
 */
export async function sendInboxMessage(opts: {
  orgId: string
  userId: string
  key: string
  contactHandle: string
  clientId?: string | null
  text: string
}): Promise<InboxSendResult> {
  if (opts.key.startsWith('cc:')) {
    return { ok: false, error: 'Usa el endpoint de la bandeja para encolar la conversación canónica.' }
  }
  return { ok: false, error: 'El envío legacy está deshabilitado; usa una conversación canónica de la outbox.' }
}
