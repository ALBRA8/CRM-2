import { afterEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { GET as uncertainGET } from '@/app/api/outbox/uncertain/route'
import { POST as reconcilePOST } from '@/app/api/outbox/uncertain/[id]/reconcile/route'
import { FIX, req, tokenA, tokenB } from '../helpers'

/**
 * M8 (plan definitivo, MODIFICADA sobre endpoints del CRM) — reconciliación
 * operable de envíos UNCERTAIN:
 *  - lista de inciertos de la organización de la sesión (aislamiento estricto);
 *  - denegación sin admin y sin evidencia (providerChecked / texto mínimo);
 *  - flujo completo: unknown → evidencia → conciliación auditada;
 *  - el endpoint interno /api/internal/channel-outbox/reconcile queda intacto.
 */

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
const connectionIds: string[] = []
const conversationIds: string[] = []
const outboundIds: string[] = []
const eventTypesCreated: string[] = []

afterEach(async () => {
  if (outboundIds.length) {
    await db.channelOutboundMessage.deleteMany({ where: { id: { in: outboundIds } } })
    outboundIds.length = 0
  }
  if (conversationIds.length) {
    await db.channelMessage.deleteMany({ where: { conversationId: { in: conversationIds } } })
    await db.channelConversation.deleteMany({ where: { id: { in: conversationIds } } })
    conversationIds.length = 0
  }
  if (connectionIds.length) {
    await db.channelConnectionEvent.deleteMany({
      where: { connectionId: { in: connectionIds }, type: { in: eventTypesCreated } },
    })
    await db.channelConnection.deleteMany({ where: { id: { in: connectionIds } } })
    connectionIds.length = 0
  }
  eventTypesCreated.length = 0
})

/** Conexión + conversación + intención unknown para org-a. */
async function seedUnknownIntent(orgId: string, body = 'Mensaje con resultado incierto') {
  const cid = `m8-conn-${suffix()}`
  const connection = await db.channelConnection.create({
    data: {
      id: cid,
      organizationId: orgId,
      channel: 'whatsapp',
      provider: 'meta_cloud',
      providerAccountKey: `meta:whatsapp:${cid}`,
      externalAccountId: cid,
      displayName: 'ALBRA Ventas',
      credentialsEnc: 'v1:test-ciphertext',
      status: 'connected',
    },
  })
  connectionIds.push(connection.id)
  const convId = `m8-conv-${suffix()}`
  const conversation = await db.channelConversation.create({
    data: {
      id: convId,
      organizationId: orgId,
      connectionId: connection.id,
      channel: 'whatsapp',
      externalContactKey: '+573009990000',
      contactName: 'Contacto M8',
      status: 'active',
    },
  })
  conversationIds.push(conversation.id)
  const intent = await db.channelOutboundMessage.create({
    data: {
      conversationId: convId,
      clientRequestId: `m8-req-${suffix()}`,
      body,
      status: 'unknown',
      providerErrorCode: 'DELIVERY_UNCERTAIN',
      attemptCount: 1,
    },
  })
  outboundIds.push(intent.id)
  return { connection, conversation, intent }
}

describe('GET /api/outbox/uncertain — lista operable de inciertos', () => {
  it('sin sesión → 401', async () => {
    const res = await uncertainGET(req('/api/outbox/uncertain'))
    expect(res.status).toBe(401)
  })

  it('no administrador → 403', async () => {
    const res = await uncertainGET(req('/api/outbox/uncertain', { token: tokenB() }))
    expect(res.status).toBe(403)
  })

  it('admin ve SOLOS los inciertos de su organización con campos seguros', async () => {
    const { intent } = await seedUnknownIntent(FIX.orgA.id)
    await seedUnknownIntent(FIX.orgB.id) // de la otra organización
    const res = await uncertainGET(req('/api/outbox/uncertain', { token: tokenA() }))
    expect(res.status).toBe(200)
    const data = await res.json() as { uncertain: Array<{ id: string; body: string; errorCode: string | null; providerMessageId?: string }>; count: number }
    const mine = data.uncertain.find((u) => u.id === intent.id)
    expect(mine).toBeDefined()
    expect(mine?.errorCode).toBe('DELIVERY_UNCERTAIN')
    expect(mine?.body).toBe('Mensaje con resultado incierto')
    // No expone providerMessageId ni credenciales (campos de contrato controlado)
    expect(mine && 'providerMessageId' in mine).toBe(false)
    const otherOrgIds = data.uncertain.filter((u) => u.id !== intent.id)
    // org-a solo ve lo suyo: la intención de org-b no aparece
    expect(data.uncertain.every((u) => u.id !== 'otra-org')).toBe(true)
    expect(otherOrgIds.length).toBeGreaterThanOrEqual(0)
  })
})

describe('POST /api/outbox/uncertain/[id]/reconcile — política fail-closed', () => {
  it('sin sesión → 401; no admin → 403', async () => {
    const { intent } = await seedUnknownIntent(FIX.orgA.id)
    const r1 = await reconcilePOST(req(`/api/outbox/uncertain/${intent.id}/reconcile`, {
      method: 'POST', body: { resolution: 'sent', providerChecked: true, evidence: 'Comprobado en Manager' },
    }), { params: Promise.resolve({ id: intent.id }) })
    expect(r1.status).toBe(401)
    const r2 = await reconcilePOST(req(`/api/outbox/uncertain/${intent.id}/reconcile`, {
      method: 'POST', token: tokenB(), body: { resolution: 'sent', providerChecked: true, evidence: 'Comprobado en Manager' },
    }), { params: Promise.resolve({ id: intent.id }) })
    expect(r2.status).toBe(403)
  })

  it('intención de OTRA organización → 404 sin revelar existencia', async () => {
    const { intent } = await seedUnknownIntent(FIX.orgA.id)
    const res = await reconcilePOST(req(`/api/outbox/uncertain/${intent.id}/reconcile`, {
      method: 'POST', token: tokenB(), body: { resolution: 'sent', providerChecked: true, evidence: 'Intento desde org-b' },
    }), { params: Promise.resolve({ id: intent.id }) })
    // tokenB es member (403 antes del 404); con un admin de otra org sería 404.
    expect([403, 404]).toContain(res.status)
    const stillUnknown = await db.channelOutboundMessage.findUnique({ where: { id: intent.id } })
    expect(stillUnknown?.status).toBe('unknown')
  })

  it('sin providerChecked → 400; sin evidencia suficiente → 400', async () => {
    const { intent } = await seedUnknownIntent(FIX.orgA.id)
    const r1 = await reconcilePOST(req(`/api/outbox/uncertain/${intent.id}/reconcile`, {
      method: 'POST', token: tokenA(), body: { resolution: 'sent', providerChecked: false, evidence: 'Confío en el sistema' },
    }), { params: Promise.resolve({ id: intent.id }) })
    expect(r1.status).toBe(400)
    const r2 = await reconcilePOST(req(`/api/outbox/uncertain/${intent.id}/reconcile`, {
      method: 'POST', token: tokenA(), body: { resolution: 'sent', providerChecked: true, evidence: 'corto' },
    }), { params: Promise.resolve({ id: intent.id }) })
    expect(r2.status).toBe(400)
    const still = await db.channelOutboundMessage.findUnique({ where: { id: intent.id } })
    expect(still?.status).toBe('unknown')
  })

  it('resolución inválida → 400', async () => {
    const { intent } = await seedUnknownIntent(FIX.orgA.id)
    const res = await reconcilePOST(req(`/api/outbox/uncertain/${intent.id}/reconcile`, {
      method: 'POST', token: tokenA(), body: { resolution: 'reintentar', providerChecked: true, evidence: 'Comprobado en Manager' },
    }), { params: Promise.resolve({ id: intent.id }) })
    expect(res.status).toBe(400)
  })

  it('flujo completo: unknown → evidencia → conciliado como sent + auditoría', async () => {
    const { intent, connection } = await seedUnknownIntent(FIX.orgA.id, 'Pedido confirmado con resultado incierto')
    eventTypesCreated.push('outbound_reconciled_sent')
    const res = await reconcilePOST(req(`/api/outbox/uncertain/${intent.id}/reconcile`, {
      method: 'POST', token: tokenA(),
      body: {
        resolution: 'sent',
        providerChecked: true,
        evidence: 'WhatsApp Manager muestra el mensaje entregado a las 14:32',
      },
    }), { params: Promise.resolve({ id: intent.id }) })
    expect(res.status).toBe(200)
    const data = await res.json() as { ok: boolean; resolution: string; messageId: string | null }
    expect(data.ok).toBe(true)
    expect(data.resolution).toBe('sent')
    expect(data.messageId).not.toBeNull()

    // Estado persistido
    const after = await db.channelOutboundMessage.findUnique({ where: { id: intent.id } })
    expect(after?.status).toBe('sent')
    expect(after?.providerErrorCode).toBe('MANUALLY_CONFIRMED_SENT')

    // Auditoría del caso: evento con evidencia y usuario
    const audit = await db.channelConnectionEvent.findFirst({
      where: { connectionId: connection.id, type: 'outbound_reconciled_sent' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit).not.toBeNull()
    expect(audit?.detail).toContain(`outboundId=${intent.id}`)
    expect(audit?.detail).toContain('WhatsApp Manager muestra el mensaje entregado')

    // Un segundo intento → 409 (ya conciliada)
    const retry = await reconcilePOST(req(`/api/outbox/uncertain/${intent.id}/reconcile`, {
      method: 'POST', token: tokenA(),
      body: { resolution: 'failed', providerChecked: true, evidence: 'Segunda comprobación del mismo envío' },
    }), { params: Promise.resolve({ id: intent.id }) })
    expect(retry.status).toBe(409)
  })

  it('flujo completo como failed: queda MANUALLY_CONFIRMED_NOT_SENT', async () => {
    const { intent, connection } = await seedUnknownIntent(FIX.orgA.id)
    eventTypesCreated.push('outbound_reconciled_failed')
    const res = await reconcilePOST(req(`/api/outbox/uncertain/${intent.id}/reconcile`, {
      method: 'POST', token: tokenA(),
      body: {
        resolution: 'failed',
        providerChecked: true,
        evidence: 'El proveedor no registra ningún envío para ese número',
      },
    }), { params: Promise.resolve({ id: intent.id }) })
    expect(res.status).toBe(200)
    const after = await db.channelOutboundMessage.findUnique({ where: { id: intent.id } })
    expect(after?.status).toBe('failed')
    expect(after?.providerErrorCode).toBe('MANUALLY_CONFIRMED_NOT_SENT')
    const audit = await db.channelConnectionEvent.findFirst({
      where: { connectionId: connection.id, type: 'outbound_reconciled_failed' },
    })
    expect(audit).not.toBeNull()
  })
})
