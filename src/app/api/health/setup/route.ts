import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handle, json } from '../../../api/_lib/shared'
import { requireAdmin } from '@/lib/auth'

/**
 * GET /api/health/setup — estado REAL de los 4 pasos de puesta en marcha
 * (F5/F6-T02 del plan definitivo) para la organización de la sesión.
 *
 * La API del doctor (/api/doctor) NO cambia su contrato: este endpoint solo
 * complementa el wizard con señales que el doctor no expone (conexiones Cloud
 * en BD y primer envío saliente real). Solo administradores.
 *
 * Señales (todas verificables en BD, sin suposiciones):
 *  - organización creada: garantizada por requireAdmin (existe la sesión);
 *  - número conectado: WhatsAppConnection connected (Cloud multi-número) O
 *    ChannelConnection connected de cualquier canal;
 *  - agente IA configurado: settings.llmBaseUrl presente;
 *  - primer envío: ChannelOutboundMessage status sent O WhatsAppMessage
 *    outbound del daemon (al menos uno real).
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const auth = await requireAdmin(req)
    const orgId = auth.orgId

    const [waConnections, cloudConnections, settings, sentCanonical, sentDaemon] = await Promise.all([
      db.whatsAppConnection.count({ where: { organizationId: orgId, status: 'connected' } }),
      db.channelConnection.count({ where: { organizationId: orgId, status: 'connected' } }),
      db.settings.findUnique({ where: { organizationId: orgId }, select: { llmBaseUrl: true } }),
      db.channelOutboundMessage.count({ where: { status: 'sent', conversation: { is: { organizationId: orgId } } } }),
      db.whatsAppMessage.count({ where: { organizationId: orgId, direction: 'outbound' } }),
    ])

    return json({
      steps: {
        orgExists: true,
        numberConnected: waConnections > 0 || cloudConnections > 0,
        llmConfigured: !!(settings as { llmBaseUrl?: string | null } | null)?.llmBaseUrl,
        firstSendDone: sentCanonical > 0 || sentDaemon > 0,
      },
      counts: {
        waConnections,
        cloudConnections,
        sentCanonical,
        sentDaemon,
      },
      sampledAt: new Date().toISOString(),
    })
  })
}
