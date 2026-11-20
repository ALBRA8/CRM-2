import { describe, expect, it } from 'vitest'
import { createTransportPolicy, TransportPolicyError, TRANSPORTS } from '../../integration-kits/wp-ultra/i6-transport-policy/transport-policy.mjs'

/**
 * Kit I6 (WP+ULTRA) — transporte por política por organización, fin de la
 * variable global TRANSPORT. Fail-closed: mala config → error tipado.
 */
describe('kit I6 — transport-policy', () => {
  it('política explícita por org gana sobre el default', () => {
    const policy = createTransportPolicy(JSON.stringify({ 'org-a': 'cloud_api', 'org-b': 'baileys', '*': 'baileys' }))
    expect(policy.resolve('org-a')).toEqual({ transport: 'cloud_api', source: 'org_policy' })
    expect(policy.resolve('org-b')).toEqual({ transport: 'baileys', source: 'org_policy' })
    expect(policy.resolve('org-desconocida')).toEqual({ transport: 'baileys', source: 'default' })
  })

  it('org sin entrada y sin "*" → error (jamás caer a la global)', () => {
    const policy = createTransportPolicy(JSON.stringify({ 'org-a': 'cloud_api' }))
    expect(() => policy.resolve('org-b')).toThrow(TransportPolicyError)
  })

  it('fail-closed en carga: valor desconocido o JSON inválido → error tipado', () => {
    expect(() => createTransportPolicy(JSON.stringify({ 'org-a': 'sms' }))).toThrow(/transporte desconocido "sms"/)
    expect(() => createTransportPolicy('{no-json')).toThrow(/no es JSON válido/)
    expect(() => createTransportPolicy('[1,2]')).toThrow(/debe ser un objeto/)
    expect(() => createTransportPolicy('', { requireExplicit: true })).toThrow(/no configurado/)
  })

  it('orgId vacío → error (jamás una variable global implícita)', () => {
    const policy = createTransportPolicy(JSON.stringify({ '*': 'baileys' }))
    expect(() => policy.resolve('')).toThrow(/orgId requerido/)
  })

  it('los transportes válidos son los del ecosistema', () => {
    expect(TRANSPORTS).toEqual(['cloud_api', 'baileys'])
  })
})
