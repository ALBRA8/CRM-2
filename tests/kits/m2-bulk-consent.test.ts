import { describe, expect, it } from 'vitest'
import { processBulkConsent, revocationUpdate, CONSENT_ORIGINS } from '../../integration-kits/wp-ultra/m2-bulk-consent/bulk-consent.mjs'

/**
 * Kit M2 (ULTRA) — bulk consent Ley 1581. Reglas: origen de catálogo cerrado,
 * evidencia obligatoria por origen, fecha no futura, canal válido, duplicados
 * rechazados, revocación como tombstone (jamás borrado).
 */
describe('kit M2 — bulk-consent (Ley 1581)', () => {
  const NOW = Date.parse('2026-11-20T12:00:00.000Z')
  const base = { contactId: 'c-1', phone: '+573001234567', consentOrigin: 'web_form', evidence: { url: 'https://sitio.co/form' }, obtainedAt: '2026-11-01T10:00:00.000Z' }

  it('lote válido: acepta con origen y evidencia correctos', () => {
    const res = processBulkConsent([base], NOW)
    expect(res.rejected).toEqual([])
    expect(res.accepted).toEqual([{ contactId: 'c-1', consentOrigin: 'web_form', obtainedAt: '2026-11-01T10:00:00.000Z' }])
  })

  it('catálogo cerrado: origen desconocido rechazado', () => {
    const res = processBulkConsent([{ ...base, consentOrigin: 'verbal_telefonica' }], NOW)
    expect(res.accepted).toEqual([])
    expect(res.rejected[0].reason).toContain('consentOrigin debe ser uno de')
    expect(CONSENT_ORIGINS).not.toContain('verbal_telefonica')
  })

  it('evidencia obligatoria por origen (5 orígenes, cada uno con su campo)', () => {
    const rows = [
      { ...base, contactId: 'c-wf', consentOrigin: 'web_form', evidence: { url: 'http://x.co' } },
      { ...base, contactId: 'c-do', consentOrigin: 'double_optin', evidence: { confirmationId: 'conf-123456' } },
      { ...base, contactId: 'c-pw', consentOrigin: 'physical_written', evidence: { documentRef: 'DOC-2026-001' } },
      { ...base, contactId: 'c-cr', consentOrigin: 'call_recording', evidence: { recordingId: 'REC-99' } },
      { ...base, contactId: 'c-ct', consentOrigin: 'contract', evidence: { contractRef: 'CT-77' } },
    ]
    expect(processBulkConsent(rows, NOW).rejected).toEqual([])
    // Sin evidencia → rechazado con motivo específico
    const bad = processBulkConsent([{ ...base, contactId: 'c-bad', consentOrigin: 'double_optin', evidence: {} }], NOW)
    expect(bad.rejected[0].reason).toContain('evidencia insuficiente para consentOrigin=double_optin')
  })

  it('fecha futura rechazada (consentimiento fabricado) y fecha inválida rechazada', () => {
    const future = processBulkConsent([{ ...base, obtainedAt: '2026-12-01T00:00:00.000Z' }], NOW)
    expect(future.rejected[0].reason).toContain('no puede ser futura')
    const invalid = processBulkConsent([{ ...base, obtainedAt: 'ayer' }], NOW)
    expect(invalid.rejected[0].reason).toContain('fecha ISO válida')
  })

  it('canal requerido: phone E.164 Colombia o email; sin canal → rechazado', () => {
    expect(processBulkConsent([{ ...base, phone: '3001234567', email: undefined }], NOW).rejected[0].reason).toContain('canal requerido')
    expect(processBulkConsent([{ ...base, email: 'cliente@sitio.co', phone: undefined }], NOW).rejected).toEqual([])
  })

  it('duplicados en el lote y datos inválidos → rechazados con índice', () => {
    const res = processBulkConsent([base, { ...base }, { contactId: '', phone: '+573001234567', consentOrigin: 'web_form', evidence: { url: 'https://x.co' }, obtainedAt: '2026-11-01T00:00:00Z' }], NOW)
    expect(res.accepted).toHaveLength(1)
    expect(res.rejected).toEqual([
      { index: 1, reason: 'contactId duplicado en el lote' },
      { index: 2, reason: 'contactId inválido' },
    ])
  })

  it('revocación como tombstone auditable; fechas inválidas/futuras → null', () => {
    const tomb = revocationUpdate('c-1', '2026-11-19T08:00:00.000Z')
    expect(tomb).toEqual({ contactId: 'c-1', consentOrigin: 'revoked', evidence: expect.stringContaining('revokedAt=2026-11-19') })
    expect(revocationUpdate('c-1', '2099-01-01T00:00:00Z')).toBeNull()
    expect(revocationUpdate('', '2026-11-19T08:00:00.000Z')).toBeNull()
  })
})
