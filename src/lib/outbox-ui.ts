/**
 * M8 — helpers PUROS de la vista de reconciliación de envíos UNCERTAIN.
 *
 * La política ya implementada en la API (`src/lib/channel-outbox.ts` +
 * `/api/internal/channel-outbox/reconcile`) es: un envío `unknown` JAMÁS se
 * reintenta automáticamente; conciliar exige evidencia del proveedor
 * (providerChecked=true, resolution sent/failed). Esta vista de operador
 * reproduce esa exigencia en el cliente antes de permitir el POST.
 */

export type ReconciliationResolution = 'sent' | 'failed'

export const RESOLUTIONS: ReconciliationResolution[] = ['sent', 'failed']

export interface EvidenceErrors {
  resolution?: string
  providerMessageId?: string
  evidence?: string
}

/**
 * Validación de la evidencia mínima de conciliación (espejo exacto de la API):
 *  - resolución sent|failed obligatoria;
 *  - ID del proveedor (4-256 chars, sin saltos de línea) O una nota de evidencia
 *    de al menos 10 caracteres que explique qué verificó el operador.
 */
export function validateReconciliationEvidence(input: {
  resolution: string
  providerMessageId: string
  evidence: string
}): EvidenceErrors {
  const errors: EvidenceErrors = {}
  if (!RESOLUTIONS.includes(input.resolution as ReconciliationResolution)) {
    errors.resolution = 'Elige si el proveedor lo entregó (sent) o no (failed)'
  }
  const pmi = input.providerMessageId.trim()
  if (pmi) {
    if (pmi.length < 4) errors.providerMessageId = 'El ID del proveedor es demasiado corto'
    if (pmi.length > 256) errors.providerMessageId = 'El ID del proveedor excede 256 caracteres'
    if (/[\r\n]/.test(pmi)) errors.providerMessageId = 'El ID del proveedor no puede contener saltos de línea'
  }
  const ev = input.evidence.trim()
  if (!pmi && ev.length < 10) {
    errors.evidence = 'Sin ID del proveedor, describe la evidencia verificada (mínimo 10 caracteres)'
  }
  return errors
}

/** ¿Puede enviarse el POST de conciliación con la evidencia capturada? */
export function canSubmitReconciliation(errors: EvidenceErrors): boolean {
  return Object.keys(errors).length === 0
}

/** Etiqueta legible de la resolución elegida. */
export function resolutionLabel(resolution: string): string {
  switch (resolution) {
    case 'sent':
      return 'Entregado (sent)'
    case 'failed':
      return 'No entregado (failed)'
    default:
      return resolution
  }
}

/** Antigüedad legible de un envío incierto (horas/días). */
export function uncertainAge(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const hours = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 3_600_000))
  if (hours < 1) return 'menos de 1 h'
  if (hours < 48) return `${hours} h`
  return `${Math.floor(hours / 24)} días`
}

/** Cuerpo truncado para la lista (evita paredes de texto en la tabla). */
export function truncateBody(body: string | null | undefined, max = 120): string {
  if (!body) return ''
  const oneLine = body.replace(/\s+/g, ' ').trim()
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`
}

/**
 * Estado de fila de la vista: los `sending` con intentos por encima del umbral
 * también se muestran como sospechosos de quedarse colgados (el operador decide
 * esperar; la conciliación solo aplica a `unknown`, igual que en la API).
 */
export function rowAlertLevel(status: string, attemptCount: number): 'unknown' | 'suspect' | 'ok' {
  if (status === 'unknown') return 'unknown'
  if (status === 'sending' && attemptCount >= 3) return 'suspect'
  return 'ok'
}
