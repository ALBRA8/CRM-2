import { describe, expect, it } from 'vitest'
import {
  INBOX_UNIFICATION_RULE,
  inboxIdentityKey,
  dedupeInboxConversations,
  filterInboxConversations,
  parseInboxFilters,
  type InboxConversation,
} from '@/lib/inbox'

/**
 * M7 (plan definitivo) — criterio de unificación de la doble bandeja:
 * "canónico primero, legacy como respaldo". Funciones PURAS (regla 9):
 * sin BD, sin React.
 *
 * F3 — filtros server-side (canal / cuenta / búsqueda) también puros aquí.
 */

function conv(overrides: Partial<InboxConversation> = {}): InboxConversation {
  return {
    key: 'cc:conv-1',
    channel: 'whatsapp',
    channelLabel: 'WhatsApp',
    contactName: 'Ana Torres',
    contactHandle: '+573001110000',
    clientId: null,
    lastMessage: 'Hola, ¿sigue disponible?',
    lastMessageAt: '2026-11-20T10:00:00.000Z',
    lastMessageFrom: 'in',
    unreadCount: 1,
    isAutoReply: false,
    ...overrides,
  }
}

describe('INBOX_UNIFICATION_RULE: criterio documentado', () => {
  it('declara el criterio canónico primero', () => {
    expect(INBOX_UNIFICATION_RULE).toContain('canónico')
    expect(INBOX_UNIFICATION_RULE).toContain('legacy')
  })
})

describe('inboxIdentityKey: identidad de contacto para el dedup', () => {
  it('WhatsApp normaliza el teléfono: +57… y 57… son la misma identidad', () => {
    const a = inboxIdentityKey(conv({ key: 'cc:x1', contactHandle: '+57 300 111 0000' }))
    const b = inboxIdentityKey(conv({ key: 'wa:x2', contactHandle: '573001110000' }))
    expect(a).toBe(b)
    expect(a).toContain('whatsapp')
  })

  it('otros canales comparan handle en minúsculas sin espacios', () => {
    const a = inboxIdentityKey(conv({ key: 'cc:i1', channel: 'instagram', contactHandle: ' AnaShop ' }))
    const b = inboxIdentityKey(conv({ key: 'ig:i1', channel: 'instagram', contactHandle: 'anashop' }))
    expect(a).toBe(b)
  })

  it('distinto canal → distinta identidad (un contacto puede estar en IG y WA)', () => {
    const wa = inboxIdentityKey(conv({ key: 'cc:w', contactHandle: '+573001110000' }))
    const ig = inboxIdentityKey(conv({ key: 'cc:i', channel: 'instagram', contactHandle: '573001110000' }))
    expect(wa).not.toBe(ig)
  })

  it('handle vacío → identidad única por key (fail-open: nunca se esconde)', () => {
    const a = inboxIdentityKey(conv({ key: 'tg:c1', contactHandle: '' }))
    const b = inboxIdentityKey(conv({ key: 'tg:c2', contactHandle: '' }))
    expect(a).not.toBe(b)
    expect(a).toContain('unmatched')
  })
})

describe('dedupeInboxConversations: canónico primero, legacy como respaldo', () => {
  it('un contacto en cc: y wa: → solo la canónica queda visible', () => {
    const canonical = conv({ key: 'cc:c1', lastMessageAt: '2026-11-19T10:00:00.000Z' })
    const legacy = conv({ key: 'wa:w1', lastMessageAt: '2026-11-20T10:00:00.000Z' })
    const res = dedupeInboxConversations([legacy, canonical])
    expect(res.inbox).toHaveLength(1)
    expect(res.inbox[0].key).toBe('cc:c1')
    expect(res.suppressed).toHaveLength(1)
    expect(res.suppressed[0].conversation.key).toBe('wa:w1')
    expect(res.suppressed[0].winnerKey).toBe('cc:c1')
  })

  it('la canónica gana aunque la legacy sea más reciente (criterio, no frescura)', () => {
    const canonical = conv({ key: 'cc:c1', lastMessageAt: '2026-11-01T10:00:00.000Z' })
    const legacy = conv({ key: 'wa:w1', lastMessageAt: '2026-11-20T10:00:00.000Z' })
    const res = dedupeInboxConversations([canonical, legacy])
    expect(res.inbox[0].key).toBe('cc:c1')
  })

  it('sin canónica: wa: (daemon) gana sobre timeline del mismo contacto', () => {
    const legacyWa = conv({ key: 'wa:w1', lastMessageAt: '2026-11-18T10:00:00.000Z' })
    const timelineTg = conv({ key: 'tg:c1', channel: 'telegram', contactHandle: '555001', lastMessageAt: '2026-11-20T10:00:00.000Z' })
    // canales distintos: NO se deduplican entre sí
    const res = dedupeInboxConversations([legacyWa, timelineTg])
    expect(res.inbox).toHaveLength(2)
    expect(res.suppressed).toHaveLength(0)
  })

  it('dos legacy del mismo canal y sin cc → gana la más reciente', () => {
    const older = conv({ key: 'wa:w1', lastMessageAt: '2026-11-01T10:00:00.000Z' })
    const newer = conv({ key: 'wa:w2', lastMessageAt: '2026-11-20T10:00:00.000Z' })
    const res = dedupeInboxConversations([older, newer])
    expect(res.inbox).toHaveLength(1)
    expect(res.inbox[0].key).toBe('wa:w2')
  })

  it('contactos distintos no se tocan; orden de entrada no importa', () => {
    const list = [
      conv({ key: 'cc:c1', contactHandle: '+573001110000' }),
      conv({ key: 'cc:c2', contactHandle: '+573002220000' }),
      conv({ key: 'wa:w1', contactHandle: '+573002220000' }),
    ]
    const res = dedupeInboxConversations(list)
    expect(res.inbox).toHaveLength(2)
    expect(res.inbox.map((c) => c.key).sort()).toEqual(['cc:c1', 'cc:c2'])
  })

  it('lista vacía → resultado vacío sin lanzar', () => {
    expect(dedupeInboxConversations([])).toEqual({ inbox: [], suppressed: [] })
  })

  it('NO muta la lista de entrada (read-only sobre las fuentes)', () => {
    const list = [conv({ key: 'wa:w1' }), conv({ key: 'cc:c1' })]
    const snapshot = JSON.stringify(list)
    dedupeInboxConversations(list)
    expect(JSON.stringify(list)).toBe(snapshot)
  })
})

describe('filterInboxConversations: filtros F3', () => {
  const list: InboxConversation[] = [
    conv({ key: 'cc:c1', channel: 'whatsapp', connectionName: 'ALBRA Ventas', contactName: 'Ana Torres', contactHandle: '+573001110000' }),
    conv({ key: 'cc:c2', channel: 'instagram', connectionName: 'IG Tienda', contactName: 'Bruno Díaz', contactHandle: 'bruno_shop' }),
    conv({ key: 'tg:c1', channel: 'telegram', contactName: 'Caro Ruiz', contactHandle: '555001' }),
  ]

  it('filtro por canal', () => {
    const out = filterInboxConversations(list, { channel: 'whatsapp' })
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('cc:c1')
  })

  it("'all' y sin filtros devuelven todo", () => {
    expect(filterInboxConversations(list, {})).toHaveLength(3)
    expect(filterInboxConversations(list, { channel: 'all' })).toHaveLength(3)
  })

  it('filtro por cuenta (displayName exacto, case-insensitive)', () => {
    const out = filterInboxConversations(list, { account: 'ig tienda' })
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('cc:c2')
    // cuenta sin conversaciones → lista vacía, nunca error
    expect(filterInboxConversations(list, { account: 'no existe' })).toHaveLength(0)
  })

  it('búsqueda por nombre y por teléfono/handle, case-insensitive', () => {
    expect(filterInboxConversations(list, { search: 'ana' }).map((c) => c.key)).toEqual(['cc:c1'])
    expect(filterInboxConversations(list, { search: '573001110000' }).map((c) => c.key)).toEqual(['cc:c1'])
    expect(filterInboxConversations(list, { search: 'BRUNO' }).map((c) => c.key)).toEqual(['cc:c2'])
    expect(filterInboxConversations(list, { search: '555001' }).map((c) => c.key)).toEqual(['tg:c1'])
  })

  it('filtros combinados: canal + búsqueda', () => {
    const out = filterInboxConversations(list, { channel: 'whatsapp', search: 'bruno' })
    expect(out).toHaveLength(0)
    const out2 = filterInboxConversations(list, { channel: 'whatsapp', search: 'torres' })
    expect(out2.map((c) => c.key)).toEqual(['cc:c1'])
  })
})

describe('parseInboxFilters: validación fail-closed de la API', () => {
  it('canal válido se acepta, inválido se descarta', () => {
    expect(parseInboxFilters({ channel: 'whatsapp' }).channel).toBe('whatsapp')
    expect(parseInboxFilters({ channel: 'napoleon' }).channel).toBeUndefined()
    expect(parseInboxFilters({ channel: null }).channel).toBeUndefined()
    expect(parseInboxFilters({ channel: '' }).channel).toBeUndefined()
  })

  it('los cinco canales del CRM son válidos', () => {
    for (const ch of ['whatsapp', 'telegram', 'instagram', 'facebook', 'tiktok']) {
      expect(parseInboxFilters({ channel: ch }).channel).toBe(ch)
    }
  })

  it('account y search se recortan a límites y descartan vacíos', () => {
    expect(parseInboxFilters({ account: '  Cuenta A  ' }).account).toBe('Cuenta A')
    expect(parseInboxFilters({ search: '   ' }).search).toBeUndefined()
    expect(parseInboxFilters({ search: 'x'.repeat(150) }).search?.length).toBe(100)
    expect(parseInboxFilters({ account: 'x'.repeat(150) }).account?.length).toBe(120)
  })

  it('sin parámetros devuelve objeto vacío', () => {
    expect(parseInboxFilters({})).toEqual({})
  })
})
