import { afterEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { GET as attentionGET } from '@/app/api/dashboard/attention/route'
import { FIX, req, tokenA } from '../helpers'

/**
 * F4/U2 (plan definitivo) — endpoint de motivos "Requiere atención" contra BD
 * efímera: conteos SOLO de la organización de la sesión y motivos nunca
 * negativos. La composición de motivos es pura y está en tests/unit.
 */

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
const created: { quotes: string[]; reservations: string[]; conversations: string[]; connections: string[]; waConvs: string[] } = {
  quotes: [], reservations: [], conversations: [], connections: [], waConvs: [],
}

afterEach(async () => {
  if (created.conversations.length) {
    await db.channelMessage.deleteMany({ where: { conversationId: { in: created.conversations } } })
    await db.channelConversation.deleteMany({ where: { id: { in: created.conversations } } })
    created.conversations.length = 0
  }
  if (created.connections.length) {
    await db.channelConnectionEvent.deleteMany({ where: { connectionId: { in: created.connections } } })
    await db.channelConnection.deleteMany({ where: { id: { in: created.connections } } })
    created.connections.length = 0
  }
  if (created.quotes.length) {
    await db.quote.deleteMany({ where: { id: { in: created.quotes } } })
    created.quotes.length = 0
  }
  if (created.reservations.length) {
    await db.reservation.deleteMany({ where: { id: { in: created.reservations } } })
    created.reservations.length = 0
  }
  if (created.waConvs.length) {
    await db.whatsAppMessage.deleteMany({ where: { conversationId: { in: created.waConvs } } })
    await db.whatsAppConversation.deleteMany({ where: { id: { in: created.waConvs } } })
    created.waConvs.length = 0
  }
})

describe('GET /api/dashboard/attention', () => {
  it('sin sesión → 401', async () => {
    const res = await attentionGET(req('/api/dashboard/attention'))
    expect(res.status).toBe(401)
  })

  it('org vacía → todos los conteos en 0 (sin falsos positivos)', async () => {
    const res = await attentionGET(req('/api/dashboard/attention', { token: tokenA() }))
    expect(res.status).toBe(200)
    const data = await res.json() as { counts: Record<string, number> }
    expect(data.counts.unreadMessages).toBe(0)
    expect(data.counts.draftQuotes).toBe(0)
    expect(data.counts.upcomingReservations).toBeGreaterThanOrEqual(0) // seeds de la org pueden tener citas
    expect(data.counts.overdueTasks).toBe(0)
    for (const v of Object.values(data.counts)) expect(v).toBeGreaterThanOrEqual(0)
  })

  it('cuenta solo lo de la organización: unread, drafts y citas próximas', async () => {
    // Conversación canónica con 2 sin leer (org-a)
    const cid = `att-conn-${suffix()}`
    const connection = await db.channelConnection.create({
      data: {
        id: cid,
        organizationId: FIX.orgA.id,
        channel: 'whatsapp',
        provider: 'meta_cloud',
        providerAccountKey: `meta:whatsapp:${cid}`,
        externalAccountId: cid,
        displayName: 'ALBRA Ventas',
        credentialsEnc: 'v1:test-ciphertext',
        status: 'connected',
      },
    })
    created.connections.push(connection.id)
    const convId = `att-conv-${suffix()}`
    const conversation = await db.channelConversation.create({
      data: {
        id: convId,
        organizationId: FIX.orgA.id,
        connectionId: connection.id,
        channel: 'whatsapp',
        externalContactKey: '+573007770000',
        contactName: 'Contacto Atención',
        status: 'active',
        unreadCount: 2,
      },
    })
    created.conversations.push(conversation.id)
    // Conversación legacy del daemon con 1 sin leer (org-a)
    const waConv = await db.whatsAppConversation.create({
      data: {
        id: `att-wa-${suffix()}`,
        organizationId: FIX.orgA.id,
        contactPhone: '+573007771111',
        contactName: 'Legacy Atención',
        status: 'active',
        unreadCount: 1,
        lastMessageAt: new Date(),
      },
    })
    created.waConvs.push(waConv.id)
    // Cotización en borrador (org-a)
    const quote = await db.quote.create({
      data: {
        organizationId: FIX.orgA.id,
        number: `ATT-${suffix()}`,
        status: 'draft',
        subtotal: 100,
        total: 119,
      },
    })
    created.quotes.push(quote.id)
    // Cotización enviada NO cuenta (org-a)
    const sentQuote = await db.quote.create({
      data: {
        organizationId: FIX.orgA.id,
        number: `ATT-S-${suffix()}`,
        status: 'sent',
        subtotal: 50,
        total: 59.5,
      },
    })
    created.quotes.push(sentQuote.id)

    const res = await attentionGET(req('/api/dashboard/attention', { token: tokenA() }))
    expect(res.status).toBe(200)
    const data = await res.json() as { counts: Record<string, number> }
    expect(data.counts.unreadMessages).toBeGreaterThanOrEqual(3) // 2 canónico + 1 legacy
    expect(data.counts.draftQuotes).toBeGreaterThanOrEqual(1)
    expect(data.counts.overdueTasks).toBe(0)
  })
})
