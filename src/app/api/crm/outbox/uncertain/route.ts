import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handle, json } from '@/lib/api-helpers'
import { readBody, str } from '../../../_lib/shared'
import { requireAuth, HttpError } from '@/lib/auth'
import { reconcileUnknownChannelOutboundMessage } from '@/lib/channel-outbox'

export const runtime = 'nodejs'

/**
 * M8 — Reconciliación operable de envíos UNCERTAIN (vista de operador).
 *
 * GET  /api/crm/outbox/uncertain — inciertos y sospechosos DE LA ORGANIZACIÓN
 *      de la sesión (admin): id, canal, contacto, cuerpo truncado, intentos,
 *      código de error del proveedor y antigüedad.
 * POST /api/crm/outbox/uncertain — concilia UN intento con la MISMA política
 *      del endpoint interno (resolution sent|failed + evidencia del proveedor).
 *      Reutiliza `reconcileUnknownChannelOutboundMessage` (CAS + verificación de
 *      eco); NO cambia el contrato del endpoint interno del worker.
 *
 * Política de evidencia (idéntica a la API interna): el reintento automático de
 * un `unknown` está prohibido; el operador debe aportar providerMessageId o una
 * nota de evidencia de lo verificado con el proveedor. Sin evidencia → 400.
 * Aislamiento: la búsqueda es SIEMPRE por organizationId de la sesión; un
 * intento de otra organización responde 404 sin revelar nada.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const auth = await requireAuth(req)
    if (!auth.isAdmin) throw new HttpError(403, 'Solo un administrador puede ver la conciliación de envíos')
    const rows = await db.channelOutboundMessage.findMany({
      where: {
        status: { in: ['unknown', 'sending'] },
        conversation: { is: { organizationId: auth.orgId } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        body: true,
        status: true,
        attemptCount: true,
        providerErrorCode: true,
        providerMessageId: true,
        createdAt: true,
        conversation: {
          select: { id: true, channel: true, externalContactKey: true, contactName: true },
        },
      },
    })
    return json({
      uncertain: rows.map((r) => ({
        id: r.id,
        status: r.status,
        body: r.body,
        attemptCount: r.attemptCount,
        providerErrorCode: r.providerErrorCode,
        providerMessageId: r.providerMessageId,
        createdAt: r.createdAt.toISOString(),
        channel: r.conversation.channel,
        contactName: r.conversation.contactName,
        contactHandle: r.conversation.externalContactKey,
        conversationId: r.conversation.id,
      })),
    })
  })
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const auth = await requireAuth(req)
    if (!auth.isAdmin) throw new HttpError(403, 'Solo un administrador puede conciliar envíos')
    const body = await readBody(req)
    const id = str(body.id) || ''
    const resolution = str(body.resolution) || ''
    const providerMessageId = str(body.providerMessageId) || ''
    const evidence = str(body.evidence) || ''

    if (!id || !['sent', 'failed'].includes(resolution)) {
      throw new HttpError(400, 'Se requiere id y resolución sent/failed')
    }
    // Política de evidencia: igual que el endpoint interno (providerChecked).
    // O ID del proveedor, o nota de evidencia de lo verificado. Sin evidencia → 400.
    const pmi = providerMessageId.trim()
    if (!pmi && evidence.trim().length < 10) {
      throw new HttpError(400, 'Evidencia requerida: ID del proveedor o nota de lo verificado (mínimo 10 caracteres)')
    }
    if (pmi && (pmi.length > 256 || /[\r\n]/.test(pmi))) {
      throw new HttpError(400, 'providerMessageId inválido')
    }

    // Propiedad de la organización ANTES de conciliar (404 sin revelar nada).
    const owned = await db.channelOutboundMessage.findFirst({
      where: { id, conversation: { is: { organizationId: auth.orgId } } },
      select: { id: true, status: true },
    })
    if (!owned) throw new HttpError(404, 'Intención no encontrada')

    try {
      const result = await reconcileUnknownChannelOutboundMessage({
        id,
        resolution: resolution as 'sent' | 'failed',
        providerMessageId: pmi || null,
      })
      return json({ ok: true, resolution, messageId: result?.id ?? null })
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === 'NOT_FOUND') return json({ error: 'Intención no encontrada' }, { status: 404 })
      if (code === 'INVALID_STATE') return json({ error: 'La intención no está en estado unknown' }, { status: 409 })
      throw error
    }
  })
}
