import { describe, expect, it } from 'vitest'
import {
  dedupeInboxConversations, inboxSource, type InboxConversation,
} from '@/lib/inbox'

/**
 * M7 — criterio de unificación de la doble bandeja.
 * Función pura dedupeInboxConversations: un contacto, una fila en la bandeja;
 * canónico primero, legacy oculto (sin borrar datos), no leídos siempre visibles.
 */

function conv(overrides: Partial<InboxConversation>): InboxConversation {
  return {
    key: 'wa:legacy-1',
    channel: 'whatsapp',
    channelLabel: 'WhatsApp',
    contactName: 'Contacto',
    contactHandle: '573001110000',
    clientId: null,
    lastMessage: 'hola',
    lastMessageAt: '2026-11-20T10:00:00.000Z',
    lastMessageFrom: 'in',
    unreadCount: 0,
    isAutoReply: false,
    ...overrides,
  }
}

const CANONICA = conv({
  key: 'cc:canon-1',
  connectionName: 'Número Principal',
  contactHandle: '+573001110000', // Cloud API usa E.164; el daemon solo dígitos
  unreadCount: 2,
})

describe('M7 · inboxSource', () => {
  it('clasifica cc: como canónico y el resto como legacy', () => {
    expect(inboxSource('cc:abc')).toBe('canonical')
    expect(inboxSource('wa:abc')).toBe('legacy')
    expect(inboxSource('tg:client')).toBe('legacy')
  })
})

describe('M7 · contacto presente en ambas fuentes', () => {
  it('aparece UNA sola vez y gana el canónico', () => {
    const legacy = conv({ key: 'wa:legacy-1', contactHandle: '573001110000' })
    const { list, suppressed } = dedupeInboxConversations([legacy, CANONICA])
    expect(list).toHaveLength(1)
    expect(list[0].key).toBe('cc:canon-1')
    expect(isSuppressed(legacy, suppressed)).toBe(true)
  })

  it('el orden de llegada no cambia el veredicto', () => {
    const legacy = conv({ key: 'wa:legacy-1', contactHandle: '573001110000' })
    const a = dedupeInboxConversations([legacy, CANONICA])
    const b = dedupeInboxConversations([CANONICA, legacy])
    expect(a.list.map((c) => c.key)).toEqual(b.list.map((c) => c.key))
    expect(a.list[0].key).toBe('cc:canon-1')
  })

  it('los no leídos de la fila oculta se suman al ganador', () => {
    const legacy = conv({ key: 'wa:legacy-1', contactHandle: '573001110000', unreadCount: 3 })
    const { list } = dedupeInboxConversations([CANONICA, legacy])
    expect(list).toHaveLength(1)
    expect(list[0].unreadCount).toBe(5) // 2 canónica + 3 legacy
  })

  it('los teléfonos con formato distinto son el mismo contacto (+573 vs 573, espacios y guiones)', () => {
    const legacy = conv({ key: 'wa:legacy-1', contactHandle: '+57 (300) 111-0000' })
    const { list } = dedupeInboxConversations([CANONICA, legacy])
    expect(list).toHaveLength(1)
    expect(list[0].key).toBe('cc:canon-1')
  })

  it('cuando hay dos canónicas del mismo teléfono, la legacy se atribuye a la más reciente', () => {
    // Multi-número: números X y Y con el mismo contacto; la legacy del daemon
    // se suma a la conversación canónica con actividad más reciente.
    const canonX = conv({ key: 'cc:canon-x', lastMessageAt: '2026-11-18T10:00:00.000Z', unreadCount: 1 })
    const canonY = conv({ key: 'cc:canon-y', lastMessageAt: '2026-11-20T10:00:00.000Z', unreadCount: 1 })
    const legacy = conv({ key: 'wa:legacy-1', contactHandle: '573001110000', unreadCount: 4 })
    const { list, suppressed } = dedupeInboxConversations([canonX, canonY, legacy])
    expect(suppressed).toHaveLength(1)
    expect(list).toHaveLength(2)
    expect(list.map((c) => c.key).sort()).toEqual(['cc:canon-x', 'cc:canon-y'])
    const y = list.find((c) => c.key === 'cc:canon-y')!
    expect(y.unreadCount).toBe(5) // 1 propia + 4 de la legacy oculta
  })
})

describe('M7 · multi-número legítimo (canónicas NUNCA se ocultan entre sí)', () => {
  it('dos conversaciones canónicas del mismo teléfono permanecen visibles', () => {
    const numeroX = conv({ key: 'cc:canon-x', contactHandle: '+573001110000' })
    const numeroY = conv({ key: 'cc:canon-y', contactHandle: '+573001110000' })
    const { list, suppressed } = dedupeInboxConversations([numeroX, numeroY])
    expect(list).toHaveLength(2)
    expect(suppressed).toHaveLength(0)
  })
})

describe('M7 · contactos y canales distintos no se tocan', () => {
  it('teléfonos diferentes permanecen como filas separadas', () => {
    const a = conv({ key: 'wa:legacy-a', contactHandle: '573001110000' })
    const b = conv({ key: 'wa:legacy-b', contactHandle: '573002220000' })
    const { list } = dedupeInboxConversations([a, b])
    expect(list).toHaveLength(2)
  })

  it('el mismo número en canales distintos (whatsapp vs telegram) no se deduplica', () => {
    const wa = conv({ key: 'cc:wa-1', channel: 'whatsapp', contactHandle: '+573001110000' })
    const tg = conv({ key: 'tg:client-1', channel: 'telegram', contactHandle: '573001110000' })
    const { list } = dedupeInboxConversations([wa, tg])
    expect(list).toHaveLength(2)
  })

  it('una legacy sin canónico para su canal permanece visible', () => {
    const soloLegacy = conv({ key: 'tg:client-9', channel: 'telegram', contactHandle: '99911' })
    const { list, suppressed } = dedupeInboxConversations([CANONICA, soloLegacy])
    expect(list).toHaveLength(2)
    expect(isSuppressed(soloLegacy, suppressed)).toBe(false)
  })
})

describe('M7 · filas sin identidad fiable (fail-closed)', () => {
  it('handle vacío o teléfono inválido pasa intacto y no oculta nada', () => {
    const sinHandle = conv({ key: 'tg:client-2', channel: 'telegram', contactHandle: '' })
    const telefonoBasura = conv({ key: 'wa:legacy-x', contactHandle: 'abc' })
    const { list } = dedupeInboxConversations([CANONICA, sinHandle, telefonoBasura])
    expect(list).toHaveLength(3)
  })
})

describe('M7 · estado degenerado (dos legacy sin canónico)', () => {
  it('conserva la más reciente y suma los no leídos', () => {
    const vieja = conv({ key: 'wa:legacy-1', lastMessageAt: '2026-11-01T10:00:00.000Z', unreadCount: 2 })
    const nueva = conv({ key: 'wa:legacy-2', lastMessageAt: '2026-11-20T10:00:00.000Z', unreadCount: 1 })
    const { list, suppressed } = dedupeInboxConversations([vieja, nueva])
    expect(list).toHaveLength(1)
    expect(list[0].key).toBe('wa:legacy-2')
    expect(list[0].unreadCount).toBe(3)
    expect(isSuppressed(vieja, suppressed)).toBe(true)
  })

  it('el dedup es READ-ONLY: no muta las filas de entrada', () => {
    const legacy = conv({ key: 'wa:legacy-1', contactHandle: '573001110000', unreadCount: 3 })
    const entrada = [CANONICA, legacy]
    dedupeInboxConversations(entrada)
    expect(entrada[1].unreadCount).toBe(3)
    expect(entrada).toHaveLength(2)
  })
})

describe('M7 · conversaciones sin actividad reciente', () => {
  it('lastMessageAt null no rompe la atribución del ganador', () => {
    const canonSinFecha = conv({ key: 'cc:canon-2', lastMessageAt: null })
    const legacy = conv({ key: 'wa:legacy-1', contactHandle: '573001110000', unreadCount: 1 })
    const { list, suppressed } = dedupeInboxConversations([canonSinFecha, legacy])
    expect(list).toHaveLength(1)
    expect(list[0].key).toBe('cc:canon-2')
    expect(list[0].unreadCount).toBe(1)
    expect(suppressed).toHaveLength(1)
  })
})

/** Helper local: ¿la conversación está en la lista de ocultas (por key)? */
function isSuppressed(c: InboxConversation, suppressed: InboxConversation[]): boolean {
  return suppressed.some((s) => s.key === c.key)
}
