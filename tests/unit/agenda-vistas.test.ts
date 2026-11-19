/**
 * (F4) agenda-vistas.test.ts — modelo puro de las vistas semana/día.
 *
 * Cubre:
 *  - semana lunes→domingo que contiene el ancla (incluye bordes: lunes,
 *    domingo, domingo→lunes cambia de semana),
 *  - claves de día locales sin desfase de zona,
 *  - minutos desde medianoche,
 *  - agrupación por día con orden por hora e inmutabilidad de la entrada,
 *  - huecos libres: día vacío, hueco antes/entre/después, canceladas no
 *    bloquean, solapes se unen, recorte a la ventana operativa, mínimo
 *    de minutos y etiqueta HH:mm.
 */
import { describe, it, expect } from 'vitest'
import {
  agendaWeekDays,
  computeFreeGaps,
  dayKey,
  groupByDay,
  minutesFromMidnight,
  minutesToLabel,
  weekRangeLabel,
} from '@/lib/agenda-vistas'

/** Martes 17 nov 2026, 09:30 local. */
const TUE = new Date(2026, 10, 17, 9, 30, 0)
/** Lunes 16 nov 2026. */
const MON = new Date(2026, 10, 16, 14, 0, 0)
/** Domingo 22 nov 2026. */
const SUN = new Date(2026, 10, 22, 20, 0, 0)

function res(date: Date, overrides: Partial<{ title: string; duration: number; status: string }> = {}) {
  return {
    id: `r-${date.getTime()}`,
    title: overrides.title ?? 'Cita',
    date,
    duration: overrides.duration ?? 60,
    status: overrides.status ?? 'confirmed',
  }
}

describe('agendaWeekDays', () => {
  it('devuelve 7 días lunes→domingo que contienen el ancla', () => {
    const days = agendaWeekDays(TUE)
    expect(days).toHaveLength(7)
    expect(days[0].getDay()).toBe(1)
    expect(days[6].getDay()).toBe(0)
    expect(days.some((d) => dayKey(d) === dayKey(TUE))).toBe(true)
  })

  it('el domingo cierra su semana: el lunes siguiente abre otra distinta', () => {
    // El domingo 22 nov es el ÚLTIMO día de la semana (lunes-inicio);
    // el lunes 23 nov abre la semana siguiente.
    const mon2 = new Date(2026, 10, 23, 9, 0, 0)
    const sunWeek = agendaWeekDays(SUN).map(dayKey)
    const nextWeek = agendaWeekDays(mon2).map(dayKey)
    expect(sunWeek).not.toEqual(nextWeek)
    expect(sunWeek).toContain(dayKey(SUN))
    expect(nextWeek).toContain(dayKey(mon2))
  })

  it('el lunes es el primer día de su propia semana', () => {
    const days = agendaWeekDays(MON)
    expect(days[0]).toEqual(new Date(2026, 10, 16))
    expect(days[6]).toEqual(new Date(2026, 10, 22))
  })
})

describe('dayKey / minutesFromMidnight', () => {
  it('clave de día con ceros a la izquierda y sin desfase horario', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(dayKey(new Date(2026, 10, 17))).toBe('2026-11-17')
  })

  it('la clave de día no cambia a medianoche ni tardes (misma fecha local)', () => {
    expect(dayKey(new Date(2026, 10, 17, 0, 5))).toBe(dayKey(new Date(2026, 10, 17, 23, 55)))
  })

  it('minutos desde medianoche', () => {
    expect(minutesFromMidnight(new Date(2026, 10, 17, 0, 0))).toBe(0)
    expect(minutesFromMidnight(new Date(2026, 10, 17, 9, 30))).toBe(570)
    expect(minutesFromMidnight(new Date(2026, 10, 17, 23, 59))).toBe(1439)
  })
})

describe('groupByDay', () => {
  const d1 = new Date(2026, 10, 17, 10, 0)
  const d2 = new Date(2026, 10, 17, 9, 0)
  const d3 = new Date(2026, 10, 18, 8, 0)
  const items = [res(d1, { title: 'tarde' }), res(d2, { title: 'mañana' }), res(d3, { title: 'otro día' })]

  it('agrupa por día y ordena por hora de inicio', () => {
    const map = groupByDay(items)
    expect(map.size).toBe(2)
    const day17 = map.get('2026-11-17')!
    expect(day17.map((r) => r.title)).toEqual(['mañana', 'tarde'])
    expect(map.get('2026-11-18')!.map((r) => r.title)).toEqual(['otro día'])
  })

  it('no muta la entrada y acepta ISO en string', () => {
    const input = [...items]
    const map = groupByDay(items)
    expect(input).toHaveLength(3)
    expect(map.get('2026-11-17')).toHaveLength(2)
    const fromIso = groupByDay([{ id: 'x', title: 'iso', date: '2026-11-17T10:00:00', duration: 60, status: 'confirmed' }])
    expect(fromIso.get('2026-11-17')).toHaveLength(1)
  })
})

describe('computeFreeGaps', () => {
  const W = { dayStart: 8 * 60, dayEnd: 20 * 60 } // 08:00–20:00

  it('día sin reservas → un único hueco de toda la ventana', () => {
    const gaps = computeFreeGaps([], W)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].startMinutes).toBe(480)
    expect(gaps[0].endMinutes).toBe(1200)
    expect(gaps[0].minutes).toBe(720)
  })

  it('hueco antes, entre y después de dos reservas', () => {
    const gaps = computeFreeGaps(
      [
        { start: 10 * 60, end: 11 * 60 },
        { start: 14 * 60, end: 15 * 60 },
      ],
      W,
    )
    expect(gaps.map((g) => [g.startMinutes, g.endMinutes])).toEqual([
      [480, 600],
      [660, 840],
      [900, 1200],
    ])
  })

  it('las canceladas no bloquean la agenda', () => {
    const gaps = computeFreeGaps([{ start: 10 * 60, end: 11 * 60, status: 'cancelled' }], W)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].startMinutes).toBe(480)
    expect(gaps[0].endMinutes).toBe(1200)
  })

  it('los solapes se unen en una sola ocupación', () => {
    const gaps = computeFreeGaps(
      [
        { start: 10 * 60, end: 12 * 60 },
        { start: 11 * 60, end: 13 * 60 },
      ],
      W,
    )
    expect(gaps.map((g) => [g.startMinutes, g.endMinutes])).toEqual([
      [480, 600],
      [780, 1200],
    ])
  })

  it('recorta reservas que se salen de la ventana operativa', () => {
    const gaps = computeFreeGaps(
      [{ start: 6 * 60, end: 9 * 60 }, { start: 19 * 60, end: 22 * 60 }],
      W,
    )
    expect(gaps.map((g) => [g.startMinutes, g.endMinutes])).toEqual([[540, 1140]])
  })

  it('filtra huecos menores al mínimo (30 por defecto)', () => {
    const gaps = computeFreeGaps(
      [
        { start: 9 * 60, end: 9 * 60 + 45 },
        { start: 10 * 60, end: 11 * 60 },
      ],
      W,
    )
    // El hueco de 15 min (09:45–10:00) no se ofrece.
    expect(gaps.map((g) => [g.startMinutes, g.endMinutes])).toEqual([[480, 540], [660, 1200]])
  })

  it('respeta un mínimo personalizado y sin huecos si el día está lleno', () => {
    const full = [{ start: 8 * 60, end: 20 * 60 }]
    expect(computeFreeGaps(full, W)).toEqual([])
    const tiny = computeFreeGaps(
      [{ start: 10 * 60, end: 10 * 60 + 40 }],
      { ...W, minMinutes: 120 },
    )
    // Con mínimo 120 min: mañana 08:00–10:00 (exactamente 120) y
    // tarde 10:40–20:00 (560).
    expect(tiny.map((g) => g.minutes)).toEqual([120, 560])
  })
})

describe('etiquetas', () => {
  it('minutesToLabel formatea HH:mm', () => {
    expect(minutesToLabel(0)).toBe('00:00')
    expect(minutesToLabel(570)).toBe('09:30')
    expect(minutesToLabel(1200)).toBe('20:00')
  })

  it('weekRangeLabel resume la semana en español', () => {
    const label = weekRangeLabel(agendaWeekDays(TUE))
    expect(label).toMatch(/16 nov – 22 nov 2026/)
  })

  it('weekRangeLabel vacío sin días', () => {
    expect(weekRangeLabel([])).toBe('')
  })
})
