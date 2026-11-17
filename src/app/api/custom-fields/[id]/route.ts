import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, HttpError } from '@/lib/auth'
import { auditAndTimeline } from '@/lib/api-helpers'
import { handle, json, readBody, str, numOrNull, bool } from '../../_lib/shared'
import { serializeField } from '../../_lib/custom-fields'

/** PUT /api/custom-fields/:id — actualiza la definición del campo. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireAdmin(req)
    const { id } = await params
    const field = await db.customField.findFirst({ where: { id, organizationId: auth.orgId } })
    if (!field) throw new HttpError(404, 'Campo no encontrado')
    const body = await readBody(req)

    const data: Record<string, unknown> = {}
    if ('name' in body) data.name = str(body.name) ?? field.name
    if ('label' in body) data.label = str(body.label) ?? field.name
    if ('fieldType' in body || 'type' in body) data.type = str(body.fieldType) ?? str(body.type) ?? field.type
    if ('options' in body) data.options = str(body.options)
    if ('isRequired' in body) data.isRequired = bool(body.isRequired, field.isRequired)
    if ('order' in body) data.order = numOrNull(body.order) ?? field.order

    // (FASE 5 defensa en profundidad) WHERE id = ? AND organization_id = ?
    const updatedCount = await db.customField.updateMany({ where: { id, organizationId: auth.orgId }, data })
    if (updatedCount.count !== 1) throw new HttpError(404, 'Campo no encontrado')
    const updated = await db.customField.findUniqueOrThrow({ where: { id } })
    await auditAndTimeline({
      orgId: auth.orgId,
      userId: auth.userId,
      action: 'updated',
      entity: 'custom_field',
      entityId: id,
      details: { name: updated.name },
    })
    return json({ field: serializeField(updated) })
  })
}

/** DELETE /api/custom-fields/:id — elimina el campo y sus valores (cascade). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireAdmin(req)
    const { id } = await params
    const field = await db.customField.findFirst({ where: { id, organizationId: auth.orgId }, select: { id: true, name: true } })
    if (!field) throw new HttpError(404, 'Campo no encontrado')

    // (FASE 5 defensa en profundidad) DELETE con filtro de organización explícito
    const deleted = await db.customField.deleteMany({ where: { id, organizationId: auth.orgId } })
    if (deleted.count !== 1) throw new HttpError(404, 'Campo no encontrado')
    await auditAndTimeline({
      orgId: auth.orgId,
      userId: auth.userId,
      action: 'deleted',
      entity: 'custom_field',
      entityId: id,
      details: { name: field.name },
    })
    return json({ success: true })
  })
}
