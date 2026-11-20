import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, HttpError } from '@/lib/auth'
import { auditAndTimeline } from '@/lib/api-helpers'
import { handle, json, readBody, str, dateOrNull } from '../../_lib/shared'

/**
 * PATCH /api/tasks/:id — actualización parcial (título, notas, vencimiento,
 * prioridad, estado, cliente). DELETE /api/tasks/:id — elimina la tarea.
 * Ambos fail-closed: la tarea debe existir DENTRO de la organización del
 * token (404 genérico, sin oráculo de existencia fuera de la org).
 */

const PRIORIDADES = ['alta', 'normal', 'baja']
const ESTADOS = ['open', 'done']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireAuth(req)
    const { id } = await params
    const existing = await db.task.findFirst({ where: { id, organizationId: auth.orgId } })
    if (!existing) throw new HttpError(404, 'Tarea no encontrada')
    const body = await readBody(req)

    const data: Record<string, unknown> = {}
    if ('title' in body) {
      const title = str(body.title)
      if (!title) throw new HttpError(400, 'El título no puede quedar vacío')
      data.title = title
    }
    if ('notes' in body) data.notes = str(body.notes)
    if ('dueAt' in body) {
      const dueAt = dateOrNull(body.dueAt)
      if (body.dueAt && !dueAt) throw new HttpError(400, 'Fecha de vencimiento inválida')
      data.dueAt = dueAt
    }
    if ('priority' in body) {
      const priority = str(body.priority)
      if (!priority || !PRIORIDADES.includes(priority)) throw new HttpError(400, 'Prioridad inválida (alta | normal | baja)')
      data.priority = priority
    }
    if ('status' in body) {
      const status = str(body.status)
      if (!status || !ESTADOS.includes(status)) throw new HttpError(400, 'Estado inválido (open | done)')
      data.status = status
      // Completar/reabrir con marca de tiempo coherente
      if (status === 'done' && existing.status !== 'done') data.completedAt = new Date()
      if (status === 'open' && existing.status !== 'open') data.completedAt = null
    }
    if ('clientId' in body) {
      const clientId = str(body.clientId)
      if (clientId) {
        const client = await db.client.findFirst({ where: { id: clientId, organizationId: auth.orgId }, select: { id: true } })
        if (!client) throw new HttpError(400, 'Cliente no encontrado')
      }
      data.clientId = clientId || null
    }

    const updated = await db.task.update({
      where: { id },
      data,
      include: { client: { select: { id: true, name: true, phone: true, email: true } } },
    })

    await auditAndTimeline({
      orgId: auth.orgId,
      userId: auth.userId,
      action: 'updated',
      entity: 'task',
      entityId: updated.id,
      details: { status: updated.status, title: updated.title },
      clientId: updated.clientId,
    })

    return json({ task: { id: updated.id, status: updated.status, completedAt: updated.completedAt?.toISOString() ?? null } })
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireAuth(req)
    const { id } = await params
    const existing = await db.task.findFirst({ where: { id, organizationId: auth.orgId }, select: { id: true, title: true } })
    if (!existing) throw new HttpError(404, 'Tarea no encontrada')

    await db.task.delete({ where: { id } })
    await auditAndTimeline({
      orgId: auth.orgId,
      userId: auth.userId,
      action: 'deleted',
      entity: 'task',
      entityId: existing.id,
      details: { title: existing.title },
    })

    return json({ ok: true })
  })
}
