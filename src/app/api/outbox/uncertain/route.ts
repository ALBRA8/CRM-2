import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handle, json } from '@/lib/api-helpers'
import { requireAuth, requireAdmin } from '@/lib/auth'

/**
 * GET /api/outbox/uncertain — lista de envíos UNCERTAIN de la organización de
 * la sesión (M8 del plan definitivo: reconciliación operable sin SQL manual).
 *
 * Solo administradores (owner/admin/superadmin). El aislamiento multi-tenant
 * es estructural: el JOIN a ChannelConversation filtra por el organizationId
 * del JWT — una org jamás ve las intenciones de otra. El cuerpo se trunca a
 * 200 chars y NUNCA se exponen providerMessageId/token/PII extra.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const auth = await requireAdmin(req)

    const rows = await db.channelOutboundMessage.findMany({
      where: { status: 'unknown', conversation: { is: { organizationId: auth.orgId } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        body: true,
        status: true,
        providerErrorCode: true,
        attemptCount: true,
        requestedByUserId: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
        conversation: {
          select: {
            id: true,
            channel: true,
            externalContactKey: true,
            contactName: true,
            connection: { select: { displayName: true, channel: true, status: true } },
          },
        },
      },
    })

    const uncertain = rows.map((r) => ({
      id: r.id,
      body: r.body.slice(0, 200),
      channel: r.conversation.channel,
      connectionName: r.conversation.connection?.displayName ?? null,
      contact: r.conversation.externalContactKey,
      contactName: r.conversation.contactName,
      conversationId: r.conversation.id,
      connectionStatus: r.conversation.connection?.status ?? null,
      errorCode: r.providerErrorCode,
      attemptCount: r.attemptCount,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    }))

    return json({
      uncertain,
      count: uncertain.length,
      note: 'unknown jamás se reintenta automáticamente: resolver con evidencia del proveedor.',
    })
  })
}
