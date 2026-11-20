import { describe, expect, it } from 'vitest'
import { requireOrgServiceCredentials, OrgServiceCredentialsError } from '../../integration-kits/wp-ultra/s3-org-service-credentials/org-bearer-auth.mjs'

/**
 * Kit S3 (WP) — Bearer por organización, fin del secreto operador global.
 * La org se deduce de la CREDENCIAL que matchea (jamás de un header creíble).
 */
describe('kit S3 — org-bearer-auth', () => {
  const CREDS = JSON.stringify({ 'org-a': 'credencial-org-a-0123456789abcdef', 'org-b': 'credencial-org-b-fedcba9876543210' })

  it('config ausente o inválida → error tipado (fail-closed)', () => {
    expect(() => requireOrgServiceCredentials(undefined)).toThrow(OrgServiceCredentialsError)
    expect(() => requireOrgServiceCredentials('no-es-json')).toThrow(OrgServiceCredentialsError)
    expect(() => requireOrgServiceCredentials('[]')).toThrow(OrgServiceCredentialsError)
    expect(() => requireOrgServiceCredentials('{"org-a":"corta"}')).toThrow(OrgServiceCredentialsError)
  })

  it('autentica y deduce la org desde la credencial presentada', () => {
    const auth = requireOrgServiceCredentials(CREDS)
    expect(auth.authenticate('credencial-org-a-0123456789abcdef')).toEqual({ orgId: 'org-a' })
    expect(auth.authenticate('credencial-org-b-fedcba9876543210')).toEqual({ orgId: 'org-b' })
    expect(auth.orgCount()).toBe(2)
  })

  it('credencial inválida o vacía → null (sin revelar orgs existentes)', () => {
    const auth = requireOrgServiceCredentials(CREDS)
    expect(auth.authenticate('otra-credencial-aleatoria-xyz')).toBeNull()
    expect(auth.authenticate('')).toBeNull()
    expect(auth.authenticate(undefined)).toBeNull()
  })

  it('authorizeOrg: el pedido de otra org se rechaza (403 esperado en el handler)', () => {
    const auth = requireOrgServiceCredentials(CREDS)
    const res = auth.authenticate('credencial-org-a-0123456789abcdef')
    expect(auth.authorizeOrg(res, 'org-a')).toBe(true)
    expect(auth.authorizeOrg(res, 'org-b')).toBe(false)
    expect(auth.authorizeOrg(null, 'org-a')).toBe(false)
  })

  it('cross-org: el Bearer de org-a jamás autoriza operaciones de org-b', () => {
    const auth = requireOrgServiceCredentials(CREDS)
    const res = auth.authenticate('credencial-org-a-0123456789abcdef')
    // El flujo correcto SIEMPRE usa res.orgId como tenant; el X-Org-Id del
    // caller solo puede confirmar, jamás ampliar.
    expect(auth.authorizeOrg(res, 'org-b')).toBe(false)
  })
})
