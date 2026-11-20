import { describe, expect, it } from 'vitest'
import { dedupeInboxConversations, normalizeWaPhone, type InboxConversation } from '@/lib/inbox'

function conv(partial: Partial<InboxConversation> & { key: string; channel: InboxConversation['channel']; contactHandle: string }): InboxConversation {
  return {
    channelLabel: 'WhatsApp',
    contactName: 'Contacto',
    clientId: null,
    lastMessage: 'hola',
    lastMessageAt: null,
    lastMessageFrom: 'in',
    unreadCount: 0,
    isAutoReply: false,
    ...partial,
  }
}

/**
 * F3-T03 (M7) — criterio de unificación de la doble bandeja: un contacto,
 * una conversación. Puro, sin BD.
 */
describe('dedupeInboxConversations — criterio F3-T03', () => {
  it('la canónica (cc:) gana sobre la legacy del daemon con el mismo teléfono', () => {
    const deduped = dedupeInboxConversations([
      conv({ key: 'wa:legacy-1', channel: 'whatsapp', contactHandle: '573001110000', unreadCount: 2 }),
      conv({ key: 'cc:canon-1', channel: 'whatsapp', contactHandle: '573001110000', connectionName: 'Ventas', connectionId: 'conn-1', unreadCount: 3 }),
    ])
    expect(deduped).toHaveLength(1)
    expect(deduped[0].key).toBe('cc:canon-1')
    // la señal de atención se suma
    expect(deduped[0].unreadCount).toBe(5)
  })

  it('normaliza el teléfono: +57 300 111 0000 y 573001110000 son el MISMO contacto', () => {
    const deduped = dedupeInboxConversations([
      conv({ key: 'cc:c1', channel: 'whatsapp', contactHandle: '+57 300 111 0000' }),
      conv({ key: 'wa:l1', channel: 'whatsapp', contactHandle: '573001110000' }),
    ])
    expect(deduped).toHaveLength(1)
    expect(deduped[0].key).toBe('cc:c1')
  })

  it('sin canónica gana la legacy con cliente enlazado (mejor ficha 360)', () => {
    const deduped = dedupeInboxConversations([
      conv({ key: 'wa:l1', channel: 'whatsapp', contactHandle: '573001110000', clientId: null, unreadCount: 1 }),
      conv({ key: 'wa:l2', channel: 'whatsapp', contactHandle: '573001110000', clientId: 'client-9', unreadCount: 4 }),
    ])
    expect(deduped).toHaveLength(1)
    expect(deduped[0].key).toBe('wa:l2')
    expect(deduped[0].unreadCount).toBe(5)
  })

  it('el clientId hereda del perdedor si el ganador no lo tiene', () => {
    const deduped = dedupeInboxConversations([
      conv({ key: 'wa:l1', channel: 'whatsapp', contactHandle: '573001110000', clientId: 'client-1' }),
      conv({ key: 'cc:c1', channel: 'whatsapp', contactHandle: '573001110000' }),
    ])
    expect(deduped[0].clientId).toBe('client-1')
  })

  it('contactos en canales DISTINTOS se mantienen separados (multicanal real)', () => {
    const deduped = dedupeInboxConversations([
      conv({ key: 'cc:wa', channel: 'whatsapp', contactHandle: '573001110000' }),
      conv({ key: 'tg:c1', channel: 'telegram', contactHandle: '573001110000' }),
    ])
    expect(deduped).toHaveLength(2)
  })

  it('la conversación sin handle se conserva (fail-open de visualización)', () => {
    const deduped = dedupeInboxConversations([
      conv({ key: 'wa:x', channel: 'whatsapp', contactHandle: '' }),
      conv({ key: 'cc:y', channel: 'whatsapp', contactHandle: '573001110000' }),
    ])
    expect(deduped).toHaveLength(2)
  })

  it('tres duplicados del mismo contacto se reducen a uno con la suma completa', () => {
    const deduped = dedupeInboxConversations([
      conv({ key: 'wa:a', channel: 'whatsapp', contactHandle: '573001110000', unreadCount: 1 }),
      conv({ key: 'wa:b', channel: 'whatsapp', contactHandle: '+573001110000', clientId: 'c1', unreadCount: 2 }),
      conv({ key: 'cc:c', channel: 'whatsapp', contactHandle: '57 300 111 0000', unreadCount: 4 }),
    ])
    expect(deduped).toHaveLength(1)
    expect(deduped[0].key).toBe('cc:c')
    expect(deduped[0].unreadCount).toBe(7)
  })

  it('regla 5: dos cuentas conectadas DISTINTAS mantienen su hilo con el mismo contacto', () => {
    const deduped = dedupeInboxConversations([
      conv({ key: 'cc:c1', channel: 'whatsapp', contactHandle: '573001110000', connectionId: 'conn-a', connectionName: 'Cuenta A', unreadCount: 1 }),
      conv({ key: 'cc:c2', channel: 'whatsapp', contactHandle: '+57 300 111 0000', connectionId: 'conn-b', connectionName: 'Cuenta B', unreadCount: 2 }),
    ])
    expect(deduped).toHaveLength(2)
    expect(new Set(deduped.map((c) => c.connectionId))).toEqual(new Set(['conn-a', 'conn-b']))
  })

  it('dos canónicas de la MISMA conexión son un duplicado real y se fusionan', () => {
    const deduped = dedupeInboxConversations([
      conv({ key: 'cc:c1', channel: 'whatsapp', contactHandle: '573001110000', connectionId: 'conn-a', unreadCount: 1 }),
      conv({ key: 'cc:c2', channel: 'whatsapp', contactHandle: '573001110000', connectionId: 'conn-a', unreadCount: 2 }),
    ])
    expect(deduped).toHaveLength(1)
    expect(deduped[0].unreadCount).toBe(3)
  })

  it('normalizeWaPhone rechaza basura (fail-closed para agrupar/enviar)', () => {
    expect(normalizeWaPhone('abc')).toBeNull()
    expect(normalizeWaPhone('123')).toBeNull()
    expect(normalizeWaPhone('+573001234567')).toBe('573001234567')
  })
})
