import { describe, expect, it, beforeEach } from 'vitest'
import { GET as tasksGET, POST as tasksPOST } from '@/app/api/tasks/route'
import { PATCH as taskPATCH, DELETE as taskDELETE } from '@/app/api/tasks/[id]/route'
import { db } from '@/lib/db'
import { FIX, jsonBody, req, routeParams, tokenFor } from '../helpers'

/**
 * Cierre integral (bloque C): tareas y recordatorios comerciales.
 *  - CRUD completo con tenencia estricta por organización.
 *  - Aislamiento cross-org: la tarea de la org A es 404 para la org B (sin
 *    oráculo) y NO aparece en el listado de B.
 *  - Validaciones: prioridad/estado inválidos → 400; cliente de otra org → 400.
 *  - Completar/reabrir gestiona completedAt; filtros upcoming/status/clientId.
 */

const A = () => tokenFor(FIX.userA)
const B = () => tokenFor(FIX.userB)

async function crearTarea(body: Record<string, unknown>, token = A()) {
  const r = await tasksPOST(req('/api/tasks', { method: 'POST', token, body }))
  return { r, body: (await jsonBody(r)) as { task: { id: string; title: string; status: string; priority: string; dueAt: string | null; completedAt: string | null; client?: { id: string } | null } } }
}

beforeEach(async () => {
  await db.task.deleteMany({ where: { organizationId: { in: [FIX.orgA.id, FIX.orgB.id] } } })
})

describe('tareas: creación y listado con tenencia por organización', () => {
  it('crea tarea básica y con cliente de la propia org', async () => {
    const { r, body } = await crearTarea({ title: 'Llamar al cliente', priority: 'alta', dueAt: '2030-01-15T10:00:00.000Z', clientId: FIX.clientA1.id })
    expect(r.status).toBe(201)
    expect(body.task.title).toBe('Llamar al cliente')
    expect(body.task.priority).toBe('alta')
    expect(body.task.status).toBe('open')
    expect(body.task.dueAt).toBe('2030-01-15T10:00:00.000Z')
    expect(body.task.client?.id).toBe(FIX.clientA1.id)
  })

  it('rechaza prioridad inválida, título vacío y cliente de otra organización', async () => {
    const r1 = await tasksPOST(req('/api/tasks', { method: 'POST', token: A(), body: { title: 'x', priority: 'urgente' } }))
    expect(r1.status).toBe(400)
    const r2 = await tasksPOST(req('/api/tasks', { method: 'POST', token: A(), body: { title: '  ' } }))
    expect(r2.status).toBe(400)
    const r3 = await tasksPOST(req('/api/tasks', { method: 'POST', token: A(), body: { title: 'x', clientId: FIX.clientB1.id } }))
    expect(r3.status).toBe(400)
    const r4 = await tasksPOST(req('/api/tasks', { method: 'POST', token: A(), body: {} }))
    expect(r4.status).toBe(400)
  })

  it('el listado solo muestra tareas de la organización del token', async () => {
    await crearTarea({ title: 'tarea org A' })
    await crearTarea({ title: 'tarea org B' }, B())
    const listA = (await jsonBody(await tasksGET(req('/api/tasks', { token: A() })))) as { tasks: { title: string }[] }
    const listB = (await jsonBody(await tasksGET(req('/api/tasks', { token: B() })))) as { tasks: { title: string }[] }
    expect(listA.tasks.map((t) => t.title)).toContain('tarea org A')
    expect(listA.tasks.map((t) => t.title)).not.toContain('tarea org B')
    expect(listB.tasks.map((t) => t.title)).toEqual(['tarea org B'])
  })
})

describe('tareas: actualización y aislamiento cross-org', () => {
  it('marca como hecha (completedAt) y reabre (completedAt null)', async () => {
    const { body } = await crearTarea({ title: 'Enviar propuesta' })
    const id = body.task.id
    const done = await taskPATCH(req(`/api/tasks/${id}`, { method: 'PATCH', token: A(), body: { status: 'done' } }), routeParams(id))
    expect(done.status).toBe(200)
    const doneBody = (await jsonBody(done)) as { task: { status: string; completedAt: string | null } }
    expect(doneBody.task.status).toBe('done')
    expect(doneBody.task.completedAt).not.toBeNull()
    const reopened = await taskPATCH(req(`/api/tasks/${id}`, { method: 'PATCH', token: A(), body: { status: 'open' } }), routeParams(id))
    const reopenedBody = (await jsonBody(reopened)) as { task: { status: string; completedAt: string | null } }
    expect(reopenedBody.task.completedAt).toBeNull()
  })

  it('404 sin oráculo para otra organización (PATCH y DELETE)', async () => {
    const { body } = await crearTarea({ title: 'secreto org A' })
    const id = body.task.id
    const p = await taskPATCH(req(`/api/tasks/${id}`, { method: 'PATCH', token: B(), body: { status: 'done' } }), routeParams(id))
    expect(p.status).toBe(404)
    const d = await taskDELETE(req(`/api/tasks/${id}`, { method: 'DELETE', token: B() }), routeParams(id))
    expect(d.status).toBe(404)
    // La tarea sigue intacta y visible para su org
    const listA = (await jsonBody(await tasksGET(req('/api/tasks', { token: A() })))) as { tasks: { id: string }[] }
    expect(listA.tasks.map((t) => t.id)).toContain(id)
    // DELETE legítimo por la org dueña
    const del = await taskDELETE(req(`/api/tasks/${id}`, { method: 'DELETE', token: A() }), routeParams(id))
    expect(del.status).toBe(200)
    const listA2 = (await jsonBody(await tasksGET(req('/api/tasks', { token: A() })))) as { tasks: { id: string }[] }
    expect(listA2.tasks.map((t) => t.id)).not.toContain(id)
  })

  it('filtros status, clientId y upcoming ordenan y limitan el listado', async () => {
    const pasada = new Date(Date.now() - 86_400_000).toISOString()
    const futura = new Date(Date.now() + 86_400_000).toISOString()
    await crearTarea({ title: 'vencida', dueAt: pasada })
    await crearTarea({ title: 'futura', dueAt: futura })
    await crearTarea({ title: 'sin fecha' })
    const { body: doneTask } = await crearTarea({ title: 'ya hecha', dueAt: futura })
    await taskPATCH(req(`/api/tasks/${doneTask.task.id}`, { method: 'PATCH', token: A(), body: { status: 'done' } }), routeParams(doneTask.task.id))
    await crearTarea({ title: 'tarea con cliente', clientId: FIX.clientA1.id })

    const open = (await jsonBody(await tasksGET(req('/api/tasks?status=open', { token: A() })))) as { tasks: { title: string }[] }
    expect(open.tasks.map((t) => t.title)).not.toContain('ya hecha')
    const upcoming = (await jsonBody(await tasksGET(req('/api/tasks?upcoming=1', { token: A() })))) as { tasks: { title: string }[] }
    expect(upcoming.tasks.map((t) => t.title)).toEqual(['futura'])
    const porCliente = (await jsonBody(await tasksGET(req(`/api/tasks?clientId=${FIX.clientA1.id}`, { token: A() })))) as { tasks: { title: string }[] }
    for (const t of porCliente.tasks) expect(t.title).toBe('tarea con cliente')
  })
})
