/**
 * (U2) atencion.test.ts — modelo puro del bloque "Requiere atención".
 *
 * Cubre: sin datos → sin motivos (sin ruido ni falsos positivos), orden por
 * severidad y luego por cantidad, omisión de motivos vacíos, motivos
 * desactivados por id (configurable), umbral de días documentado en la
 * descripción, total y validación de entradas raras (negativos, NaN).
 */
import { describe, it, expect } from 'vitest'
import {
  attentionTotal,
  buildAttentionMotivos,
} from '@/lib/atencion'

const FULL = {
  inboxPending: 4,
  quotesDraft: 2,
  quotesAwaiting: 3,
  appointmentsToday: 1,
  opportunitiesOverdue: 5,
}

describe('buildAttentionMotivos', () => {
  it('todo al día → lista vacía (el bloque no se renderiza)', () => {
    const empty = { inboxPending: 0, quotesDraft: 0, quotesAwaiting: 0, appointmentsToday: 0, opportunitiesOverdue: 0 }
    expect(buildAttentionMotivos(empty)).toEqual([])
    expect(attentionTotal(buildAttentionMotivos(empty))).toBe(0)
  })

  it('solo aparecen motivos con count > 0', () => {
    const motivos = buildAttentionMotivos({ ...FULL, quotesDraft: 0, appointmentsToday: 0 })
    expect(motivos.map((m) => m.id)).not.toContain('cotizaciones_por_enviar')
    expect(motivos.map((m) => m.id)).not.toContain('citas_de_hoy')
    expect(motivos).toHaveLength(3)
  })

  it('orden por severidad (alta→media→baja) y por cantidad dentro del mismo nivel', () => {
    const motivos = buildAttentionMotivos(FULL)
    expect(motivos[0].id).toBe('mensajes_sin_contestar') // alta
    // media: acciones_vencidas (5) antes que cotizaciones_por_enviar (2)
    expect(motivos[1].id).toBe('acciones_vencidas')
    expect(motivos[2].id).toBe('cotizaciones_por_enviar')
    expect(motivos[3].id).toBe('citas_de_hoy') // media, count 1
    expect(motivos[4].id).toBe('cotizaciones_por_seguir') // baja
  })

  it('cada motivo lleva acción a un clic con ruta interna', () => {
    for (const m of buildAttentionMotivos(FULL)) {
      expect(m.href).toMatch(/^\/(inbox|quotes|calendar|opportunities)$/)
      expect(m.label).toBeTruthy()
      expect(m.description).toBeTruthy()
    }
  })

  it('mensajes sin contestar usa la bandeja unificada', () => {
    const m = buildAttentionMotivos(FULL).find((x) => x.id === 'mensajes_sin_contestar')!
    expect(m.href).toBe('/inbox')
    expect(m.count).toBe(4)
    expect(m.severity).toBe('alta')
  })

  it('motivos desactivados por el usuario no aparecen (anti-ruido configurable)', () => {
    const motivos = buildAttentionMotivos(FULL, { disabled: ['cotizaciones_por_seguir', 'acciones_vencidas'] })
    expect(motivos.map((m) => m.id)).not.toContain('cotizaciones_por_seguir')
    expect(motivos.map((m) => m.id)).not.toContain('acciones_vencidas')
    expect(motivos).toHaveLength(3)
  })

  it('el umbral de seguimiento queda documentado en la descripción', () => {
    const d3 = buildAttentionMotivos(FULL, { quotesFollowUpDays: 3 })
      .find((m) => m.id === 'cotizaciones_por_seguir')!
    expect(d3.description).toContain('3')
    const d7 = buildAttentionMotivos(FULL, { quotesFollowUpDays: 7 })
      .find((m) => m.id === 'cotizaciones_por_seguir')!
    expect(d7.description).toContain('7')
  })

  it('entradas raras (negativos, decimales, NaN) no rompen ni inventan ruido', () => {
    const rare = buildAttentionMotivos({
      inboxPending: -5,
      quotesDraft: 1.7,
      quotesAwaiting: Number.NaN,
      appointmentsToday: -0,
      opportunitiesOverdue: 2,
    })
    // inboxPending negativo → no aparece (0); 1.7 se trunca a 1; NaN → 0.
    expect(rare.find((m) => m.id === 'mensajes_sin_contestar')).toBeUndefined()
    expect(rare.find((m) => m.id === 'cotizaciones_por_enviar')!.count).toBe(1)
    expect(rare.find((m) => m.id === 'cotizaciones_por_seguir')).toBeUndefined()
    expect(rare.find((m) => m.id === 'acciones_vencidas')!.count).toBe(2)
  })

  it('attentionTotal suma solo los motivos visibles', () => {
    const motivos = buildAttentionMotivos(FULL, { disabled: ['mensajes_sin_contestar'] })
    expect(attentionTotal(motivos)).toBe(FULL.quotesDraft + FULL.quotesAwaiting + FULL.appointmentsToday + FULL.opportunitiesOverdue)
  })
})
