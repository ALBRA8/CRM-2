/**
 * (F4) agenda-vistas.ts — modelo puro para las vistas semana y día de la
 * agenda. Sin React ni acceso a datos: la página de calendario le pasa las
 * reservas ya serializadas por la API y este módulo calcula la estructura de
 * la vista (días de la semana, agrupación por día, huecos libres).
 *
 * Decisiones (documentadas, reversibles):
 *  - La semana empieza el LUNES (convención del calendario existente,
 *    `weekStartsOn: 1`).
 *  - Las reservas CANCELADAS no bloquean la agenda: no ocupan hueco.
 *  - Los huecos libres se calculan dentro de la ventana operativa del día
 *    (por defecto 08:00–20:00) y solo se ofrecen los de `minMinutes`
 *    (por defecto 30) para no generar ruido.
 *  - Toda la aritmética es en hora LOCAL (el usuario agenda en su zona;
 *    la API guarda ISO y el navegador la presenta local).
 */

export interface AgendaItem {
  id: string
  title: string
  /** ISO completo o 'yyyy-MM-dd'; se normaliza a Date local. */
  date: string | Date
  duration: number
  status: string
  client?: { name?: string } | null
  location?: string | null
}

export interface FreeGap {
  /** Día del hueco, formato 'yyyy-MM-dd'. */
  day: string
  /** Minutos desde medianoche local. */
  startMinutes: number
  endMinutes: number
  minutes: number
}

export interface GapInput {
  /** Minutos desde medianoche. */
  start: number
  end: number
  status?: string
}

export interface GapOptions {
  /** Inicio de la ventana operativa en minutos (por defecto 480 = 08:00). */
  dayStart?: number
  /** Fin de la ventana operativa en minutos (por defecto 1200 = 20:00). */
  dayEnd?: number
  /** Duración mínima para ofrecer un hueco (por defecto 30). */
  minMinutes?: number
}

const DAY_MS = 86_400_000

export const DEFAULT_GAP_OPTIONS: Required<GapOptions> = {
  dayStart: 8 * 60,
  dayEnd: 20 * 60,
  minMinutes: 30,
}

/** Normaliza cualquier entrada a Date (local). */
export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

/** Clave de día local 'yyyy-MM-dd' (sin desfases de zona: usa getFullYear/Month/Date). */
export function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Minutos desde medianoche local. */
export function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Los 7 días (lunes→domingo) de la semana que contiene `anchor`.
 * Determinista en cualquier zona horaria: se ancla a medianoche local.
 */
export function agendaWeekDays(anchor: Date): Date[] {
  const base = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
  // getDay(): 0=domingo … 6=sábado → desfase para que lunes sea el día 1.
  const offsetToMonday = (base.getDay() + 6) % 7
  const monday = new Date(base.getTime() - offsetToMonday * DAY_MS)
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * DAY_MS))
}

/**
 * Agrupa reservas por día local y las ordena por hora de inicio dentro de
 * cada día. No muta la entrada.
 */
export function groupByDay<T extends AgendaItem>(items: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = dayKey(toDate(item.date))
    const bucket = map.get(key)
    if (bucket) bucket.push(item)
    else map.set(key, [item])
  }
  for (const bucket of map.values()) {
    bucket.sort(
      (a, b) => toDate(a.date).getTime() - toDate(b.date).getTime(),
    )
  }
  return map
}

/**
 * Huecos libres de un día: intervalos dentro de la ventana operativa que
 * no queda cubierta por reservas activas. Las canceladas no bloquean.
 * Los solapes se tratan como una sola ocupación (unión de intervalos).
 */
export function computeFreeGaps(
  items: readonly GapInput[],
  options: GapOptions = {},
): Array<Omit<FreeGap, 'day'>> {
  const opts = { ...DEFAULT_GAP_OPTIONS, ...options }
  const busy = items
    .filter((i) => i.status !== 'cancelled')
    .map((i) => ({
      start: Math.max(i.start, opts.dayStart),
      end: Math.min(i.end, opts.dayEnd),
    }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start)

  const merged: Array<{ start: number; end: number }> = []
  for (const b of busy) {
    const last = merged[merged.length - 1]
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end)
    else merged.push({ ...b })
  }

  const gaps: Array<{ startMinutes: number; endMinutes: number; minutes: number }> = []
  let cursor = opts.dayStart
  for (const b of merged) {
    if (b.start - cursor >= opts.minMinutes) {
      gaps.push({ startMinutes: cursor, endMinutes: b.start, minutes: b.start - cursor })
    }
    cursor = Math.max(cursor, b.end)
  }
  if (opts.dayEnd - cursor >= opts.minMinutes) {
    gaps.push({ startMinutes: cursor, endMinutes: opts.dayEnd, minutes: opts.dayEnd - cursor })
  }
  return gaps
}

/** '08:30' a partir de minutos desde medianoche. */
export function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Etiqueta legible del rango de la semana: «18 nov – 24 nov 2026».
 */
export function weekRangeLabel(days: readonly Date[]): string {
  if (days.length === 0) return ''
  const fmt = (d: Date) =>
    `${d.getDate()} ${d.toLocaleString('es', { month: 'short' }).replace('.', '')}`
  const first = days[0]
  const last = days[days.length - 1]
  const year = last.getFullYear() !== first.getFullYear() ? ` ${last.getFullYear()}` : ` ${first.getFullYear()}`
  return `${fmt(first)} – ${fmt(last)}${year}`
}
