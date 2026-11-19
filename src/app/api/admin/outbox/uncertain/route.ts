import type { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handle, json } from '@/lib/api-helpers'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * GET /api/admin/outbox/uncertain — (M8 / F3-T05) inciertos DE LA ORGANIZACIÓN.
 *
 * Pantalla de operador sobre la política de la outbox: los envíos `unknown`
 * (resultado ambiguo tras timeout/crash) JAMÁS se reintentan automáticamente;
 * requieren conciliación manual con evidencia del proveedor. Este endpoint
 * lista los inciertos de la organización de la sesión (aislamiento por
 * organizationId a través de conversation.connection) para que el operador
 * los resuelva sin SQL manual.
 *
 * Los endpoints internos (/api/internal/channel-outbox*) siguen intactos:
 * usan secreto de worker y son server-to-server; el navegador NO puede
 * cargarlos, por eso esta ruta usa la sesión JWT (requireAdmin).
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const auth = await requireAdmin(req)

    const [unknown, queued, sending, sent, failed] = await Promise.all([
      db.channelOutboundMessage.findMany({
        where: { status: 'unknown', conversation: { is: { connection: { is: { organizationId: auth.orgId } } } } },
        orderBy: { finishedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          body: true,
          providerErrorCode: true,
          providerMessageId: true,
          createdAt: true,
          finishedAt: true,
          conversation: {
            select: {
              id: true,
              channel: true,
              externalContactKey: true,
              contactName: true,
              connection: { select: { id: true, displayName: true, channel: true, status: true } },
            },
          },
        },
      }),
      db.channelOutboundMessage.count({ where: { status: 'queued', conversation: { is: { connection: { is: { organizationId: auth.orgId } } } } } }),
      db.channelOutboundMessage.count({ where: { status: 'sending', conversation: { is: { connection: { is: { organizationId: auth.orgId } } } } } }),
      db.channelOutboundMessage.count({ where: { status: 'sent', conversation: { is: { connection: { is: { organizationId: auth.orgId } } } } } }),
      db.channelOutboundMessage.count({ where: { status: 'failed', conversation: { is: { connection: { is: { organizationId: auth.orgId } } } } } }),
    ])

    return json({
      counts: { unknown: unknown.length, queued, sending, sent, failed },
      items: unknown.map((m) => ({
        id: m.id,
        body: m.body,
        providerErrorCode: m.providerErrorCode,
        providerMessageId: m.providerMessageId,
        createdAt: m.createdAt.toISOString(),
        finishedAt: m.finishedAt?.toISOString() ?? null,
        channel: m.conversation.channel,
        contactName: m.conversation.contactName || m.conversation.externalContactKey,
        contactHandle: m.conversation.externalContactKey,
        connectionId: m.conversation.connection.id,
        connectionName: m.conversation.connection.displayName,
        connectionStatus: m.conversation.connection.status,
      })),
      note: 'Los unknown jamás se reintentan automáticamente: resolver aquí con evidencia del proveedor.',
    })
  })
}
