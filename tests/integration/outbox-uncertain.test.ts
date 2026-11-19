import { describe, expect, it, beforeAll } from 'vitest'
import { GET as uncertainGET, POST as uncertainPOST } from '@/app/api/crm/outbox/uncertain/route'
import { db } from '@/lib/db'
import { FIX, jsonBody, req, tokenA, tokenFor } from '../helpers'

/**
 * M8 — reconciliación operable de envíos UNCERTAIN (integración).
 *
 * Política verificada de punta a punta:
 *  - lista de inciertos SOLO de la organización (admin; miembro → 403);
 *  - conciliar SIN evidencia → 400 (el unknown jamás se reintenta sin verificación);
 *  - conciliar con ID del proveedor → sent con eco verificado y auditado;
 *  - conciliar como failed → auditado;
 *  - intención que ya no está unknown → 409;
 *  - intención de OTRA organización → 404 (sin revelar nada).
 */

let convId = ''
let unknownId = ''
let sentAlreadyId = ''
let failedId = ''

async function ownerB(): Promise<string> {
  await db.user.update({ where: { id: FIX.userB.id }, data: { role: 'owner' } })
  return tokenFor({ ...FIX.userB, role: 'owner' })
}

beforeAll(async () => {
  const connection = await db.channelConnection.create({
    data: {
      organizationId: FIX.orgA.id,
      channel: 'whatsapp',
      provider: 'meta-cloud',
      providerAccountKey: 'meta:whatsapp:333-m8',
      externalAccountId: '333',
      displayName: 'Número M8',
      status: 'connected',
      credentialsEnc: 'test-blob-m8',
    },
  })
  const conv = await db.channelConversation.create({
    data: {
      organizationId: FIX.orgA.id,
      connectionId: connection.id,
      channel: 'whatsapp',
      externalContactKey: '+573003330000',
      contactName: 'Marta M8',
    },
  })
  convId = conv.id
  const unknown = await db.channelOutboundMessage.create({
    data: {
      conversationId: conv.id,
      clientRequestId: 'req-m8-unknown',
      body: '¿Confirmas la cita de mañana?',
      status: 'unknown',
      attemptCount: 1,
      providerErrorCode: 'DELIVERY_UNCERTAIN',
    },
  })
  unknownId = unknown.id
  const already = await db.channelOutboundMessage.create({
    data: {
      conversationId: conv.id,
      clientRequestId: 'req-m8-sent',
      body: 'Este ya está enviado',
      status: 'sent',
      attemptCount: 1,
      providerMessageId: 'wamid.YA-ENVIADO',
    },
  })
  sentAlreadyId = already.id
  // Segunda conversación + unknown para probar la resolución failed (una por fila)
  const conv2 = await db.channelConversation.create({
    data: {
      organizationId: FIX.orgA.id,
      connectionId: connection.id,
      channel: 'whatsapp',
      externalContactKey: '+573003330001',
      contactName: 'Segunda M8',
    },
  })
  const failed = await db.channelOutboundMessage.create({
    data: {
      conversationId: conv2.id,
      clientRequestId: 'req-m8-failed',
      body: 'Este terminará en failed',
      status: 'unknown',
      attemptCount: 2,
      providerErrorCode: 'DELIVERY_UNCERTAIN',
    },
  })
  failedId = failed.id
  // Org B: conexión + unknown propio (aislamiento)
  const connB = await db.channelConnection.create({
    data: {
      organizationId: FIX.orgB.id,
      channel: 'whatsapp',
      provider: 'meta-cloud',
      providerAccountKey: 'meta:whatsapp:444-m8',
      externalAccountId: '444',
      displayName: 'Número M8 Org B',
      status: 'connected',
      credentialsEnc: 'test-blob-m8-b',
    },
  })
  const convB = await db.channelConversation.create({
    data: {
      organizationId: FIX.orgB.id,
      connectionId: connB.id,
      channel: 'whatsapp',
      externalContactKey: '+573004440000',
      contactName: 'OrgB M8',
    },
  })
  await db.channelOutboundMessage.create({
    data: {
      conversationId: convB.id,
      clientRequestId: 'req-m8-orgb',
      body: 'Incierto de org B',
      status: 'unknown',
      attemptCount: 1,
    },
  })
})

describe('GET /api/crm/outbox/uncertain', () => {
  it('sin sesión → 401', async () => {
    const res = await uncertainGET(req('/crm/outbox/uncertain'))
    expect(res.status).toBe(401)
  })

  it('miembro (no admin) → 403', async () => {
    // userB por defecto es member de org-b
    const res = await uncertainGET(req('/crm/outbox/uncertain', { token: tokenFor(FIX.userB) }))
    expect(res.status).toBe(403)
  })

  it('admin ve solo los inciertos de SU organización', async () => {
    const res = await uncertainGET(req('/crm/outbox/uncertain', { token: tokenA() }))
    expect(res.status).toBe(200)
    const body = await jsonBody(res)
    const rows = body.uncertain as { id: string; status: string; channel: string }[]
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(unknownId)
    expect(ids).toContain(failedId)
    // No ve el de org B ni filas resueltas
    expect(rows.every((r) => r.channel === 'whatsapp')).toBe(true)
    expect(rows.find((r) => r.id === sentAlreadyId)).toBeUndefined()
  })
})

describe('POST /api/crm/outbox/uncertain — conciliación', () => {
  it('sin evidencia → 400 (política: unknown jamás sin verificación)', async () => {
    const res = await uncertainPOST(req('/crm/outbox/uncertain', {
      method: 'POST',
      token: tokenA(), body: { id: unknownId, resolution: 'sent' },
    }))
    expect(res.status).toBe(400)
    const body = await jsonBody(res)
    expect(String(body.error)).toContain('Evidencia requerida')
  })

  it('nota corta no cuenta como evidencia → 400', async () => {
    const res = await uncertainPOST(req('/crm/outbox/uncertain', {
      method: 'POST',
      token: tokenA(), body: { id: unknownId, resolution: 'sent', evidence: 'corto' },
    }))
    expect(res.status).toBe(400)
  })

  it('resolución inválida → 400', async () => {
    const res = await uncertainPOST(req('/crm/outbox/uncertain', {
      method: 'POST',
      token: tokenA(), body: { id: unknownId, resolution: 'retry', providerMessageId: 'wamid.X1' },
    }))
    expect(res.status).toBe(400)
  })

  it('conciliar con ID del proveedor → sent, auditado y hilo actualizado', async () => {
    const res = await uncertainPOST(req('/crm/outbox/uncertain', {
      method: 'POST',
      token: tokenA(), body: { id: unknownId, resolution: 'sent', providerMessageId: 'wamid.M8-CONFIRMADO' },
    }))
    expect(res.status).toBe(200)
    const body = await jsonBody(res)
    expect(body.ok).toBe(true)
    const outbound = await db.channelOutboundMessage.findUnique({ where: { id: unknownId } })
    expect(outbound?.status).toBe('sent')
    expect(outbound?.providerMessageId).toBe('wamid.M8-CONFIRMADO')
    expect(outbound?.providerErrorCode).toBe('MANUALLY_CONFIRMED_SENT')
    // Auditoría en la conexión
    const events = await db.channelConnectionEvent.findMany({
      where: { type: 'outbound_manually_reconciled_sent' },
    })
    expect(events.some((e) => e.detail?.includes(unknownId))).toBe(true)
  })

  it('conciliar como failed con nota de evidencia → auditado', async () => {
    const res = await uncertainPOST(req('/crm/outbox/uncertain', {
      method: 'POST',
      token: tokenA(), body: { id: failedId, resolution: 'failed', evidence: 'Meta reporta el mensaje como no entregado a las 10:15' },
    }))
    expect(res.status).toBe(200)
    const outbound = await db.channelOutboundMessage.findUnique({ where: { id: failedId } })
    expect(outbound?.status).toBe('failed')
    expect(outbound?.providerErrorCode).toBe('MANUALLY_CONFIRMED_NOT_SENT')
  })

  it('una intención ya resuelta → 409', async () => {
    const res = await uncertainPOST(req('/crm/outbox/uncertain', {
      method: 'POST',
      token: tokenA(), body: { id: unknownId, resolution: 'sent', providerMessageId: 'wamid.REINTENTO' },
    }))
    expect(res.status).toBe(409)
  })

  it('miembro (no admin) no puede conciliar → 403', async () => {
    // OJO: corre ANTES del test de cross-org (ownerB cambia el rol de userB y
    // la protección real de tokenVersion invalida el token con rol viejo → 401).
    const res = await uncertainPOST(req('/crm/outbox/uncertain', {
      method: 'POST',
      token: tokenFor(FIX.userB), body: { id: 'x', resolution: 'sent', providerMessageId: 'wamid.Y2' },
    }))
    expect(res.status).toBe(403)
  })

  it('intención de otra organización → 404 sin revelar nada', async () => {
    const res = await uncertainPOST(req('/crm/outbox/uncertain', {
      method: 'POST',
      token: await ownerB(), body: { id: sentAlreadyId, resolution: 'failed', evidence: 'Intento de org B sobre org A' },
    }))
    expect(res.status).toBe(404)
  })
})
