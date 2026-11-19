import { describe, expect, it } from 'vitest'
import { makeInboxKey, parseInboxKey, timelineToMessages, type InboxConversation } from '@/lib/inbox'

/**
 * Funciones puras de la bandeja omnicanal (Fase 4):
 *  - Keys estables "wa:<id>" | "tg:<id>" | "ig:<id>" | "fb:<id>" con parseo fail-closed.
 *  - Normalización de TimelineEvent → InboxMessage (dirección, remitente, orden).
 *  - Merge determinista de listas por actividad reciente.
 */

describe('makeInboxKey / parseInboxKey', () => {
  it('hace roundtrip por los 4 canales', () => {
    expect(parseInboxKey(makeInboxKey('whatsapp', 'conv-1'))).toEqual({ channel: 'whatsapp', id: 'conv-1' })
    expect(parseInboxKey(makeInboxKey('telegram', 'client-2'))).toEqual({ channel: 'telegram', id: 'client-2' })
    expect(parseInboxKey(makeInboxKey('instagram', 'client-3'))).toEqual({ channel: 'instagram', id: 'client-3' })
    expect(parseInboxKey(makeInboxKey('facebook', 'client-4'))).toEqual({ channel: 'facebook', id: 'client-4' })
  })

  it('acepta ids con caracteres de cuid, teléfono y chat id negativo', () => {
    expect(parseInboxKey('wa:cmuhwmllp0002givy0mtqcz0i')?.id).toBe('cmuhwmllp0002givy0mtqcz0i')
    expect(parseInboxKey('wa:+573001112233')?.id).toBe('+573001112233')
    expect(parseInboxKey('tg:-100123456')?.id).toBe('-100123456')
  })

  it('rechaza (fail-closed) keys malformadas', () => {
    expect(parseInboxKey('')).toBeNull()
    expect(parseInboxKey('wa')).toBeNull()
    expect(parseInboxKey(':sin-prefix')).toBeNull()
    expect(parseInboxKey('wa:')).toBeNull()
    expect(parseInboxKey('xx:prefijo-desconocido')).toBeNull()
    expect(parseInboxKey('wa:con espacio')).toBeNull()
    expect(parseInboxKey('wa:' + 'x'.repeat(300))).toBeNull()
    expect(parseInboxKey(null as unknown as string)).toBeNull()
    expect(parseInboxKey(42 as unknown as string)).toBeNull()
  })
})

describe('timelineToMessages', () => {
  const base = { title: 'Mensaje', source: 'integration' }

  it('normaliza dirección y remitente (in→contacto, out+agent→agente, out+manual→usuario)', () => {
    const now = new Date('2026-01-01T10:00:00Z')
    const msgs = timelineToMessages([
      { id: 'e1', description: 'hola', metadata: JSON.stringify({ direction: 'in' }), createdAt: now, ...base },
      { id: 'e2', title: 'Mensaje', description: 'respuesta IA', metadata: JSON.stringify({ direction: 'out' }), createdAt: now, source: 'agent' },
      { id: 'e3', title: 'Mensaje', description: 'respuesta humana', metadata: JSON.stringify({ direction: 'out' }), createdAt: now, source: 'manual' },
      { id: 'e4', description: 'sin metadata', metadata: null, createdAt: now, ...base },
    ])
    expect(msgs.map((m) => m.senderType)).toEqual(['contact', 'agent', 'user', 'contact'])
    expect(msgs.map((m) => m.direction)).toEqual(['in', 'out', 'out', 'in'])
  })

  it('ordena ascendente por fecha aunque los eventos lleguen al revés', () => {
    const msgs = timelineToMessages([
      { id: 'late', description: 'último', metadata: '{"direction":"in"}', createdAt: new Date('2026-01-02T00:00:00Z'), ...base },
      { id: 'early', description: 'primero', metadata: '{"direction":"in"}', createdAt: new Date('2026-01-01T00:00:00Z'), ...base },
    ])
    expect(msgs.map((m) => m.id)).toEqual(['early', 'late'])
  })

  it('metadata corrupta → se trata como entrante sin lanzar', () => {
    const msgs = timelineToMessages([
      { id: 'x', description: 'rompe', metadata: '{no-json', createdAt: new Date('2026-01-01T00:00:00Z'), ...base },
    ])
    expect(msgs[0].direction).toBe('in')
    expect(msgs[0].text).toBe('rompe')
  })
})

describe('orden del merge (invariante del listado)', () => {
  it('las conversaciones quedan por actividad reciente aunque entren por canal distinto', () => {
    const conv = (key: string, at: string | null): InboxConversation => ({
      key,
      channel: key.startsWith('wa:') ? 'whatsapp' : key.startsWith('tg:') ? 'telegram' : 'instagram',
      channelLabel: 'WhatsApp',
      contactName: key,
      contactHandle: 'x',
      clientId: null,
      lastMessage: '',
      lastMessageAt: at,
      lastMessageFrom: 'in',
      unreadCount: 0,
      isAutoReply: false,
    })
    const merged = [conv('wa:1', '2026-01-03T00:00:00Z'), conv('tg:2', '2026-01-05T00:00:00Z'), conv('ig:3', null)]
      .sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))
    expect(merged.map((c) => c.key)).toEqual(['tg:2', 'wa:1', 'ig:3'])
  })
})

// ---------- (M7 / F3-T03) unificación de la doble bandeja ----------

import { dedupeInboxConversations, inboxIdentity, isCanonicalInboxKey } from '@/lib/inbox'

function makeConv(key: string, opts: Partial<InboxConversation> = {}): InboxConversation {
  const channel = key.startsWith('cc:') ? 'whatsapp' : key.startsWith('wa:') ? 'whatsapp' : key.startsWith('tg:') ? 'telegram' : 'instagram'
  return {
    key,
    channel,
    channelLabel: 'WhatsApp',
    contactName: `contacto ${key}`,
    contactHandle: '573001110000',
    clientId: null,
    lastMessage: 'hola',
    lastMessageAt: '2026-01-01T00:00:00Z',
    lastMessageFrom: 'in',
    unreadCount: 0,
    isAutoReply: false,
    ...opts,
  }
}

describe('M7 · isCanonicalInboxKey / inboxIdentity', () => {
  it('reconoce canónicas cc: y rechaza legacy', () => {
    expect(isCanonicalInboxKey('cc:conv-1')).toBe(true)
    expect(isCanonicalInboxKey('wa:conv-1')).toBe(false)
    expect(isCanonicalInboxKey('tg:-100')).toBe(false)
  })

  it('whatsapp: identidad por dígitos — el + del webhook canónico y el daemon colisionan', () => {
    expect(inboxIdentity({ channel: 'whatsapp', contactHandle: '+573001110000' }))
      .toBe('whatsapp:573001110000')
    expect(inboxIdentity({ channel: 'whatsapp', contactHandle: '57 300 111 0000' }))
      .toBe('whatsapp:573001110000')
    expect(inboxIdentity({ channel: 'whatsapp', contactHandle: 'abc' })).toBeNull()
    expect(inboxIdentity({ channel: 'whatsapp', contactHandle: '' })).toBeNull()
  })

  it('otros canales: identidad por handle tal cual (conservador)', () => {
    expect(inboxIdentity({ channel: 'telegram', contactHandle: '-100123' })).toBe('telegram:-100123')
    expect(inboxIdentity({ channel: 'instagram', contactHandle: ' albra_shop ' })).toBe('instagram:albra_shop')
    // case-sensitive: NO se unifica albra_shop vs ALBRA_SHOP (falso negativo solo muestra 2 filas)
    expect(inboxIdentity({ channel: 'instagram', contactHandle: 'ALBRA_SHOP' })).toBe('instagram:ALBRA_SHOP')
  })
})

describe('M7 · dedupeInboxConversations — contacto presente en AMBAS fuentes', () => {
  it('canónica + daemon del mismo teléfono: aparece UNA vez (la canónica)', () => {
    const list = [
      makeConv('cc:canon-1', { contactHandle: '+573001110000', connectionName: 'ALBRA Ventas', lastMessageAt: '2026-01-02T00:00:00Z' }),
      makeConv('wa:daemon-1', { contactHandle: '573001110000', lastMessageAt: '2026-01-01T00:00:00Z' }),
    ].sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))
    const out = dedupeInboxConversations(list)
    expect(out.map((c) => c.key)).toEqual(['cc:canon-1'])
    expect(out[0].connectionName).toBe('ALBRA Ventas')
  })

  it('canónica + timeline del mismo handle: la legacy tg:/ig: se oculta', () => {
    const list = [
      makeConv('cc:canon-tg', { channel: 'telegram', contactHandle: '-100123', lastMessageAt: '2026-01-03T00:00:00Z' }),
      makeConv('tg:client-9', { channel: 'telegram', contactHandle: '-100123', lastMessageAt: '2026-01-02T00:00:00Z' }),
    ].sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))
    expect(dedupeInboxConversations(list).map((c) => c.key)).toEqual(['cc:canon-tg'])
  })

  it('la canónica gana AUNQUE la legacy sea más reciente (criterio de modelo, no de fecha)', () => {
    const list = [
      makeConv('wa:daemon-1', { contactHandle: '573001110000', lastMessageAt: '2026-01-10T00:00:00Z' }),
      makeConv('cc:canon-1', { contactHandle: '+573001110000', lastMessageAt: '2026-01-01T00:00:00Z' }),
    ].sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))
    expect(dedupeInboxConversations(list).map((c) => c.key)).toEqual(['cc:canon-1'])
  })

  it('legacy SIN canónica con su identidad: sigue visible (respaldo)', () => {
    const list = [
      makeConv('cc:canon-otro', { contactHandle: '+573999999999', lastMessageAt: '2026-01-05T00:00:00Z' }),
      makeConv('wa:daemon-1', { contactHandle: '573001110000', lastMessageAt: '2026-01-01T00:00:00Z' }),
    ].sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))
    expect(dedupeInboxConversations(list).map((c) => c.key)).toEqual(['cc:canon-otro', 'wa:daemon-1'])
  })

  it('dos canónicas del mismo teléfono por distinta cuenta: NO se colapsan (hilos reales)', () => {
    const list = [
      makeConv('cc:c1', { contactHandle: '+573001110000', connectionName: 'Ventas', lastMessageAt: '2026-01-02T00:00:00Z' }),
      makeConv('cc:c2', { contactHandle: '+573001110000', connectionName: 'Soporte', lastMessageAt: '2026-01-01T00:00:00Z' }),
    ].sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))
    expect(dedupeInboxConversations(list).map((c) => c.key)).toEqual(['cc:c1', 'cc:c2'])
  })

  it('duplicadas legacy del mismo teléfono: gana la más reciente (defensa interna)', () => {
    const list = [
      makeConv('wa:reciente', { contactHandle: '573001110000', lastMessageAt: '2026-01-03T00:00:00Z' }),
      makeConv('wa:vieja', { contactHandle: '573001110000', lastMessageAt: '2026-01-01T00:00:00Z' }),
    ].sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))
    expect(dedupeInboxConversations(list).map((c) => c.key)).toEqual(['wa:reciente'])
  })

  it('sin handle útil: pasa tal cual (fail-open informativo, nada se oculta)', () => {
    const list = [
      makeConv('cc:canon-x', { contactHandle: '', lastMessageAt: '2026-01-02T00:00:00Z' }),
      makeConv('wa:daemon-x', { contactHandle: '573001110000', lastMessageAt: '2026-01-01T00:00:00Z' }),
    ]
    const out = dedupeInboxConversations(list)
    expect(out.map((c) => c.key)).toEqual(['cc:canon-x', 'wa:daemon-x'])
  })

  it('no muta la entrada y tolera listas vacías / basura', () => {
    const list = [makeConv('wa:1'), makeConv('cc:1', { contactHandle: '+573001110000' })]
    const snapshot = JSON.stringify(list)
    dedupeInboxConversations(list)
    expect(JSON.stringify(list)).toBe(snapshot)
    expect(dedupeInboxConversations([])).toEqual([])
    expect(dedupeInboxConversations(undefined as unknown as InboxConversation[])).toEqual([])
  })

  it('mezcla completa: 3 canónicas + 3 legacy (1 tapada, 1 dup, 1 visible)', () => {
    const list = [
      makeConv('cc:a', { contactHandle: '+571110000', connectionName: 'Cuenta A', lastMessageAt: '2026-01-06T00:00:00Z' }),
      makeConv('wa:tapada', { contactHandle: '571110000', lastMessageAt: '2026-01-05T00:00:00Z' }), // identidad de cc:a → fuera
      makeConv('cc:b', { contactHandle: '+572220000', connectionName: 'Cuenta B', lastMessageAt: '2026-01-04T00:00:00Z' }),
      makeConv('tg:dup', { channel: 'telegram', contactHandle: '-777', lastMessageAt: '2026-01-03T00:00:00Z' }),
      makeConv('tg:dup-2', { channel: 'telegram', contactHandle: '-777', lastMessageAt: '2026-01-02T00:00:00Z' }), // dup intra-legacy → fuera
      makeConv('ig:visible', { channel: 'instagram', contactHandle: 'shop', lastMessageAt: '2026-01-01T00:00:00Z' }), // sin canónica → visible
    ].sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))
    expect(dedupeInboxConversations(list).map((c) => c.key)).toEqual(['cc:a', 'cc:b', 'tg:dup', 'ig:visible'])
  })
})

// ---------- (F3 / F3-T04) filtros server-side de la bandeja ----------

import { filterInboxConversations, normalizeSearchText, type InboxFilters } from '@/lib/inbox'

describe('F3 · normalizeSearchText', () => {
  it('minúsculas y sin acentos', () => {
    expect(normalizeSearchText('José García')).toBe('jose garcia')
    expect(normalizeSearchText('  ÑANDÚ  ')).toBe('nandu')
    expect(normalizeSearchText(null)).toBe('')
    expect(normalizeSearchText('')).toBe('')
  })
})

describe('F3 · filterInboxConversations', () => {
  const base = {
    channelLabel: 'WhatsApp' as const,
    clientId: null,
    lastMessageFrom: 'in' as const,
    unreadCount: 0,
    isAutoReply: false,
    lastMessageAt: '2026-01-01T00:00:00Z',
    lastMessage: '',
  }
  const list: InboxConversation[] = [
    { ...base, key: 'cc:c1', channel: 'whatsapp', connectionId: 'conn-a', connectionName: 'Ventas', contactName: 'José García', contactHandle: '+573001110000', lastMessage: 'Quiero una cotización' },
    { ...base, key: 'cc:c2', channel: 'whatsapp', connectionId: 'conn-b', connectionName: 'Soporte', contactName: 'María Pérez', contactHandle: '+573002220000', lastMessage: 'Hola' },
    { ...base, key: 'wa:legacy', channel: 'whatsapp', connectionId: null, connectionName: null, contactName: 'WA Legacy', contactHandle: '573001110000' },
    { ...base, key: 'tg:c3', channel: 'telegram', connectionId: null, connectionName: null, contactName: 'José TG', contactHandle: '555001' },
    { ...base, key: 'ig:c4', channel: 'instagram', connectionId: 'conn-a', connectionName: 'Ventas', contactName: 'IG Fan', contactHandle: 'ig-user-1' },
  ]

  it('sin filtros: pasa todo', () => {
    expect(filterInboxConversations(list, {})).toHaveLength(5)
    expect(filterInboxConversations(list, { query: '' })).toHaveLength(5)
  })

  it('filtro por canal exacto', () => {
    const out = filterInboxConversations(list, { channel: 'whatsapp' })
    expect(out.map((c) => c.key)).toEqual(['cc:c1', 'cc:c2', 'wa:legacy'])
  })

  it('filtro por cuenta: solo canónicas enlazadas; las legacy quedan fuera', () => {
    const out = filterInboxConversations(list, { connectionId: 'conn-a' })
    expect(out.map((c) => c.key)).toEqual(['cc:c1', 'ig:c4'])
    // una legacy no puede afirmar su cuenta: no aparece bajo ninguna cuenta
    expect(filterInboxConversations(list, { connectionId: 'conn-x' })).toEqual([])
  })

  it('búsqueda por nombre SIN acentos y case-insensitive', () => {
    const out = filterInboxConversations(list, { query: 'jose garcia' })
    expect(out.map((c) => c.key)).toEqual(['cc:c1'])
  })

  it('búsqueda por teléfono con y sin +', () => {
    expect(filterInboxConversations(list, { query: '+573001110000' }).map((c) => c.key)).toEqual(['cc:c1'])
    expect(filterInboxConversations(list, { query: '573001110000' }).map((c) => c.key)).toEqual(['cc:c1', 'wa:legacy'])
  })

  it('búsqueda por contenido del último mensaje', () => {
    const out = filterInboxConversations(list, { query: 'cotización' })
    expect(out.map((c) => c.key)).toEqual(['cc:c1'])
  })

  it('canal + cuenta + búsqueda combinados', () => {
    const filters: InboxFilters = { channel: 'instagram', connectionId: 'conn-a', query: 'fan' }
    expect(filterInboxConversations(list, filters).map((c) => c.key)).toEqual(['ig:c4'])
    const nada: InboxFilters = { channel: 'telegram', connectionId: 'conn-a' }
    expect(filterInboxConversations(list, nada)).toEqual([])
  })

  it('query de solo espacios tras normalizar: se ignora (no filtra todo)', () => {
    expect(filterInboxConversations(list, { query: '   ' })).toHaveLength(5)
  })

  it('defensivo: lista nula → vacío', () => {
    expect(filterInboxConversations(null as unknown as InboxConversation[], {})).toEqual([])
  })
})
