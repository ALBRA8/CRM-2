import { describe, expect, it, beforeEach } from 'vitest'
import { GET as opportunitiesGET } from '@/app/api/opportunities/route'
import { GET as opportunityGET } from '@/app/api/opportunities/[id]/route'
import { GET as pipelineGET } from '@/app/api/pipeline/route'
import { GET as quotesGET } from '@/app/api/quotes/route'
import { GET as quoteGET } from '@/app/api/quotes/[id]/route'
import { GET as reservationsGET } from '@/app/api/reservations/route'
import { GET as exportCSVGET } from '@/app/api/export/csv/route'
import { db } from '@/lib/db'
import { FIX, jsonBody, req, routeParams, tokenFor } from '../helpers'

/**
 * FASE CORRECTIVA — REFERENCIAS HISTÓRICAS ENTRE ORGANIZACIONES (port de
 * fix/fase-correctiva-final, integrado 2026-11-20 con la lib B1 de la maestra).
 *
 * Datos históricos inconsistentes (NO producibles por la API: p. ej. una
 * oportunidad antigua cuyo clientId apunta a un cliente de OTRA organización)
 * no deben filtrar datos personales de la otra org por las lecturas auxiliares
 * (nombre/email/teléfono incluidos con la relación `client`). La lib
 * stripForeignClients valida contra la allowlist de la org y neutraliza la
 * referencia foránea: el cliente ajeno desaparece del resultado; el dato propio
 * (la fila oportunidad/cotización/reserva de la propia org) se conserva.
 */

const owner = () => tokenFor({ ...FIX.userA, role: 'owner' })

let historicalOppId = ''

beforeEach(async () => {
  // Limpia y crea la referencia histórica inconsistente directamente en BD
  await db.opportunity.deleteMany({ where: { organizationId: FIX.orgA.id, title: { startsWith: 'OPP-HISTORICA-' } } })
  const opp = await db.opportunity.create({
    data: {
      organizationId: FIX.orgA.id,
      title: 'OPP-HISTORICA-CRUZADA',
      clientId: FIX.clientB1.id, // cliente de la ORG B — inconsistencia histórica
      amount: 100,
      probability: 50,
      status: 'open',
    },
  })
  historicalOppId = opp.id

  // Y una oportunidad SANA (cliente de la propia org A) para verificar que no
  // se sobre-bloquea el caso legítimo.
  await db.opportunity.create({
    data: {
      organizationId: FIX.orgA.id,
      title: 'OPP-HISTORICA-SANA',
      clientId: FIX.clientA1.id,
      amount: 200,
      probability: 50,
      status: 'open',
    },
  })
})

describe('referencias históricas inconsistentes: cero filtración cruzada', () => {
  it('el listado de oportunidades NO expone PII del cliente de otra org', async () => {
    const res = await opportunitiesGET(req('/api/opportunities', { method: 'GET', token: owner() }))
    expect(res.status).toBe(200)
    const body = (await jsonBody(res)) as { opportunities: Array<{ title: string; client: { name: string } | null }> }
    const raw = JSON.stringify(body)
    expect(raw).not.toContain(FIX.clientB1.name)
    expect(raw).not.toContain(String(FIX.clientB1.email))

    // La oportunidad histórica SÍ aparece (es de la org A), pero sin el cliente ajeno
    const opp = body.opportunities.find((o: { title: string }) => o.title === 'OPP-HISTORICA-CRUZADA')
    expect(opp).toBeTruthy()
    expect(opp!.client).toBeNull()
    // El caso sano conserva SU cliente completo
    const sane = body.opportunities.find((o: { title: string }) => o.title === 'OPP-HISTORICA-SANA')
    expect(sane).toBeTruthy()
    expect(sane!.client).toBeTruthy()
    expect(sane!.client!.name).toBe(FIX.clientA1.name)
  })

  it('el detalle de la oportunidad histórica NO expone PII del cliente ajeno', async () => {
    const res = await opportunityGET(req(`/api/opportunities/${historicalOppId}`, { method: 'GET', token: owner() }), routeParams(historicalOppId))
    expect(res.status).toBe(200)
    const raw = JSON.stringify(await jsonBody(res))
    expect(raw).not.toContain(FIX.clientB1.name)
    expect(raw).not.toContain(String(FIX.clientB1.email))
  })

  it('el kanban (pipeline) tampoco filtra el cliente ajeno', async () => {
    const res = await pipelineGET(req('/api/pipeline', { method: 'GET', token: owner() }))
    expect(res.status).toBe(200)
    const raw = JSON.stringify(await jsonBody(res))
    expect(raw).not.toContain(FIX.clientB1.name)
    expect(raw).not.toContain(String(FIX.clientB1.email))
  })

  it('el listado de cotizaciones tampoco filtra el cliente ajeno por la relación incluida', async () => {
    // Referencia histórica en quotes: cotización de org A con cliente de org B
    await db.quote.deleteMany({ where: { organizationId: FIX.orgA.id, number: 'COT-HIST-CRUZADA' } })
    const q = await db.quote.create({
      data: { organizationId: FIX.orgA.id, number: 'COT-HIST-CRUZADA', clientId: FIX.clientB1.id, subtotal: 10, tax: 0, total: 10 },
    })
    const res = await quotesGET(req('/api/quotes', { method: 'GET', token: owner() }))
    expect(res.status).toBe(200)
    const raw = JSON.stringify(await jsonBody(res))
    expect(raw).not.toContain(FIX.clientB1.name)
    expect(raw).not.toContain(String(FIX.clientB1.email))

    // El detalle de esa cotización también queda neutralizado
    const detail = await quoteGET(req(`/api/quotes/${q.id}`, { method: 'GET', token: owner() }), routeParams(q.id))
    expect(detail.status).toBe(200)
    const detailRaw = JSON.stringify(await jsonBody(detail))
    expect(detailRaw).not.toContain(FIX.clientB1.name)
    expect(detailRaw).not.toContain(String(FIX.clientB1.email))
  })

  it('el listado de reservas tampoco filtra el cliente ajeno', async () => {
    await db.reservation.deleteMany({ where: { organizationId: FIX.orgA.id, title: 'RES-HIST-CRUZADA' } })
    await db.reservation.create({
      data: {
        organizationId: FIX.orgA.id,
        title: 'RES-HIST-CRUZADA',
        clientId: FIX.clientB1.id,
        startsAt: new Date(Date.now() + 86_400_000),
        status: 'scheduled',
      },
    })
    const res = await reservationsGET(req('/api/reservations', { method: 'GET', token: owner() }))
    expect(res.status).toBe(200)
    const raw = JSON.stringify(await jsonBody(res))
    expect(raw).not.toContain(FIX.clientB1.name)
    expect(raw).not.toContain(String(FIX.clientB1.email))
  })

  it('el export CSV de cotizaciones no exporta PII del cliente ajeno', async () => {
    await db.quote.deleteMany({ where: { organizationId: FIX.orgA.id, number: 'COT-HIST-CSV' } })
    await db.quote.create({
      data: { organizationId: FIX.orgA.id, number: 'COT-HIST-CSV', clientId: FIX.clientB1.id, subtotal: 5, tax: 0, total: 5 },
    })
    const res = await exportCSVGET(req('/api/export/csv?type=quotes', { method: 'GET', token: owner() }))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain(FIX.clientB1.name)
    expect(text).not.toContain(String(FIX.clientB1.email))
  })
})
