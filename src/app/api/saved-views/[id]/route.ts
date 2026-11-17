import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handle, json } from '@/lib/api-helpers'
import { db } from '@/lib/db'

/** PUT /api/saved-views/:id — actualiza (solo propias o admin) */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireAuth(req)
    const { id } = await params
    const view = await db.savedView.findFirst({ where: { id, organizationId: auth.orgId } })
    if (!view) return json({ error: 'Vista no encontrada' }, { status: 404 })
    if (view.userId && view.userId !== auth.userId && !auth.isAdmin) {
      return json({ error: 'Sin permisos para modificar esta vista' }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 120)
    if (body.filters !== undefined) {
      if (Array.isArray(body.filters)) data.filters = JSON.stringify(body.filters)
      else if (typeof body.filters === 'string') data.filters = body.filters || null
      else if (body.filters === null) data.filters = null
    }
    if (body.sort !== undefined) {
      data.sort = typeof body.sort === 'object' && body.sort !== null ? JSON.stringify(body.sort) : (body.sort as string | null) || null
    }
    if (typeof body.isShared === 'boolean') data.isShared = body.isShared
    if (typeof body.isDefault === 'boolean') data.isDefault = body.isDefault

    // (FASE 5 defensa en profundidad) WHERE id = ? AND organization_id = ?
    const updatedCount = await db.savedView.updateMany({ where: { id, organizationId: auth.orgId }, data })
    if (updatedCount.count !== 1) return json({ error: 'Vista no encontrada' }, { status: 404 })
    const updated = await db.savedView.findUniqueOrThrow({ where: { id } })
    return json({ view: updated })
  })
}

/** DELETE /api/saved-views/:id — elimina (solo propias o admin) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireAuth(req)
    const { id } = await params
    const view = await db.savedView.findFirst({ where: { id, organizationId: auth.orgId } })
    if (!view) return json({ error: 'Vista no encontrada' }, { status: 404 })
    if (view.userId && view.userId !== auth.userId && !auth.isAdmin) {
      return json({ error: 'Sin permisos para eliminar esta vista' }, { status: 403 })
    }
    // (FASE 5 defensa en profundidad) DELETE con filtro de organización explícito
    const deleted = await db.savedView.deleteMany({ where: { id, organizationId: auth.orgId } })
    if (deleted.count !== 1) return json({ error: 'Vista no encontrada' }, { status: 404 })
    return json({ success: true })
  })
}
