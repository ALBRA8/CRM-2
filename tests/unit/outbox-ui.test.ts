import { describe, expect, it } from 'vitest'
import {
  validateReconciliationEvidence, canSubmitReconciliation, resolutionLabel,
  uncertainAge, truncateBody, rowAlertLevel,
} from '@/lib/outbox-ui'

/**
 * M8 — helpers puros de la vista de reconciliación UNCERTAIN.
 * Espejo exacto de la política de evidencia del endpoint interno:
 * sin ID del proveedor o nota de evidencia, NO se concilia.
 */

describe('M8 · validateReconciliationEvidence', () => {
  it('acepta ID del proveedor sin nota', () => {
    const e = validateReconciliationEvidence({ resolution: 'sent', providerMessageId: 'wamid.HBgL', evidence: '' })
    expect(e).toEqual({})
    expect(canSubmitReconciliation(e)).toBe(true)
  })

  it('acepta nota de evidencia sin ID (mínimo 10 caracteres)', () => {
    const e = validateReconciliationEvidence({ resolution: 'failed', providerMessageId: '', evidence: 'Verificado en panel de Meta a las 10:15' })
    expect(e).toEqual({})
  })

  it('rechaza sin evidencia alguna', () => {
    const e = validateReconciliationEvidence({ resolution: 'sent', providerMessageId: '', evidence: '' })
    expect(e.evidence).toBeTruthy()
    expect(canSubmitReconciliation(e)).toBe(false)
  })

  it('rechaza nota demasiado corta', () => {
    const e = validateReconciliationEvidence({ resolution: 'sent', providerMessageId: '', evidence: 'corto' })
    expect(e.evidence).toBeTruthy()
  })

  it('rechaza resolución inválida', () => {
    const e = validateReconciliationEvidence({ resolution: 'retry', providerMessageId: 'wamid.123', evidence: '' })
    expect(e.resolution).toBeTruthy()
  })

  it('rechaza ID con salto de línea (inyección)', () => {
    const e = validateReconciliationEvidence({ resolution: 'sent', providerMessageId: 'wamid\n-X', evidence: '' })
    expect(e.providerMessageId).toBeTruthy()
  })

  it('rechaza ID demasiado corto o demasiado largo', () => {
    expect(validateReconciliationEvidence({ resolution: 'sent', providerMessageId: 'ab', evidence: '' }).providerMessageId).toBeTruthy()
    expect(validateReconciliationEvidence({ resolution: 'sent', providerMessageId: 'x'.repeat(257), evidence: '' }).providerMessageId).toBeTruthy()
  })
})

describe('M8 · etiquetas y tiempos', () => {
  it('resolutionLabel traduce ambas resoluciones', () => {
    expect(resolutionLabel('sent')).toContain('sent')
    expect(resolutionLabel('failed')).toContain('failed')
    expect(resolutionLabel('otro')).toBe('otro')
  })

  it('uncertainAge muestra horas y días', () => {
    const now = new Date('2026-11-20T12:00:00Z')
    expect(uncertainAge('2026-11-20T11:30:00Z', now)).toBe('menos de 1 h')
    expect(uncertainAge('2026-11-20T04:00:00Z', now)).toBe('8 h')
    expect(uncertainAge('2026-11-16T12:00:00Z', now)).toBe('4 días')
    expect(uncertainAge(null, now)).toBe('—')
    expect(uncertainAge('no-fecha', now)).toBe('—')
  })

  it('truncateBody colapsa espacios y recorta con elipsis', () => {
    expect(truncateBody('hola\n  mundo   !')).toBe('hola mundo !')
    const long = 'x'.repeat(150)
    const cut = truncateBody(long, 120)
    expect(cut.length).toBe(120)
    expect(cut.endsWith('…')).toBe(true)
    expect(truncateBody(null)).toBe('')
  })
})

describe('M8 · nivel de alerta de fila', () => {
  it('unknown es crítico; sending con >=3 intentos es sospechoso; el resto ok', () => {
    expect(rowAlertLevel('unknown', 1)).toBe('unknown')
    expect(rowAlertLevel('sending', 3)).toBe('suspect')
    expect(rowAlertLevel('sending', 1)).toBe('ok')
    expect(rowAlertLevel('queued', 0)).toBe('ok')
  })
})
