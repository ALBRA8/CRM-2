import type { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handle, json } from '@/lib/api-helpers'
import { readBody } from '../../../../_lib/shared'
import { db } from '@/lib/db'
import { reconcileUnknownChannelOutboundMessage, ChannelOutboundError } from '@/lib/channel-outbox'

export const runtime = 'nodejs'

/**
 * POST /api/admin/outbox/uncertain/reconcile — (M8 / F3-T05) conciliación
 * operable de un envío UNCERTAIN con evidencia del proveedor.
 *
 * Misma política que el endpoint interno /api/internal/channel-outbox/reconcile
 * (contrato sin cambios) pero autenticado con la sesión JWT del operador y
 * AISLADO por organización: el intento debe pertenecer a la organización de
 * la sesión (verificación previa por conversation.connection); un intento de
 * otra org responde 404 sin revelar nada.
 *
 * Exigencias preservadas:
 *  - `providerChecked=true` OBLIGATORIO: conciliar es una acción de operador
 *    tras comprobar el estado REAL en el proveedor, nunca un reintento ciego.
 *  - `resolution` ∈ {sent, failed}: 'sent' exige además un identificador de
 *    mensaje del proveedor como evidencia (el endpoint interno lo deja
 *    opcional; el operador aquí aporta la evidencia que el flujo pide).
 *  - Nunca vuelve a 'queued' ni hace llamadas de red (la lib lo garantiza).
 *  - Auditoría: la lib escribe channelConnectionEvent del caso.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const auth = await requireAdmin(req)
    const body = await readBody(req)

    const id = typeof body.id === 'string' ? body.id.slice(0, 128) : ''
    const resolution = typeof body.resolution === 'string' ? body.resolution : ''
    const providerChecked = body.providerChecked === true
    const providerMessageId = typeof body.providerMessageId === 'string'
      ? body.providerMessageId.slice(0, 256).replace(/[\r\n]/g, '')
      : ''

    if (!id || (resolution !== 'sent' && resolution !== 'failed') || !providerChecked) {
      return json(
        { error: 'Se requiere id, resolución sent/failed y la confirmación de verificación en el proveedor' },
        { status: 400 },
      )
    }
    if (resolution === 'sent' && !providerMessageId) {
      return json(
        { error: 'Para confirmar el envío, pega el identificador del mensaje en el proveedor (evidencia)' },
        { status: 400 },
      )
    }

    // Aislamiento: la intención debe existir y ser de ESTA organización
    // (sin filtrar por estado: si ya no es unknown, la lib responde
    // INVALID_STATE → 409, mensaje más útil que un 404 ambiguo). La lib no
    // verifica org (confía en su llamador interno), así que el gate es aquí.
    const outbound = await db.channelOutboundMessage.findFirst({
      where: { id, conversation: { is: { connection: { is: { organizationId: auth.orgId } } } } },
      select: { id: true },
    })
    if (!outbound) return json({ error: 'Intención no encontrada' }, { status: 404 })

    try {
      const result = await reconcileUnknownChannelOutboundMessage({
        id,
        resolution,
        providerMessageId: providerMessageId || null,
      })
      return json({ ok: true, resolution, messageId: result?.id ?? null })
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === 'NOT_FOUND') return json({ error: 'Intención no encontrada' }, { status: 404 })
      if (code === 'INVALID_STATE') return json({ error: 'La intención ya no está en estado unknown (¿la concilió otro operador?)' }, { status: 409 })
      if (error instanceof ChannelOutboundError && code === 'INVALID_STATE') return json({ error: error.message }, { status: 409 })
      throw error
    }
  })
}
