import { describe, expect, it } from 'vitest'
import {
  buildAttentionMotives, sanitizeAttentionCounts, attentionSummary,
  type AttentionCounts,
} from '@/lib/dashboard-attention'

/**
 * F4/U2 (plan definitivo) — bloque "Requiere atención": composición de
 * motivos PURA (regla 9). Reglas verificadas:
 *  - sin motivos vacíos (count 0 no se muestra);
 *  - sin falsos positivos (tareas siempre 0 mientras el PR #6 no esté fusionado);
 *  - orden por prioridad operativa y tope configurable;
 *  - cada motivo lleva a una vista de la SPA en 1 clic.
 */

const FULL: AttentionCounts = {
  unreadMessages: 3,
  draftQuotes: 2,
  upcomingReservations: 5,
  overdueTasks: 0,
}

describe('buildAttentionMotives: reglas del bloque', () => {
  it('sin pendientes → lista vacía (sin motivos vacíos)', () => {
    expect(buildAttentionMotives({ unreadMessages: 0, draftQuotes: 0, upcomingReservations: 0, overdueTasks: 0 })).toEqual([])
  })

  it('con pendientes → solo los motivos con count > 0, en orden de prioridad', () => {
    const motives = buildAttentionMotives(FULL)
    expect(motives.map((m) => m.id)).toEqual(['unread_messages', 'draft_quotes', 'upcoming_reservations'])
    expect(motives[0].label).toBe('Mensajes sin contestar')
    expect(motives[0].count).toBe(3)
  })

  it('prioridad: mensajes sin contestar primero', () => {
    const motives = buildAttentionMotives({ ...FULL, unreadMessages: 1 })
    expect(motives[0].id).toBe('unread_messages')
  })

  it('tope max: capado sin error', () => {
    const motives = buildAttentionMotives(FULL, { max: 2 })
    expect(motives).toHaveLength(2)
    expect(motives.every((m) => m.count > 0)).toBe(true)
  })

  it('max 0 → nada (configurable hasta silenciar el bloque)', () => {
    expect(buildAttentionMotives(FULL, { max: 0 })).toEqual([])
  })

  it('max fuera de rango se normaliza (sin crash)', () => {
    expect(buildAttentionMotives(FULL, { max: 99 })).toHaveLength(3)
    expect(buildAttentionMotives(FULL, { max: -5 })).toEqual([])
  })

  it('cada motivo tiene view destino de la SPA para resolver en 1 clic', () => {
    const motives = buildAttentionMotives(FULL)
    for (const m of motives) {
      expect(typeof m.view).toBe('string')
      expect(m.view.length).toBeGreaterThan(0)
    }
    expect(motives.find((m) => m.id === 'unread_messages')?.view).toBe('inbox')
    expect(motives.find((m) => m.id === 'draft_quotes')?.view).toBe('quotes')
    expect(motives.find((m) => m.id === 'upcoming_reservations')?.view).toBe('calendar')
  })

  it('tareas vencidas no aparecen aunque alguien las mande > 0 solo si la API lo dice', () => {
    // La API hoy siempre envía overdueTasks: 0; el builder no inventa motivos
    const motives = buildAttentionMotives({ ...FULL, overdueTasks: 4 })
    expect(motives.map((m) => m.id)).toContain('overdue_tasks')
    // pero con 0 (el caso real actual) nunca aparece
    const real = buildAttentionMotives(FULL)
    expect(real.map((m) => m.id)).not.toContain('overdue_tasks')
  })
})

describe('sanitizeAttentionCounts: blindaje del input', () => {
  it('negativos, NaN y decimales se normalizan a enteros >= 0', () => {
    expect(sanitizeAttentionCounts({ unreadMessages: -3, draftQuotes: Number.NaN, upcomingReservations: 2.7, overdueTasks: 0 })).toEqual({
      unreadMessages: 0,
      draftQuotes: 0,
      upcomingReservations: 2,
      overdueTasks: 0,
    })
  })

  it('entrada no objeto → todo cero (sin crash)', () => {
    expect(sanitizeAttentionCounts(null)).toEqual({ unreadMessages: 0, draftQuotes: 0, upcomingReservations: 0, overdueTasks: 0 })
    expect(sanitizeAttentionCounts('basura')).toEqual({ unreadMessages: 0, draftQuotes: 0, upcomingReservations: 0, overdueTasks: 0 })
  })

  it('strings numéricos se aceptan', () => {
    expect(sanitizeAttentionCounts({ unreadMessages: '5' }).unreadMessages).toBe(5)
  })
})

describe('attentionSummary: resumen singular/plural', () => {
  it('sin motivos → texto de todo al día', () => {
    expect(attentionSummary([])).toContain('Todo al día')
  })

  it('un pendiente en un motivo → singular', () => {
    const motives = buildAttentionMotives({ unreadMessages: 1, draftQuotes: 0, upcomingReservations: 0, overdueTasks: 0 })
    expect(attentionSummary(motives)).toContain('1 pendiente en 1 motivo')
  })

  it('varios pendientes → plural', () => {
    const motives = buildAttentionMotives(FULL)
    expect(attentionSummary(motives)).toContain('10 pendientes en 3 motivos')
  })
})
