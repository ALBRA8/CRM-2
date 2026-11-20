import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { GET as eventsGet } from '@/app/api/whatsapp/connections/events/route'
import { db } from '@/lib/db'
import { FIX, jsonBody, req, tokenA, tokenB, tokenFor } from '../helpers'

/**
 * F3-T02 (F2) — endpoint de eventos de conexión a nivel organización.
 * La UI multi-número consume ESTE endpoint (una sola llamada) en vez de N
 * llamadas a /api/whatsapp/connections/[id].
 *
 * Invariante clave (decisión #8): una organización JAMÁS ve eventos de otra.
 */
describe('GET /api/whatsapp/connections/events', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    // La org A es pilot (1 número activo): para sembrar varias conexiones
    // elevamos temporalmente el plan (patrón del test de conexiones)
    await db.organization.update({ where: { id: 'org-a' }, data: { plan: 'growth' } })
    await db.whatsAppConnectionEvent.deleteMany()
    await db.whatsAppConnection.deleteMany()
    await db.channelConnectionEvent.deleteMany()
    await db.channelConnection.deleteMany()
  })

  afterEach(async () => {
    await db.organization.update({ where: { id: 'org-a' }, data: { plan: 'pilot' } })
    await db.user.update({ where: { id: FIX.userB.id }, data: { role: 'member' } })
  })

  it('devuelve 401 sin sesión', async () => {
    const res = await eventsGet(req('/api/whatsapp/connections/events'))
    expect(res.status).toBe(401)
  })

  it('lista los eventos de TODAS las conexiones de la organización con el número asociado', async () => {
    const { createConnection } = await import('@/lib/wa-connections')
    const c1 = await createConnection({
      orgId: FIX.orgA.id,
      phoneNumberId: '900001000001',
      accessToken: 'EAAG-ev-test-1-0123456789abcdef',
      verifyAgainstGraph: false,
    })
    const c2 = await createConnection({
      orgId: FIX.orgA.id,
      phoneNumberId: '900001000002',
      accessToken: 'EAAG-ev-test-2-0123456789abcdef',
      verifyAgainstGraph: false,
    })
    expect(c1.ok && c2.ok, JSON.stringify([c1, c2])).toBe(true)

    // Evento huérfano de org (connectionId null: auditEvent lo permite)
    await db.whatsAppConnectionEvent.create({
      data: { organizationId: FIX.orgA.id, connectionId: null, type: 'error', detail: 'webhook sin conexión' },
    })

    const res = await eventsGet(req('/api/whatsapp/connections/events?take=20', { token: tokenA() }))
    expect(res.status).toBe(200)
    const { events } = (await jsonBody(res)) as {
      events: Array<{ id: string; type: string; connectionId: string | null; connection?: { phoneNumberId?: string } | null }>
    }
    expect(events.length).toBeGreaterThanOrEqual(3)
    const withConn = events.filter((e) => e.connectionId !== null)
    expect(new Set(withConn.map((e) => e.connectionId)).size).toBe(2)
    // Cada evento con conexión trae el número para etiquetar en la UI
    expect(withConn.every((e) => e.connection && typeof e.connection.phoneNumberId === 'string')).toBe(true)
    // Orden descendente por createdAt (los huérfanos al principio aquí)
    const dates = events.map((e) => new Date((e as unknown as { createdAt: string }).createdAt).getTime())
    expect([...dates].sort((a, b) => b - a)).toEqual(dates)
  })

  it('aislamiento: org B jamás ve eventos de org A (decisión #8)', async () => {
    const { createConnection } = await import('@/lib/wa-connections')
    await createConnection({
      orgId: FIX.orgA.id,
      phoneNumberId: '900001000009',
      accessToken: 'EAAG-ev-a-0123456789abcdef',
      verifyAgainstGraph: false,
    })

    const resB = await eventsGet(req('/api/whatsapp/connections/events', { token: tokenB() }))
    expect(resB.status).toBe(200)
    const { events: eventsB } = (await jsonBody(resB)) as { events: unknown[] }
    expect(eventsB).toEqual([])
  })

  it('respeta el tope take (1–50) y descarta valores inválidos', async () => {
    const { createConnection } = await import('@/lib/wa-connections')
    const conn = await createConnection({
      orgId: FIX.orgA.id,
      phoneNumberId: '900001000003',
      accessToken: 'EAAG-ev-take-0123456789abcdef',
      verifyAgainstGraph: false,
    })
    expect(conn.ok).toBe(true)
    await db.whatsAppConnectionEvent.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        organizationId: FIX.orgA.id,
        connectionId: conn.ok ? (conn as { connectionId: string }).connectionId : undefined,
        type: 'verified',
        detail: `run ${i}`,
      })),
    })

    const resTake2 = await eventsGet(req('/api/whatsapp/connections/events?take=2', { token: tokenA() }))
    const { events: ev2 } = (await jsonBody(resTake2)) as { events: unknown[] }
    expect(ev2.length).toBe(2)

    // take hostil → clamp al rango válido, no error
    const resBad = await eventsGet(req('/api/whatsapp/connections/events?take=9999', { token: tokenA() }))
    expect(resBad.status).toBe(200)
    const { events: evBad } = (await jsonBody(resBad)) as { events: unknown[] }
    expect(evBad.length).toBeLessThanOrEqual(50)

    const resNaN = await eventsGet(req('/api/whatsapp/connections/events?take=abc', { token: tokenA() }))
    expect(resNaN.status).toBe(200)
  })

  it('un owner de otra org con token manipulado no ve lo ajeno (token B vs data A)', async () => {
    // El rol del JWT debe reflejar la BD (contrato de auth del proyecto)
    await db.user.update({ where: { id: FIX.userB.id }, data: { role: 'owner' } })
    await db.whatsAppConnectionEvent.create({
      data: { organizationId: FIX.orgA.id, type: 'connected', detail: 'org-a' },
    })
    const resB = await eventsGet(req('/api/whatsapp/connections/events', { token: tokenFor({ ...FIX.userB, role: 'owner' }) }))
    const { events } = (await jsonBody(resB)) as { events: Array<{ detail?: string }> }
    expect(events.every((e) => e.detail !== 'org-a')).toBe(true)
  })
})
