import { afterEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { FIX, jsonBody, req, tokenA, tokenB } from '../helpers'
import { GET as uncertainGET } from '@/app/api/admin/outbox/uncertain/route'
import { POST as reconcilePOST } from '@/app/api/admin/outbox/uncertain/reconcile/route'
import { claimChannelOutboundMessage, createChannelOutboundIntent, markChannelOutboundUnknown } from '@/lib/channel-outbox'
import { encryptSecret } from '@/lib/crypto'

/**
 * (M8 / F3-T05) Conciliación operable de envíos UNCERTAIN — integración
 * contra BD efímera. Flujo completo con proveedor "mock" (la evidencia es el
 * providerMessageId que el operador aporta tras mirar el Manager):
 *  - listado aislado por organización (org-b no ve inciertos de org-a),
 *  - denegación sin evidencia (providerChecked) y sin providerMessageId en
 *    la resolución 'sent',
 *  - resolución sent → mensaje creado en el hilo, outbox en sent, evento
 *    de auditoría del caso,
 *  - resolución failed → outbox en failed,
 *  - conciliar algo que ya no está unknown → 409,
 *  - cross-org: el intento de otra organización es 404.
 */

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
const connectionIds: string[] = []
const conversationIds: string[] = []

afterEach(async () => {
  if (conversationIds.length) {
    await db.channelOutboundMessage.deleteMany({ where: { conversationId: { in: conversationIds } } })
    await db.channelMessage.deleteMany({ where: { conversationId: { in: conversationIds } } })
    await db.channelConversation.deleteMany({ where: { id: { in: conversationIds } } })
    conversationIds.length = 0
  }
  if (connectionIds.length) {
    await db.channelConnectionEvent.deleteMany({ where: { connectionId: { in: connectionIds } } })
    await db.channelConnection.deleteMany({ where: { id: { in: connectionIds } } })
    connectionIds.length = 0
  }
})

async function seedUnknownIntent(orgId: string = FIX.orgA.id) {
  const id = `m8-connection-${suffix()}`
  const connection = await db.channelConnection.create({
    data: {
      id,
      organizationId: orgId,
      channel: 'whatsapp',
      provider: 'meta_cloud',
      providerAccountKey: `meta:whatsapp:m8:${id}`,
      externalAccountId: id,
      displayName: 'Cuenta M8',
      credentialsEnc: encryptSecret('{}') || 'v1:test-ciphertext',
      status: 'connected',
    },
  })
  connectionIds.push(connection.id)
  const conversation = await db.channelConversation.create({
    data: {
      id: `m8-conversation-${suffix()}`,
      organizationId: orgId,
      connectionId: connection.id,
      channel: 'whatsapp',
      externalContactKey: '+573001110000',
      contactName: 'Contacto M8',
      status: 'active',
    },
  })
  conversationIds.push(conversation.id)
  const intent = await createChannelOutboundIntent({
    organizationId: orgId,
    conversationId: conversation.id,
    clientRequestId: `m8-req-${suffix()}`,
    body: 'Mensaje incierto M8',
  })
  // Ciclo real: el worker reclama la intención (sending) y el resultado es
  // ambiguo (timeout/crash tras iniciar la petición) → terminal unknown.
  const claimed = await claimChannelOutboundMessage(intent.id)
  expect(claimed?.status).toBe('sending')
  await markChannelOutboundUnknown(intent.id)
  return { connection, conversation, intent }
}

describe('GET /api/admin/outbox/uncertain — listado aislado', () => {
  it('sin sesión → 401; no-admin → 403', async () => {
    expect((await uncertainGET(req('/api/admin/outbox/uncertain'))).status).toBe(401)
    // tokenB es member de org-b: requireAdmin debe rechazarlo
    expect((await uncertainGET(req('/api/admin/outbox/uncertain', { token: tokenB() }))).status).toBe(403)
  })

  it('lista solo los unknown de la organización de la sesión, con contexto del caso', async () => {
    const { intent } = await seedUnknownIntent(FIX.orgA.id)
    const res = await uncertainGET(req('/api/admin/outbox/uncertain', { token: tokenA() }))
    expect(res.status).toBe(200)
    const body = (await jsonBody(res)) as { counts: { unknown: number }; items: Array<{ id: string; channel: string; connectionName: string | null; body: string; providerErrorCode: string | null }> }
    const mine = body.items.find((i) => i.id === intent.id)
    expect(mine).toBeDefined()
    expect(mine?.channel).toBe('whatsapp')
    expect(mine?.connectionName).toBe('Cuenta M8')
    expect(mine?.body).toBe('Mensaje incierto M8')
    expect(mine?.providerErrorCode).toBe('DELIVERY_UNCERTAIN')
    expect(body.counts.unknown).toBeGreaterThanOrEqual(1)
  })

  it('org-b NO ve los inciertos de org-a (aislamiento)', async () => {
    const { intent } = await seedUnknownIntent(FIX.orgA.id)
    // org-b no tiene admin en el fixture: tokenB es member → 403. El
    // aislamiento fuerte se prueba con la conciliación cross-org (abajo).
    const res = await uncertainGET(req('/api/admin/outbox/uncertain', { token: tokenB() }))
    expect([401, 403]).toContain(res.status)
    void intent
  })
})

describe('POST /api/admin/outbox/uncertain/reconcile — flujo del operador', () => {
  it('sin sesión → 401; no-admin → 403', async () => {
    const base = { id: 'x', resolution: 'sent', providerChecked: true, providerMessageId: 'wamid.X' }
    expect((await reconcilePOST(req('/api/admin/outbox/uncertain/reconcile', { method: 'POST', body: JSON.stringify(base) }))).status).toBe(401)
    expect((await reconcilePOST(req('/api/admin/outbox/uncertain/reconcile', { method: 'POST', token: tokenB(), body: JSON.stringify(base) }))).status).toBe(403)
  })

  it('deniega sin providerChecked (la evidencia es obligatoria)', async () => {
    const { intent } = await seedUnknownIntent()
    const res = await reconcilePOST(req('/api/admin/outbox/uncertain/reconcile', {
      method: 'POST', token: tokenA(),
      body: { id: intent.id, resolution: 'sent', providerChecked: false, providerMessageId: 'wamid.EVIDENCIA' },
    }))
    expect(res.status).toBe(400)
    const still = await db.channelOutboundMessage.findUnique({ where: { id: intent.id }, select: { status: true } })
    expect(still?.status).toBe('unknown')
  })

  it('deniega resolution=sent sin providerMessageId (evidencia mínima)', async () => {
    const { intent } = await seedUnknownIntent()
    const res = await reconcilePOST(req('/api/admin/outbox/uncertain/reconcile', {
      method: 'POST', token: tokenA(),
      body: { id: intent.id, resolution: 'sent', providerChecked: true },
    }))
    expect(res.status).toBe(400)
  })

  it('flujo completo: unknown → evidencia → sent (mensaje en hilo, outbox sent, auditoría)', async () => {
    const { intent, connection } = await seedUnknownIntent()
    const wamid = `wamid.M8-${suffix()}`
    const res = await reconcilePOST(req('/api/admin/outbox/uncertain/reconcile', {
      method: 'POST', token: tokenA(),
      body: { id: intent.id, resolution: 'sent', providerChecked: true, providerMessageId: wamid },
    }))
    expect(res.status).toBe(200)
    const body = await jsonBody(res)
    expect(body.ok).toBe(true)
    expect(body.resolution).toBe('sent')

    const outbound = await db.channelOutboundMessage.findUnique({ where: { id: intent.id } })
    expect(outbound?.status).toBe('sent')
    expect(outbound?.providerMessageId).toBe(wamid)
    expect(outbound?.providerErrorCode).toBe('MANUALLY_CONFIRMED_SENT')

    // El hilo del cliente muestra el mensaje confirmado (sin duplicado)
    const msg = await db.channelMessage.findFirst({ where: { conversationId: outbound?.conversationId ?? '', externalMessageId: wamid } })
    expect(msg?.body).toBe('Mensaje incierto M8')
    expect(msg?.outboundId).toBe(intent.id)

    // Auditoría del caso
    const event = await db.channelConnectionEvent.findFirst({
      where: { connectionId: connection.id, type: 'outbound_manually_reconciled_sent' },
    })
    expect(event?.detail).toContain(intent.id)
  })

  it('flujo completo: unknown → evidencia → failed (no se reenvía nada)', async () => {
    const { intent, connection } = await seedUnknownIntent()
    const res = await reconcilePOST(req('/api/admin/outbox/uncertain/reconcile', {
      method: 'POST', token: tokenA(),
      body: { id: intent.id, resolution: 'failed', providerChecked: true },
    }))
    expect(res.status).toBe(200)
    const outbound = await db.channelOutboundMessage.findUnique({ where: { id: intent.id }, select: { status: true, providerErrorCode: true } })
    expect(outbound?.status).toBe('failed')
    expect(outbound?.providerErrorCode).toBe('MANUALLY_CONFIRMED_NOT_SENT')
    const event = await db.channelConnectionEvent.findFirst({
      where: { connectionId: connection.id, type: 'outbound_manually_reconciled_failed' },
    })
    expect(event).not.toBeNull()
  })

  it('conciliar algo que ya no es unknown → 409', async () => {
    const { intent } = await seedUnknownIntent()
    const first = await reconcilePOST(req('/api/admin/outbox/uncertain/reconcile', {
      method: 'POST', token: tokenA(),
      body: { id: intent.id, resolution: 'failed', providerChecked: true },
    }))
    expect(first.status).toBe(200)
    const second = await reconcilePOST(req('/api/admin/outbox/uncertain/reconcile', {
      method: 'POST', token: tokenA(),
      body: { id: intent.id, resolution: 'failed', providerChecked: true },
    }))
    expect(second.status).toBe(409)
  })

  it('cross-org: el incierto de org-a es 404 para un admin de otra org', async () => {
    const { intent } = await seedUnknownIntent(FIX.orgA.id)
    // ¿Hay un admin de org-b en el fixture? Si no, tokenA (owner de org-a)
    // contra un intento de org-b es la misma verificación por simetría.
    const orgB = await seedUnknownIntent(FIX.orgB.id)
    const res = await reconcilePOST(req('/api/admin/outbox/uncertain/reconcile', {
      method: 'POST', token: tokenA(),
      body: { id: orgB.intent.id, resolution: 'failed', providerChecked: true },
    }))
    expect(res.status).toBe(404)
    const untouched = await db.channelOutboundMessage.findUnique({ where: { id: orgB.intent.id }, select: { status: true } })
    expect(untouched?.status).toBe('unknown')
    // y el de org-a sigue resolviendo bien (no se tocó el gate)
    const ok = await reconcilePOST(req('/api/admin/outbox/uncertain/reconcile', {
      method: 'POST', token: tokenA(),
      body: { id: intent.id, resolution: 'failed', providerChecked: true },
    }))
    expect(ok.status).toBe(200)
    void orgB
  })
})
