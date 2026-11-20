import { describe, expect, it, beforeEach } from 'vitest'
import { GET as inboxGet } from '@/app/api/inbox/route'
import { db } from '@/lib/db'
import { getOrCreateChannelConversation } from '@/lib/channel-conversations'
import { FIX, jsonBody, req, tokenA, tokenB } from '../helpers'

/**
 * F3-T03 + F3-T04 — bandeja unificada END-TO-END:
 *  - un contacto presente en la bandeja legacy (daemon) Y en la canónica
 *    aparece UNA sola vez y gana la canónica (criterio F3-T03);
 *  - filtros ?channel= / ?connection= / ?search= y paginación (F3-T04);
 *  - aislamiento por organización.
 */
describe('GET /api/inbox — unificación y filtros', () => {
  beforeEach(async () => {
    await db.channelMessage.deleteMany()
    await db.channelConversation.deleteMany()
    await db.channelConnection.deleteMany()
    await db.channelOutboundMessage.deleteMany()
    await db.whatsAppMessage.deleteMany()
    await db.whatsAppConversation.deleteMany()
  })

  async function seedCanonical(orgId: string, opts: { contactKey: string; displayName: string; channel?: string; unread?: number }) {
    const connection = await db.channelConnection.create({
      data: {
        organizationId: orgId,
        channel: opts.channel ?? 'whatsapp',
        provider: 'meta_cloud',
        providerAccountKey: `meta:whatsapp:${opts.displayName.replace(/\s/g, '-')}`,
        externalAccountId: 'acc-test',
        status: 'connected',
        displayName: opts.displayName,
        credentialsEnc: 'v1:0123456789abcdef0123456789abcdef',
      },
    })
    const conv = await getOrCreateChannelConversation({
      providerAccountKey: connection.providerAccountKey,
      channel: connection.channel,
      externalContactKey: opts.contactKey,
      contactName: `Contacto ${opts.contactKey}`,
    })
    expect(conv).toBeTruthy()
    if (opts.unread) {
      await db.channelConversation.update({ where: { id: conv!.id }, data: { unreadCount: opts.unread } })
    }
    return { connection, conv: conv! }
  }

  it('un contacto en daemon Y canónica aparece UNA vez y gana la canónica', async () => {
    const { connection, conv } = await seedCanonical(FIX.orgA.id, {
      contactKey: '573001110000',
      displayName: 'Ventas Uno',
      unread: 3,
    })
    // El mismo teléfono también existe en la bandeja legacy del daemon
    await db.whatsAppConversation.create({
      data: {
        organizationId: FIX.orgA.id,
        contactPhone: '+57 300 111 0000',
        contactName: 'Contacto 573001110000',
        lastMessage: 'mensaje del daemon',
        lastMessageFrom: 'in',
        unreadCount: 2,
        status: 'active',
      },
    })

    const res = await inboxGet(req('/api/inbox', { token: tokenA() }))
    expect(res.status).toBe(200)
    const { conversations } = (await jsonBody(res)) as { conversations: Array<{ key: string; contactHandle: string; unreadCount: number; connectionId?: string }> }

    const sameContact = conversations.filter((c) => (c.contactHandle || '').replace(/\D/g, '').includes('573001110000'))
    expect(sameContact).toHaveLength(1)
    expect(sameContact[0].key).toBe(`cc:${conv.id}`)
    expect(sameContact[0].unreadCount).toBe(5)
    expect(sameContact[0].connectionId).toBe(connection.id)
  })

  it('filtro por canal devuelve solo ese canal; canal inválido → 400', async () => {
    await seedCanonical(FIX.orgA.id, { contactKey: '573002220000', displayName: 'Cuenta WA' })
    await seedCanonical(FIX.orgA.id, { contactKey: '@usuario-tg', displayName: 'Cuenta TG', channel: 'telegram' })
    await db.whatsAppConversation.create({
      data: {
        organizationId: FIX.orgA.id,
        contactPhone: '573003330000',
        contactName: 'Solo daemon',
        lastMessage: 'x',
        lastMessageFrom: 'in',
        status: 'active',
      },
    })

    const resWa = await inboxGet(req('/api/inbox?channel=whatsapp', { token: tokenA() }))
    const { conversations: waList } = (await jsonBody(resWa)) as { conversations: Array<{ channel: string }> }
    expect(waList.length).toBeGreaterThanOrEqual(2)
    expect(waList.every((c) => c.channel === 'whatsapp')).toBe(true)

    const resTg = await inboxGet(req('/api/inbox?channel=telegram', { token: tokenA() }))
    const { conversations: tgList } = (await jsonBody(resTg)) as { conversations: Array<{ channel: string }> }
    expect(tgList.every((c) => c.channel === 'telegram')).toBe(true)
    expect(tgList.length).toBe(1)

    const resBad = await inboxGet(req('/api/inbox?channel=pigeon', { token: tokenA() }))
    expect(resBad.status).toBe(400)
  })

  it('filtro por conexión devuelve solo las conversaciones de ESA cuenta', async () => {
    const { connection: conn1 } = await seedCanonical(FIX.orgA.id, { contactKey: '573004440001', displayName: 'Uno' })
    await seedCanonical(FIX.orgA.id, { contactKey: '573004440002', displayName: 'Dos' })

    const res = await inboxGet(req(`/api/inbox?connection=${conn1.id}`, { token: tokenA() }))
    const { conversations } = (await jsonBody(res)) as { conversations: Array<{ connectionId?: string; contactHandle: string }> }
    expect(conversations).toHaveLength(1)
    expect(conversations[0].connectionId).toBe(conn1.id)
    expect(conversations[0].contactHandle).toBe('573004440001')
  })

  it('la búsqueda encuentra por nombre y por teléfono (case-insensitive)', async () => {
    await seedCanonical(FIX.orgA.id, { contactKey: '573005550000', displayName: 'Cuenta Buscar' })
    await seedCanonical(FIX.orgA.id, { contactKey: '573006660000', displayName: 'Cuenta Otra' })

    const resTel = await inboxGet(req('/api/inbox?search=57300555', { token: tokenA() }))
    const { conversations: byPhone } = (await jsonBody(resTel)) as { conversations: Array<{ contactHandle: string }> }
    expect(byPhone).toHaveLength(1)
    expect(byPhone[0].contactHandle).toContain('573005550000')

    const resName = await inboxGet(req('/api/inbox?search=buscar', { token: tokenA() }))
    const { conversations: byName } = (await jsonBody(resName)) as { conversations: Array<{ contactHandle: string }> }
    expect(byName).toHaveLength(1)
    expect(byName[0].contactHandle).toContain('573005550000')
  })

  it('búsqueda demasiado larga o conexión malformada → 400', async () => {
    const long = 'a'.repeat(101)
    expect((await inboxGet(req(`/api/inbox?search=${long}`, { token: tokenA() }))).status).toBe(400)
    expect((await inboxGet(req('/api/inbox?connection=conexión%20con%20espacios', { token: tokenA() }))).status).toBe(400)
  })

  it('aislamiento: la org B jamás ve conversaciones de la org A', async () => {
    await seedCanonical(FIX.orgA.id, { contactKey: '573007770000', displayName: 'Privada A' })
    const res = await inboxGet(req('/api/inbox', { token: tokenB() }))
    const { conversations } = (await jsonBody(res)) as { conversations: unknown[] }
    expect(conversations).toEqual([])
  })
})
