/**
 * (U2) atencion.ts — modelo puro del bloque "Requiere atención" del
 * dashboard. Responde la pregunta operativa: ¿qué me toca hacer ahora?
 *
 * Criterios del plan (F4-T02):
 *  - Motivos calculados sobre datos REALES que ya existen en la org
 *    (bandeja unificada, cotizaciones, agenda, oportunidades). Nada se
 *    inventa ni se estima: si no hay datos, el motivo no aparece.
 *  - Cada motivo lleva la acción a UN clic (ruta interna).
 *  - Motivos configurables para evitar ruido: se pueden desactivar por id
 *    y ajustar el umbral de días de seguimiento de cotizaciones.
 *  - Sin motivos vacíos ni falsos positivos evidentes: solo se muestran
 *    motivos con count > 0.
 */

export interface AttentionMotivo {
  id: string
  label: string
  count: number
  description: string
  /** Ruta interna donde se resuelve el motivo (1 clic). */
  href: string
  severity: 'alta' | 'media' | 'baja'
}

export interface AttentionInput {
  /** Conversaciones de la bandeja cuyo último mensaje es del contacto. */
  inboxPending: number
  /** Cotizaciones en borrador que aún no se han enviado. */
  quotesDraft: number
  /** Cotizaciones enviadas sin respuesta desde hace >= followUpDays. */
  quotesAwaiting: number
  /** Citas confirmadas de HOY (hay que atenderlas en persona). */
  appointmentsToday: number
  /** Oportunidades abiertas con próxima acción vencida (o vence hoy). */
  opportunitiesOverdue: number
}

export interface AttentionOptions {
  /** Días sin respuesta para considerar una cotización "por seguir" (3). */
  quotesFollowUpDays?: number
  /** Motivos desactivados por el usuario (ids) para reducir ruido. */
  disabled?: readonly string[]
}

export const DEFAULT_ATTENTION_OPTIONS: Required<Omit<AttentionOptions, 'disabled'>> = {
  quotesFollowUpDays: 3,
}

const SEVERITY_ORDER: Record<AttentionMotivo['severity'], number> = {
  alta: 0,
  media: 1,
  baja: 2,
}

/**
 * Construye la lista de motivos ACCIONABLES ordenada por severidad.
 * Los motivos con count === 0 se omiten (sin ruido); los desactivados
 * también. Devuelve [] cuando todo está al día (estado sano).
 */
export function buildAttentionMotivos(
  input: AttentionInput,
  options: AttentionOptions = {},
): AttentionMotivo[] {
  const opts = { ...DEFAULT_ATTENTION_OPTIONS, ...options }
  const disabled = new Set(options.disabled ?? [])

  const candidates: AttentionMotivo[] = [
    {
      id: 'mensajes_sin_contestar',
      label: 'Mensajes sin contestar',
      count: Math.max(0, Math.floor(input.inboxPending)),
      description: 'Conversaciones donde el último mensaje es del cliente.',
      href: '/inbox',
      severity: 'alta',
    },
    {
      id: 'citas_de_hoy',
      label: 'Citas de hoy',
      count: Math.max(0, Math.floor(input.appointmentsToday)),
      description: 'Citas confirmadas para el día de hoy.',
      href: '/calendar',
      severity: 'media',
    },
    {
      id: 'cotizaciones_por_enviar',
      label: 'Cotizaciones por enviar',
      count: Math.max(0, Math.floor(input.quotesDraft)),
      description: 'Borradores listos que aún no llegan al cliente.',
      href: '/quotes',
      severity: 'media',
    },
    {
      id: 'cotizaciones_por_seguir',
      label: 'Cotizaciones por seguir',
      count: Math.max(0, Math.floor(input.quotesAwaiting)),
      description: `Enviadas hace ${opts.quotesFollowUpDays}+ días sin respuesta del cliente.`,
      href: '/quotes',
      severity: 'baja',
    },
    {
      id: 'acciones_vencidas',
      label: 'Seguimientos vencidos',
      count: Math.max(0, Math.floor(input.opportunitiesOverdue)),
      description: 'Oportunidades con la próxima acción vencida o para hoy.',
      href: '/opportunities',
      severity: 'media',
    },
  ]

  return candidates
    .filter((m) => !disabled.has(m.id) && m.count > 0)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count)
}

/** Total de asuntos pendientes (suma de counts de los motivos visibles). */
export function attentionTotal(motivos: readonly AttentionMotivo[]): number {
  return motivos.reduce((s, m) => s + m.count, 0)
}
