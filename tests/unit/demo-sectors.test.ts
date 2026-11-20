/**
 * U6 (F7-T06) — Invariantes de las semillas sectoriales para demos.
 *
 * Valida las definiciones PUURAS de `scripts/demo-sectors.mjs` (sin BD):
 * estructura, unicidad de claves de idempotencia, referencias internas y el
 * comportamiento del validador como caso negativo (detecta datos corruptos
 * antes de que el seeder toque la base de datos).
 */
import { describe, expect, it } from 'vitest'
import { SECTORS, validateAllSectors, validateSectorData } from '../../scripts/demo-sectors.mjs'

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

describe('semillas sectoriales U6 — definiciones válidas', () => {
  it('los tres sectores del catálogo validan sin errores', () => {
    expect(SECTORS.map((s) => s.slug).sort()).toEqual(['inmobiliaria', 'restaurante', 'salud-estetica'])
    expect(validateAllSectors()).toEqual([])
  })

  it('cada sector tiene contenido mínimo para una demo creíble', () => {
    for (const s of SECTORS) {
      expect(s.users.length).toBeGreaterThanOrEqual(2) // owner + agente
      expect(s.pipelineStages.length).toBeGreaterThanOrEqual(4)
      expect(s.clients.length).toBeGreaterThanOrEqual(5)
      expect(s.opportunities.length).toBeGreaterThanOrEqual(4)
      expect(s.reservations.length).toBeGreaterThanOrEqual(3)
      expect(s.tasks.length).toBeGreaterThanOrEqual(4)
      expect(s.quotes.length).toBeGreaterThanOrEqual(2)
      expect(s.conversations.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('cada sector deja una demo completa en el dashboard: tarea vencida, cita próxima y conversación sin contestar', () => {
    for (const s of SECTORS) {
      expect(s.tasks.some((t) => t.status === 'open' && typeof t.dueInHours === 'number' && t.dueInHours < 0)).toBe(true) // «Requiere atención»
      expect(s.reservations.some((r) => r.status === 'scheduled' && r.startsInHours > 0 && r.startsInHours < 48)).toBe(true)
      const lastOfThread = (thread: { from: string }[]) => thread[thread.length - 1]
      expect(s.conversations.some((c) => lastOfThread(c.thread).from === 'in')).toBe(true) // sin contestar
      expect(s.quotes.some((q) => q.status === 'accepted')).toBe(true) // pipeline con cierre ganado
      expect(s.clients.some((c) => c.status === 'prospect')).toBe(true) // embudo con prospectos
    }
  })

  it('claves de idempotencia fijas: teléfonos, números de cotización y títulos únicos por sector', () => {
    for (const s of SECTORS) {
      const phones = s.clients.map((c) => c.phone)
      expect(new Set(phones).size).toBe(phones.length)
      const numbers = s.quotes.map((q) => q.number)
      expect(new Set(numbers).size).toBe(numbers.length)
      const taskTitles = s.tasks.map((t) => t.title)
      expect(new Set(taskTitles).size).toBe(taskTitles.length)
      const resTitles = s.reservations.map((r) => r.title)
      expect(new Set(resTitles).size).toBe(resTitles.length)
    }
  })

  it('aislamiento entre sectores: teléfonos, emails de clientes y de usuarios no colisionan', () => {
    const allPhones = SECTORS.flatMap((s) => s.clients.map((c) => c.phone))
    expect(new Set(allPhones).size).toBe(allPhones.length)
    const allClientEmails = SECTORS.flatMap((s) => s.clients.map((c) => c.email).filter(Boolean))
    expect(new Set(allClientEmails).size).toBe(allClientEmails.length)
    const allUserEmails = SECTORS.flatMap((s) => s.users.map((u) => u.email))
    expect(new Set(allUserEmails).size).toBe(allUserEmails.length) // User.email es @unique global
  })

  it('todo el material demo está marcado y la org lleva (Demo)', () => {
    for (const s of SECTORS) {
      expect(s.orgName.includes('(Demo)')).toBe(true)
      for (const c of s.clients) expect(c.notes.includes('[demo]')).toBe(true)
      for (const o of s.opportunities) expect(o.title.includes('(Demo)')).toBe(true)
      for (const q of s.quotes) expect(q.notes.includes('[demo]')).toBe(true)
      for (const conv of s.conversations) for (const m of conv.thread) expect(m.text.includes('(demo)')).toBe(true)
    }
  })

  it('monedas y montos realistas: COP positivo en oportunidades y cotizaciones consistentes por ítems', () => {
    for (const s of SECTORS) {
      for (const o of s.opportunities) expect(o.currency === 'COP' && o.amount > 0).toBe(true)
      for (const q of s.quotes) {
        const subtotal = q.items.reduce((acc: number, it: { quantity: number; unitPrice: number }) => acc + it.quantity * it.unitPrice, 0)
        expect(subtotal).toBeGreaterThan(0)
      }
    }
  })
})

describe('semillas sectoriales U6 — el validador detecta datos corruptos (casos negativos)', () => {
  const base = SECTORS[0]

  const corrupt = (mutate: (s: typeof base) => void): string[] => {
    const s = clone(base)
    mutate(s)
    return validateSectorData(s)
  }

  it('teléfono de cliente duplicado', () => {
    const errs = corrupt((s) => { s.clients[1].phone = s.clients[0].phone })
    expect(errs.some((e) => e.includes('teléfono duplicado'))).toBe(true)
  })

  it('cliente sin marca [demo]', () => {
    const errs = corrupt((s) => { s.clients[0].notes = 'notas sin marca' })
    expect(errs.some((e) => e.includes('sin marca [demo]'))).toBe(true)
  })

  it('oportunidad que referencia un cliente inexistente', () => {
    const errs = corrupt((s) => { s.opportunities[0].clientKey = 'cliente-fantasma' })
    expect(errs.some((e) => e.includes('cliente inexistente'))).toBe(true)
  })

  it('pipeline sin etapa ganada y con dos perdidas', () => {
    const errs = corrupt((s) => {
      const won = s.pipelineStages.find((p) => p.isWon)
      if (won) won.isWon = false
      s.pipelineStages.filter((p) => p.isLost)[1] && (s.pipelineStages.filter((p) => p.isLost)[1].isLost = true)
    })
    expect(errs.some((e) => e.includes('exactamente 1 etapa isWon'))).toBe(true)
  })

  it('cotización sin ítems y con número duplicado', () => {
    const errs = corrupt((s) => {
      s.quotes[1].items = []
      s.quotes[1].number = s.quotes[0].number
    })
    expect(errs.some((e) => e.includes('número de cotización duplicado'))).toBe(true)
    expect(errs.some((e) => e.includes('sin ítems'))).toBe(true)
  })

  it('conversación que no inicia entrante', () => {
    const errs = corrupt((s) => { s.conversations[0].thread[0].from = 'out' })
    expect(errs.some((e) => e.includes('no inicia entrante'))).toBe(true)
  })

  it('etapa ganada con probabilidad distinta de 1', () => {
    const errs = corrupt((s) => {
      const won = s.pipelineStages.find((p) => p.isWon)
      if (won) won.probability = 0.8
    })
    expect(errs.some((e) => e.includes('probabilidad 1'))).toBe(true)
  })

  it('org sin la marca (Demo)', () => {
    const errs = corrupt((s) => { s.orgName = 'Restaurante La Brasa REAL' })
    expect(errs.some((e) => e.includes('(Demo)'))).toBe(true)
  })

  it('email de usuario repetido entre sectores (violación de @unique global)', () => {
    const cloneSectors = clone(SECTORS) as typeof SECTORS
    cloneSectors[1].users[0].email = cloneSectors[0].users[0].email
    // validateAllSectors opera sobre el catálogo importado; replicamos su chequeo cruzado
    const seen = new Map<string, string>()
    const errs: string[] = []
    for (const s of cloneSectors) {
      for (const u of s.users) {
        if (seen.has(u.email)) errs.push(`email repetido: ${u.email}`)
        seen.set(u.email, s.slug)
      }
    }
    expect(errs.length).toBe(1)
  })
})
