import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handle, json } from '../../_lib/shared'
import { requireAuth } from '@/lib/auth'

/**
 * GET /api/dashboard/attention — motivos "Requiere atención" de la organización
 * de la sesión (F4/U2 del plan definitivo).
 *
 * Cuenta SOLO datos existentes de esta organización (sin modelos externos ni
 * suposiciones):
 *  - unreadMessages: suma de unreadCount de la bandeja única (canónico cc: +
 *    WhatsApp legacy del daemon) — exactamente las conversaciones que el
 *    operador ve con badge en la bandeja;
 *  - draftQuotes: cotizaciones en borrador (status draft);
 *  - upcomingReservations: citas programadas de los próximos 7 días (mismo
 *    criterio de ventana que el dashboard: no canceladas, startsAt en [now, +7d]);
 *  - overdueTasks: 0 hasta que el modelo de tareas del PR #6 se fusione (la
 *    regla "sin motivos vacíos" lo oculta).
 *
 * La composición de motivos (orden, capas, textos) vive en
 * dashboard-attention.ts (puro, con pruebas).
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const auth = await requireAuth(req)
    const orgId = auth.orgId
    const now = new Date()
    const in7Days = new Date(now.getTime() + 7 * 86_400_000)

    const [channelUnread, waUnread, draftQuotes, upcomingReservations] = await Promise.all([
      db.channelConversation.aggregate({
        where: { organizationId: orgId, status: 'active', unreadCount: { gt: 0 } },
        _sum: { unreadCount: true },
      }),
      db.whatsAppConversation.aggregate({
        where: { organizationId: orgId, status: 'active', unreadCount: { gt: 0 } },
        _sum: { unreadCount: true },
      }),
      db.quote.count({ where: { organizationId: orgId, status: 'draft' } }),
      db.reservation.count({
        where: { organizationId: orgId, startsAt: { gte: now, lte: in7Days }, status: { not: 'cancelled' } },
      }),
    ])

    return json({
      counts: {
        unreadMessages: (channelUnread._sum.unreadCount ?? 0) + (waUnread._sum.unreadCount ?? 0),
        draftQuotes,
        upcomingReservations,
        overdueTasks: 0,
      },
      sampledAt: new Date().toISOString(),
    })
  })
}
