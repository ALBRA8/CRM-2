import { describe, expect, it } from 'vitest'
import { filterInboxConversations, INBOX_CHANNELS, type InboxConversation } from '@/lib/inbox'

/**
 * F3 — filtros de la bandeja (función pura filterInboxConversations).
 * Canal con allowlist, cuenta exacta y búsqueda por nombre/teléfono normalizado.
 * Los filtros se aplican DESPUÉS del dedup M7 en la bandeja real.
 */

function conv(overrides: Partial<InboxConversation>): InboxConversation {
  return {
    key: 'cc:conv-1',
    channel: 'whatsapp',
    channelLabel: 'WhatsApp',
    connectionName: 'Número Ventas',
    contactName: 'Laura Gómez',
    contactHandle: '+573001110000',
    clientId: null,
    lastMessage: '¿Precio del plan anual?',
    lastMessageAt: '2026-11-20T10:00:00.000Z',
    lastMessageFrom: 'in',
    unreadCount: 0,
    isAutoReply: false,
    ...overrides,
  }
}

const ventas = conv({})
const soporte = conv({ key: 'cc:conv-2', connectionName: 'Número Soporte', contactName: 'Pedro Ruiz', contactHandle: '+573002220000', lastMessage: 'No entra mi correo' })
const telegram = conv({ key: 'tg:client-1', channel: 'telegram', channelLabel: 'Telegram', contactName: 'Laura TG', contactHandle: '555001', connectionName: undefined })

describe('F3 · filtro por canal', () => {
  it('devuelve solo el canal pedido', () => {
    const out = filterInboxConversations([ventas, telegram], { channel: 'whatsapp' })
    expect(out).toHaveLength(1)
    expect(out[0].channel).toBe('whatsapp')
  })

  it('canal sin filas devuelve lista vacía (no lanza)', () => {
    expect(filterInboxConversations([ventas], { channel: 'tiktok' })).toEqual([])
  })

  it('allowlist: canal desconocido devuelve vacío (fail-closed)', () => {
    expect(filterInboxConversations([ventas], { channel: 'pigeon' })).toEqual([])
  })

  it('la lista de canales soportados es la del producto (5 canales)', () => {
    expect(INBOX_CHANNELS).toEqual(['whatsapp', 'telegram', 'instagram', 'facebook', 'tiktok'])
  })
})

describe('F3 · filtro por cuenta (cuenta conectada)', () => {
  it('el filtro por conexión devuelve solo esa cuenta', () => {
    const out = filterInboxConversations([ventas, soporte, telegram], { connection: 'Número Ventas' })
    expect(out).toHaveLength(1)
    expect(out[0].connectionName).toBe('Número Ventas')
  })

  it('las filas sin cuenta (legacy/timeline) quedan excluidas al filtrar por cuenta', () => {
    const legacy = conv({ key: 'wa:legacy-1', connectionName: undefined })
    const out = filterInboxConversations([legacy, ventas], { connection: 'Número Ventas' })
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('cc:conv-1')
  })

  it('la comparación de cuenta es insensible a mayúsculas', () => {
    expect(filterInboxConversations([ventas], { connection: 'número ventas' })).toHaveLength(1)
  })
})

describe('F3 · búsqueda libre', () => {
  it('encuentra por nombre de contacto', () => {
    const out = filterInboxConversations([ventas, soporte], { q: 'laura' })
    expect(out).toHaveLength(1)
    expect(out[0].contactName).toBe('Laura Gómez')
  })

  it('encuentra por teléfono sin importar el formato (+, espacios, guiones)', () => {
    for (const q of ['3001110000', '+57 300 111 0000', '573001110000']) {
      const out = filterInboxConversations([ventas, soporte], { q })
      expect(out).toHaveLength(1)
      expect(out[0].contactHandle).toBe('+573001110000')
    }
  })

  it('encuentra por contenido del último mensaje', () => {
    const out = filterInboxConversations([ventas, soporte], { q: 'correo' })
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('cc:conv-2')
  })

  it('sin coincidencias devuelve lista vacía', () => {
    expect(filterInboxConversations([ventas], { q: 'zzz-inexistente' })).toEqual([])
  })

  it('menos de 4 dígitos no activa la búsqueda por teléfono (evita falsos positivos)', () => {
    // "12" solo coincide si está literal en el texto; el handle +573001110000 no contiene "12".
    expect(filterInboxConversations([ventas], { q: '12' })).toEqual([])
  })

  it('búsqueda vacía o de espacios no filtra nada', () => {
    expect(filterInboxConversations([ventas, soporte], { q: '   ' })).toHaveLength(2)
  })
})

describe('F3 · filtros combinados', () => {
  it('canal + cuenta + búsqueda juntos', () => {
    const out = filterInboxConversations([ventas, soporte, telegram], {
      channel: 'whatsapp', connection: 'Número Ventas', q: 'plan anual',
    })
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('cc:conv-1')
  })

  it('sin filtros devuelve la lista intacta (misma referencia, cero costo)', () => {
    const input = [ventas, soporte]
    expect(filterInboxConversations(input, {})).toBe(input)
  })
})
