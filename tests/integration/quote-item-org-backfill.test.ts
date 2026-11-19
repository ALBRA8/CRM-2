import { describe, expect, it, beforeEach } from 'vitest'
import { POST as quotesPOST } from '@/app/api/quotes/route'
import { db } from '@/lib/db'
import { FIX, jsonBody, req, tokenFor } from '../helpers'

/**
 * Cierre integral (bloque A+B): backfill de `QuoteItem.organizationId`.
 *
 * Antes de la migración por-organización existían QuoteItem con organizationId
 * NULL (legado). La creación vía API siempre lo establece hoy
 * (quoteItemRows(items, auth.orgId)), así que el hueco solo existe en datos
 * antiguos. La migración `10_quoteitem_org_backfill` repara esos datos tomando
 * el organizationId del Quote padre.
 *
 * Esta prueba:
 *  1. Reproduce el estado legado (inserta un item con organizationId NULL).
 *  2. Ejecuta EXACTAMENTE el SQL de la migración (misma sentencia, misma fuente
 *     de verdad que prisma/migrations/10_quoteitem_org_backfill/migration.sql).
 *  3. Verifica que el item hereda la organización de su Quote y que nada más
 *     cambia; y que el SQL es idempotente (segunda pasada = cero cambios).
 */

const A = () => tokenFor(FIX.userA)

// Copia literal del SQL de la migración (fuente de verdad única al revisar).
const BACKFILL_SQL = `
UPDATE "QuoteItem"
SET "organizationId" = (
  SELECT q."organizationId" FROM "Quote" q WHERE q."id" = "QuoteItem"."quoteId"
)
WHERE "organizationId" IS NULL
  AND EXISTS (SELECT 1 FROM "Quote" q WHERE q."id" = "QuoteItem"."quoteId");
`

async function crearQuote(orgId: 'a' | 'b'): Promise<string> {
  const clientId = orgId === 'a' ? FIX.clientA1.id : FIX.clientB1.id
  const token = orgId === 'a' ? A() : tokenFor(FIX.userB)
  const r = await quotesPOST(req('/api/quotes', { method: 'POST', token, body: { clientId, items: [{ description: 'item cierre', quantity: 1, unitPrice: 50 }] } }))
  expect(r.status).toBe(201)
  const body = (await jsonBody(r)) as { quote: { id: string } }
  return body.quote.id
}

beforeEach(async () => {
  await db.quoteItem.deleteMany({ where: { OR: [{ quote: { organizationId: FIX.orgA.id } }, { quote: { organizationId: FIX.orgB.id } }] } })
  await db.quote.deleteMany({ where: { OR: [{ organizationId: FIX.orgA.id }, { organizationId: FIX.orgB.id }] } })
})

describe('backfill organizationId de QuoteItem (legado NULL)', () => {
  it('repara items legados con la organización de su Quote padre', async () => {
    const quoteA = await crearQuote('a')
    const quoteB = await crearQuote('b')

    // Estado legado: items sin organización (como los pre-migración)
    const legacyA = await db.quoteItem.create({ data: { quoteId: quoteA, description: 'legacy sin org (org A)', quantity: 1, unitPrice: 1, subtotal: 1, position: 0 } })
    const legacyB = await db.quoteItem.create({ data: { quoteId: quoteB, description: 'legacy sin org (org B)', quantity: 2, unitPrice: 2, subtotal: 4, position: 0 } })
    expect(legacyA.organizationId).toBeNull()
    expect(legacyB.organizationId).toBeNull()

    await db.$executeRawUnsafe(BACKFILL_SQL)

    const fixedA = await db.quoteItem.findUnique({ where: { id: legacyA.id } })
    const fixedB = await db.quoteItem.findUnique({ where: { id: legacyB.id } })
    const parentA = await db.quote.findUnique({ where: { id: quoteA } })
    const parentB = await db.quote.findUnique({ where: { id: quoteB } })
    expect(fixedA?.organizationId).toBe(parentA?.organizationId)
    expect(fixedB?.organizationId).toBe(parentB?.organizationId)
    // El resto de datos no cambia
    expect(fixedA?.description).toBe('legacy sin org (org A)')
    expect(fixedB?.quantity).toBe(2)
  })

  it('es idempotente y no altera items que ya tienen organización', async () => {
    const quoteA = await crearQuote('a')
    const r = await quotesPOST(req('/api/quotes', { method: 'POST', token: A(), body: { clientId: FIX.clientA1.id, items: [{ description: 'item con org', quantity: 3, unitPrice: 10 }] } }))
    expect(r.status).toBe(201)
    const quoteConItems = await db.quote.findUnique({ where: { id: quoteA }, include: { items: true } })
    const itemsConOrg = quoteConItems?.items ?? []
    expect(itemsConOrg.length).toBeGreaterThan(0)
    const antes = itemsConOrg.map((i) => ({ id: i.id, org: i.organizationId }))

    await db.$executeRawUnsafe(BACKFILL_SQL)
    await db.$executeRawUnsafe(BACKFILL_SQL) // doble pasada: sin efecto

    const despues = await db.quoteItem.findMany({ where: { quoteId: quoteA }, orderBy: { position: 'asc' } })
    expect(despues.map((i) => ({ id: i.id, org: i.organizationId }))).toEqual(antes)
    for (const i of despues) expect(i.organizationId).toBe(FIX.orgA.id)
  })

  it('tras el backfill no queda ningún QuoteItem con organizationId NULL', async () => {
    const quoteA = await crearQuote('a')
    await db.quoteItem.create({ data: { quoteId: quoteA, description: 'legacy a reparar', quantity: 1, unitPrice: 1, subtotal: 1, position: 0 } })
    await db.$executeRawUnsafe(BACKFILL_SQL)
    const nulos = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*) as n FROM "QuoteItem" WHERE "organizationId" IS NULL`)
    expect(Number(nulos[0]?.n ?? 0)).toBe(0)
  })
})
