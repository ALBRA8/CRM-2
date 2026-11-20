/**
 * GET /api/whatsapp/connections/events — últimos eventos de conexión de TODAS
 * las conexiones WhatsApp de la organización (F3-T02: "registro de eventos de
 * conexión" en la pantalla de conexiones multi-número).
 *
 * AISLAMIENTO: filtrado SIEMPRE por organizationId de la sesión JWT (decisión
 * #8); una org jamás ve eventos de otra. Endpoint aditivo: no cambia contrato
 * de las rutas existentes ([id] sigue exponiendo sus propios eventos).
 */
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { handle, json } from '../../../_lib/shared'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  return handle(async () => {
    const auth = await requireAuth(req)
    const take = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get('take') || 20) || 20))
    const events = await db.whatsAppConnectionEvent.findMany({
      where: { organizationId: auth.orgId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        connectionId: true,
        type: true,
        detail: true,
        createdAt: true,
        connection: { select: { phoneNumber: true, displayName: true, phoneNumberId: true } },
      },
    })
    return json({ events })
  })
}
