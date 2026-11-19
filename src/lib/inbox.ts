import { db } from './db'

/**
 * Bandeja omnicanal (Fase 4 del plan maestro).
 *
 * Unifica en una sola lista las conversaciones de los 4 canales:
 *   - WhatsApp (daemon Baileys) → tabla WhatsAppConversation/WhatsAppMessage
 *   - Telegram  → TimelineEvent type="telegram" agrupado por cliente
 *   - Instagram → TimelineEvent type="instagram" agrupado por cliente
 *   - Facebook  → TimelineEvent type="facebook" agrupado por cliente (Messenger de la Página)
 *   - TikTok / WhatsApp Cloud / canales nuevos → modelo canónico Channel*
 *
 * Decisiones de diseño:
 *  - Cada conversación tiene una `key` estable: "wa:<convId>" | "tg:<clientId>" | "ig:<clientId>" | "cc:<id>".
 *    Es el único identificador que viaja al frontend y vuelve en cada petición.
 *  - El merge es READ-ONLY sobre las fuentes (no migra datos): Telegram/Instagram
 *    ya viven como timeline y WhatsApp como tablas propias; la bandeja es una
 *    vista coherente encima. Cero riesgo de duplicación o pérdida.
 *  - (M7, plan definitivo) CRITERIO DE UNIFICACIÓN DE LA DOBLE BANDEJA —
 *    "canónico primero, legacy como respaldo": si el MISMO contacto aparece
 *    en el modelo canónico (cc:) y en una fuente legacy (wa:/tg:/ig:/fb:) del
 *    mismo canal, la conversación CANÓNICA gana y la legacy se suprime del
 *    listado (queda accesible vía ficha 360; SIN borrar datos). El criterio
 *    vive en dedupeInboxConversations() (puro, con pruebas) y la constante
 *    INBOX_UNIFICATION_RULE lo documenta para operadores y auditoría.
 *  - (F3, plan definitivo) La bandeja expone filtros server-side por canal,
 *    cuenta conectada y búsqueda por nombre/teléfono (filterInboxConversations,
 *    puro y con pruebas), con paginación por offset para mantener el
 *    rendimiento sobre SQLite.
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

// ---------- (M7) unificación de la doble bandeja: criterio y dedup ----------

/**
 * Criterio de unificación aprobado para la bandeja única (M7, plan definitivo):
 * "canónico primero, legacy como respaldo". Un contacto del mismo canal aparece
 * UNA sola vez; la fuente canónica (cc:) gana y la legacy se suprime del
 * listado sin borrado de datos (el historial completo sigue en la ficha 360).
 */
export const INBOX_UNIFICATION_RULE = 'canónico primero, legacy como respaldo' as const

/**
 * Prioridad de fuente por prefijo de key: mayor número gana. cc: (modelo
 * canónico, 3) > wa: (daemon, 2) > tg:/ig:/fb: (timeline, 1). Desconocido → 0.
 */
const SOURCE_PRIORITY: Record<string, number> = { cc: 3, wa: 2, tg: 1, ig: 1, fb: 1 }

/**
 * Identidad de contacto para el dedup: (canal, handle normalizado). Para
 * WhatsApp se compara por teléfono E.164 sin '+' (normalizeWaPhone); para los
 * demás canales el handle se compara en minúsculas y sin espacios. Si el
 * handle es vacío la identidad es única (no se puede agrupar: fail-open para
 * NO esconder conversaciones).
 */
export function inboxIdentityKey(conv: InboxConversation): string {
  const prefix = conv.key.split(':')[0] ?? ''
  const handle = conv.channel === 'whatsapp'
    ? normalizeWaPhone(conv.contactHandle)
    : conv.contactHandle.trim().toLowerCase()
  if (!handle) return `unmatched:${conv.key}`
  return `${conv.channel}::${handle}`
}

export interface DedupeResult {
  /** Lista deduplicada: el ganador de cada identidad. */
  inbox: InboxConversation[]
  /** Conversaciones suprimidas por el criterio, con su ganadora (auditoría/UI). */
  suppressed: Array<{ conversation: InboxConversation; winnerKey: string }>
}

/**
 * Dedup READ-ONLY de la bandeja por identidad de contacto (M7):
 *  - agrupa por inboxIdentityKey;
 *  - dentro de cada grupo gana la de mayor prioridad de fuente (cc > wa > timeline),
 *    desempate por actividad más reciente;
 *  - NO muta la entrada y NO borra datos: solo decide qué conversación se ve.
 */
export function dedupeInboxConversations(conversations: InboxConversation[]): DedupeResult {
  const byIdentity = new Map<string, InboxConversation[]>()
  for (const conv of conversations) {
    const identity = inboxIdentityKey(conv)
    const bucket = byIdentity.get(identity)
    if (bucket) bucket.push(conv)
    else byIdentity.set(identity, [conv])
  }
  const inbox: InboxConversation[] = []
  const suppressed: DedupeResult['suppressed'] = []
  for (const group of byIdentity.values()) {
    if (group.length === 1) {
      inbox.push(group[0])
      continue
    }
    const winner = [...group].sort((a, b) => {
      const prio = (c: InboxConversation) => SOURCE_PRIORITY[c.key.split(':')[0] ?? ''] ?? 0
      if (prio(b) !== prio(a)) return prio(b) - prio(a)
      return (b.lastMessageAt || '').localeCompare(a.lastMessageAt || '')
    })[0]
    inbox.push(winner)
    for (const loser of group) {
      if (loser.key !== winner.key) suppressed.push({ conversation: loser, winnerKey: winner.key })
    }
  }
  return { inbox, suppressed }
}

// ---------- (F3) filtros server-side de la bandeja ----------

export interface InboxFilters {
  /** Canal exacto; 'all' o ausente = todos. */
  channel?: InboxChannel | 'all'
  /** Cuenta conectada por displayName exacto (solo conversaciones cc: la exponen). */
  account?: string
  /** Búsqueda case-insensitive por nombre de contacto o handle (teléfono/chat). */
  search?: string
}

const INBOX_CHANNELS: InboxChannel[] = ['whatsapp', 'telegram', 'instagram', 'facebook', 'tiktok']

/** Valida y normaliza los filtros de la API (fail-closed: valor inválido → undefined). */
export function parseInboxFilters(params: {
  channel?: string | null
  account?: string | null
  search?: string | null
}): InboxFilters {
  const channel = params.channel && INBOX_CHANNELS.includes(params.channel as InboxChannel)
    ? (params.channel as InboxChannel)
    : undefined
  const account = params.account && params.account.trim() ? params.account.trim().slice(0, 120) : undefined
  const search = params.search && params.search.trim() ? params.search.trim().slice(0, 100) : undefined
  return { ...(channel ? { channel } : {}), ...(account ? { account } : {}), ...(search ? { search } : {}) }
}

/**
 * Filtro puro de la bandeja (F3): canal, cuenta conectada y búsqueda por
 * nombre/handle. Separado del fetch para poder probarlo sin BD y reutilizarlo
 * en UI si el listado viene completo.
 */
export function filterInboxConversations(
  conversations: InboxConversation[],
  filters: InboxFilters,
): InboxConversation[] {
  let out = conversations
  if (filters.channel && filters.channel !== 'all') {
    out = out.filter((c) => c.channel === filters.channel)
  }
  if (filters.account) {
    const account = filters.account.toLowerCase()
    out = out.filter((c) => (c.connectionName ?? '').toLowerCase() === account)
  }
  if (filters.search) {
    const q = filters.search.toLowerCase()
    out = out.filter((c) =>
      c.contactName.toLowerCase().includes(q) || c.contactHandle.toLowerCase().includes(q)
    )
  }
  return out
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

/** Lista unificada SIN dedup (compat: página completa como antes del M7). */
export async function listInboxRaw(orgId: string, limit = 100): Promise<InboxConversation[]> {
  const [canonical, wa, tg, ig, fb] = await Promise.all([
    listCanonicalChannelConversations(orgId, limit),
    listWhatsAppConversations(orgId, limit),
    listTimelineConversations(orgId, 'telegram', limit),
    listTimelineConversations(orgId, 'instagram', limit),
    listTimelineConversations(orgId, 'facebook', limit),
  ])
  return [...canonical, ...wa, ...tg, ...ig, ...fb]
    .sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))
    .slice(0, limit)
}

export interface ListInboxOptions extends InboxFilters {
  limit?: number
  offset?: number
}

export interface ListInboxResult {
  /** Página de conversaciones (dedup aplicado, orden por actividad). */
  conversations: InboxConversation[]
  /** Conversaciones legacy suprimidas por el criterio de unificación (M7). */
  suppressedCount: number
  /** true si quedan conversaciones después de esta página (paginación F3). */
  hasMore: boolean
}

/**
 * Bandeja única final (M7 + F3): merge de fuentes → dedup "canónico primero"
 * → filtros server-side → página por offset. READ-ONLY: nunca borra datos;
 * el historial suprimido sigue en la ficha 360.
 */
export async function listInboxPage(orgId: string, options: ListInboxOptions = {}): Promise<ListInboxResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const all = await listInboxRaw(orgId, 200)
  const { inbox, suppressed } = dedupeInboxConversations(all)
  const filtered = filterInboxConversations(
    [...inbox].sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || '')),
    options,
  )
  return {
    conversations: filtered.slice(offset, offset + limit),
    suppressedCount: suppressed.length,
    hasMore: offset + limit < filtered.length,
  }
}

/** Lista unificada, ordenada por actividad reciente (compat: sin dedup ni filtros). */
export async function listInbox(orgId: string, limit = 100): Promise<InboxConversation[]> {
  return listInboxRaw(orgId, limit)
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
