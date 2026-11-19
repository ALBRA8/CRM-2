import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, HttpError } from '@/lib/auth'
import { auditAndTimeline, parseIntParam } from '@/lib/api-helpers'
import { handle, json, readBody, requireFields, str, dateOrNull, qparam } from '../_lib/shared'

/**
 * Tareas y recordatorios comerciales (cierre integral, bloque C).
 * Tenencia estricta por organización: todo WHERE incluye organizationId.
 */

const PRIORIDADES = ['alta', 'normal', 'baja']
const ESTADOS = ['open', 'done']

function serializeTask(t: {
  id: string
  title: string
  notes: string | null
  dueAt: Date | null
  priority: string
  status: string
  completedAt: Date | null
  userId: string | null
  clientId: string | null
  createdAt: Date
  updatedAt: Date
  client?: { id: string; name: string; phone: string | null; email: string | null } | null
}) {
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    priority: t.priority,
    status: t.status,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    userId: t.userId,
    clientId: t.clientId,
    client: t.client ? { id: t.client.id, name: t.client.name, phone: t.client.phone, email: t.client.email } : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

const INCLUDE_CLIENT = { select: { id: true, name: true, phone: true, email: true } }

/** GET /api/tasks — filtros: status, clientId, priority, upcoming, limit. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const auth = await requireAuth(req)
    const status = qparam(req, 'status')
    const clientId = qparam(req, 'clientId')
    const priority = qparam(req, 'priority')
    const upcoming = qparam(req, 'upcoming')
    const limit = parseIntParam(req, 'limit', 100, 1, 500)

    if (status && !ESTADOS.includes(status)) throw new HttpError(400, 'Estado inválido (open | done)')
    if (priority && !PRIORIDADES.includes(priority)) throw new HttpError(400, 'Prioridad inválida (alta | normal | baja)')

    const tasks = await db.task.findMany({
      where: {
        organizationId: auth.orgId,
        ...(status ? { status } : {}),
        ...(clientId ? { clientId } : {}),
        ...(priority ? { priority } : {}),
        ...(upcoming ? { status: 'open', dueAt: { not: null, gte: new Date() } } : {}),
      },
      orderBy: upcoming ? { dueAt: 'asc' } : [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      include: { client: INCLUDE_CLIENT },
    })

    return json({ tasks: tasks.map(serializeTask) })
  })
}

/** POST /api/tasks — { title, notes?, dueAt?, priority?, clientId? } */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const auth = await requireAuth(req)
    const body = await readBody(req)
    requireFields(body, ['title'])
    const title = str(body.title)
    if (!title) throw new HttpError(400, 'El título no puede quedar vacío')

    const priority = str(body.priority) ?? 'normal'
    if (!PRIORIDADES.includes(priority)) throw new HttpError(400, 'Prioridad inválida (alta | normal | baja)')
    const dueAt = dateOrNull(body.dueAt)
    if (body.dueAt && !dueAt) throw new HttpError(400, 'Fecha de vencimiento inválida')

    const clientId = str(body.clientId)
    if (clientId) {
      const client = await db.client.findFirst({ where: { id: clientId, organizationId: auth.orgId }, select: { id: true } })
      if (!client) throw new HttpError(400, 'Cliente no encontrado')
    }

    const created = await db.task.create({
      data: {
        organizationId: auth.orgId,
        title,
        notes: str(body.notes),
        dueAt,
        priority,
        status: 'open',
        userId: auth.userId,
        clientId: clientId || null,
      },
      include: { client: INCLUDE_CLIENT },
    })

    await auditAndTimeline({
      orgId: auth.orgId,
      userId: auth.userId,
      action: 'created',
      entity: 'task',
      entityId: created.id,
      details: { title: created.title, priority: created.priority, dueAt: created.dueAt?.toISOString() ?? null },
      clientId: created.clientId,
    })

    return json({ task: serializeTask(created) }, { status: 201 })
  })
}
