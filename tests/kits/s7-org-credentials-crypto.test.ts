import { describe, expect, it, afterEach } from 'vitest'
import {
  encryptOrgSecret,
  decryptOrgSecret,
  sha256HexOrg,
  isLegacyPlaintextOrg,
  migrateOrgSecret,
  safeEqualsOrg,
  OrgCryptoError,
} from '../../integration-kits/wp-ultra/s7-org-credentials-encrypted/org-credentials-crypto.mjs'

/**
 * Kit S7 (WP+ULTRA) — credenciales por organización cifradas en reposo.
 * Port del formato v1 AES-256-GCM del CRM: roundtrip, detección de tamper,
 * fail-closed sin clave y migración legacy idempotente.
 */
describe('kit S7 — org-credentials-crypto', () => {
  const KEY = 'a'.repeat(64) // hex 32 bytes tras SHA-256
  afterEach(() => {
    delete process.env.CRM_ENCRYPTION_KEY
    delete process.env.CRM_APP_SECRET
  })

  it('roundtrip: cifra y descifra el token Meta de la org', () => {
    process.env.CRM_ENCRYPTION_KEY = KEY
    const enc = encryptOrgSecret('EAAG-meta-token-secreto')
    expect(enc).toMatch(/^v1:/)
    expect(decryptOrgSecret(enc)).toBe('EAAG-meta-token-secreto')
  })

  it('cada cifrado usa IV aleatorio (dos cifrados del mismo valor difieren)', () => {
    process.env.CRM_ENCRYPTION_KEY = KEY
    const a = encryptOrgSecret('mismo-valor')
    const b = encryptOrgSecret('mismo-valor')
    expect(a).not.toBe(b)
    expect(decryptOrgSecret(a)).toBe(decryptOrgSecret(b))
  })

  it('tamper del ciphertext → null (GCM detecta alteración, fail-closed)', () => {
    process.env.CRM_ENCRYPTION_KEY = KEY
    const enc = encryptOrgSecret('token-real') as string
    const parts = enc.split(':')
    const data = Buffer.from(parts[3], 'base64')
    data[0] = data[0] ^ 0xff
    const tampered = [parts[0], parts[1], parts[2], Buffer.from(data).toString('base64')].join(':')
    expect(decryptOrgSecret(tampered)).toBeNull()
  })

  it('clave distinta → null (jamás devuelve basura)', () => {
    process.env.CRM_ENCRYPTION_KEY = KEY
    const enc = encryptOrgSecret('token-real')
    process.env.CRM_ENCRYPTION_KEY = 'b'.repeat(64)
    expect(decryptOrgSecret(enc)).toBeNull()
  })

  it('sin clave configurada → error tipado (fail-closed, jamás clave inventada)', () => {
    expect(() => encryptOrgSecret('x')).toThrow(OrgCryptoError)
  })

  it('migración legacy: plano → v1, ya cifrado → intacto, nulo → no-op', () => {
    process.env.CRM_ENCRYPTION_KEY = KEY
    const legacy = migrateOrgSecret('token-plano-antiguo')
    expect(legacy.isLegacy).toBe(true)
    expect(legacy.encrypted).toMatch(/^v1:/)
    expect(decryptOrgSecret(legacy.encrypted)).toBe('token-plano-antiguo')

    const already = migrateOrgSecret(legacy.encrypted)
    expect(already.isLegacy).toBe(false)
    expect(already.encrypted).toBe(legacy.encrypted)

    expect(migrateOrgSecret(null)).toEqual({ isLegacy: false, encrypted: null, plain: null })
    expect(isLegacyPlaintextOrg('token-plano')).toBe(true)
    expect(isLegacyPlaintextOrg(legacy.encrypted)).toBe(false)
  })

  it('hash de lookup + comparación timing-safe', () => {
    const h1 = sha256HexOrg('cred-org-a')
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    expect(sha256HexOrg('cred-org-a')).toBe(h1)
    expect(safeEqualsOrg('cred-org-a', 'cred-org-a')).toBe(true)
    expect(safeEqualsOrg('cred-org-a', 'cred-org-b')).toBe(false)
    expect(safeEqualsOrg('', 'cred-org-a')).toBe(false)
  })
})
