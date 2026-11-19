/**
 * dashboard-attention.ts — bloque "Requiere atención" del dashboard (F4/U2 del
 * plan definitivo CRM-ALBRA v2.0).
 *
 * Regla 9: la lógica de composición de motivos vive en un módulo PURO con
 * pruebas; el endpoint solo cuenta datos de la org y el componente solo
 * renderiza. Reglas del plan:
 *  - cada motivo lleva a la acción en 1 clic (view destino de la SPA);
 *  - SIN motivos vacíos ni falsos positivos evidentes (count 0 → no se muestra);
 *  - configurable: tope de motivos por pantalla (evitar ruido) y orden por
 *    prioridad operativa.
 *
 * Nota honesta: el motivo "tareas vencidas" está preparado pero SIEMPRE es 0
 * mientras el modelo Task del PR #6 no esté fusionado — por la regla anterior
 * no se muestra nunca, así que no hay falsos positivos.
 */

export interface AttentionCounts {
  /** Conversaciones con mensajes sin contestar (bandeja única, unread > 0). */
  unreadMessages: number
  /** Cotizaciones en borrador pendientes de enviar. */
  draftQuotes: number
  /** Citas programadas en los próximos 7 días (no canceladas). */
  upcomingReservations: number
  /** Tareas vencidas (siempre 0 hasta fusionar el módulo de tareas del PR #6). */
  overdueTasks: number
}

export type AttentionMotiveId =
  | 'unread_messages'
  | 'overdue_tasks'
  | 'draft_quotes'
  | 'upcoming_reservations'

export interface AttentionMotive {
  id: AttentionMotiveId
  label: string
  count: number
  description: string
  /** Vista SPA de destino (pathForView/setView) para resolver en 1 clic. */
  view: string
}

/** Prioridad operativa: lo que pierde clientes primero va arriba. */
const PRIORITY: AttentionMotiveId[] = [
  'unread_messages',
  'overdue_tasks',
  'draft_quotes',
  'upcoming_reservations',
]

/** Clave camelCase de cada motivo en AttentionCounts. */
const COUNT_KEY: Record<AttentionMotiveId, keyof AttentionCounts> = {
  unread_messages: 'unreadMessages',
  overdue_tasks: 'overdueTasks',
  draft_quotes: 'draftQuotes',
  upcoming_reservations: 'upcomingReservations',
}

const MOTIVE_META: Record<AttentionMotiveId, Omit<AttentionMotive, 'id' | 'count'>> = {
  unread_messages: {
    label: 'Mensajes sin contestar',
    description: 'Conversaciones en la bandeja con mensajes sin leer del cliente.',
    view: 'inbox',
  },
  overdue_tasks: {
    label: 'Tareas vencidas',
    description: 'Tareas del equipo pasadas de fecha que requieren acción.',
    view: 'dashboard',
  },
  draft_quotes: {
    label: 'Cotizaciones por enviar',
    description: 'Cotizaciones en borrador que aún no has enviado al cliente.',
    view: 'quotes',
  },
  upcoming_reservations: {
    label: 'Citas de los próximos 7 días',
    description: 'Citas programadas de la semana; confirma y prepara la agenda.',
    view: 'calendar',
  },
}

export interface BuildOptions {
  /** Tope de motivos mostrados (evitar ruido). Por defecto 4 (todos los tipos). */
  max?: number
}

/**
 * Construye la lista de motivos a partir de los conteos de la organización:
 * solo motivos con count > 0, ordenados por prioridad, capados a max.
 */
export function buildAttentionMotives(counts: AttentionCounts, opts: BuildOptions = {}): AttentionMotive[] {
  const max = Math.min(Math.max(opts.max ?? 4, 0), 4)
  return PRIORITY
    .map((id) => ({ id, count: counts[COUNT_KEY[id]] ?? 0, ...MOTIVE_META[id] }))
    .filter((m) => m.count > 0)
    .slice(0, max)
}

/** Valida los conteos crudos del cliente (el endpoint nunca envía negativos). */
export function sanitizeAttentionCounts(raw: unknown): AttentionCounts {
  const src = (raw ?? {}) as Record<string, unknown>
  const clean = (v: unknown): number => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  }
  return {
    unreadMessages: clean(src.unreadMessages),
    draftQuotes: clean(src.draftQuotes),
    upcomingReservations: clean(src.upcomingReservations),
    overdueTasks: clean(src.overdueTasks),
  }
}

/** Texto de resumen para el encabezado del bloque (singular/plural correcto). */
export function attentionSummary(motives: AttentionMotive[]): string {
  if (motives.length === 0) return 'Todo al día: no hay nada pendiente de atención'
  const total = motives.reduce((s, m) => s + m.count, 0)
  return `${total} pendiente${total === 1 ? '' : 's'} en ${motives.length} motivo${motives.length === 1 ? '' : 's'}`
}
