import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handle, json } from '@/lib/api-helpers'
import { readBody, str } from '../../../../_lib/shared'
import { requireAdmin, HttpError } from '@/lib/auth'
import { reconcileUnknownChannelOutboundMessage } from '@/lib/channel-outbox'

/**
 * POST /api/outbox/uncertain/[id]/reconcile — resolución operable de un envío
 * UNCERTAIN (M8 del plan definitivo), versión de SESIÓN (JWT de admin) sobre
 * la MISMA función de la librería que usa el endpoint interno
 * /api/internal/channel-outbox/reconcile (contrato interno sin cambios).
 *
 * Política fail-closed:
 *  - solo administradores de la organización dueña (JOIN por orgId del JWT;
 *    una intención de otra org responde 404 sin revelar existencia);
 *  - exige providerChecked === true (el operador ya consultó el proveedor);
 *  - exige evidencia textual mínima (>= 10 chars) que queda AUDITADA en
 *    ChannelConnectionEvent junto al userId que concilió;
 *  - nunca reintenta ni llama a la red: solo registra el desenlace verificado.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireAdmin(req)
    const { id } = await ctx.params
    const body = await readBody(req)
    const resolution = str(body.resolution) ?? ''
    const providerMessageId = str(body.providerMessageId) ?? ''
    const evidence = str(body.evidence) ?? ''
    const providerChecked = body.providerChecked === true

    if (!['sent', 'failed'].includes(resolution)) {
      throw new HttpError(400, 'Resolución requerida: sent o failed')
    }
    if (!providerChecked) {
      throw new HttpError(400, 'Debes verificar el estado en el proveedor antes de conciliar (providerChecked=true)')
    }
    if (evidence.length < 10) {
      throw new HttpError(400, 'La evidencia es obligatoria: describe qué comprobaste en el proveedor (mínimo 10 caracteres)')
    }
    if (providerMessageId && (providerMessageId.length > 256 || /[\r\n]/.test(providerMessageId))) {
      throw new HttpError(400, 'providerMessageId inválido')
    }

    // Pertenencia a la organización ANTES de conciliar (aislamiento estructural).
    // El estado NO se filtra aquí: si la intención existe pero ya fue conciliada,
    // la librería lanza INVALID_STATE y respondemos 409 (más informativo que 404).
    const owned = await db.channelOutboundMessage.findFirst({
      where: { id, conversation: { is: { organizationId: auth.orgId } } },
      select: { id: true, status: true, conversation: { select: { connectionId: true } } },
    })
    if (!owned) {
      // Sin revelar si el id existe en otra organización.
      throw new HttpError(404, 'Intención no encontrada')
    }

    try {
      const result = await reconcileUnknownChannelOutboundMessage({
        id,
        resolution: resolution as 'sent' | 'failed',
        providerMessageId: providerMessageId || null,
      })
      // Auditoría del caso: quién, qué evidencia y desenlace (detail sanitizado).
      await db.channelConnectionEvent.create({
        data: {
          organizationId: auth.orgId,
          connectionId: owned.conversation.connectionId,
          type: resolution === 'sent' ? 'outbound_reconciled_sent' : 'outbound_reconciled_failed',
          detail: `outboundId=${id} user=${auth.userId} evidence=${evidence.slice(0, 300)}${providerMessageId ? ` providerMessageId=${providerMessageId.slice(0, 128)}` : ''}`,
        },
      })
      return json({ ok: true, resolution, messageId: result?.id ?? null })
    } catch (error) {
      const code = (error as { code?: string } | null)?.code
      if (code === 'NOT_FOUND') throw new HttpError(404, 'Intención no encontrada')
      if (code === 'INVALID_STATE') throw new HttpError(409, 'La intención no está en estado unknown o fue conciliada por otro proceso')
      throw error
    }
  })
}
