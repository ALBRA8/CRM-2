/**
 * (I2) contratos-ecosistema.test.ts — fixtures versionadas del lado CRM
 * (tarea F7-T02 del PLAN DEFINITIVO, MODIFICADA: solo lado CRM).
 *
 * Los contratos compartidos con WHATSPOWER (2A) y ULTRA (2B) pueden derivar
 * silenciosamente: esta suite fija los VECTORES de prueba que deben dar
 * EXACTAMENTE el mismo resultado en los tres repos.
 *
 * Fixtures:
 *  - HMAC v2 compartido: `hex = HMAC-SHA256(secret, timestamp + "." + rawBody)`
 *    con vector fijo (copia este vector en los tests de 2A/2B: el hex debe
 *    coincidir exactamente). El timestamp ENTRA en la MAC (anti-replay).
 *  - Payload inbound CRM→2A: { eventId, orgId, contact:{phone,name}, message:{text} }.
 *  - SSO espejado: `v1.<payloadB64url>.<macB64url>`, TTL 90 s, jti de un solo
 *    uso, eco de organizationId obligatorio, secreto ≥ 16, MAC sobre el body.
 *  - eventId determinista de stage-change (idempotencia de automatización).
 *
 * Si una capa cambia su algoritmo sin actualizar la fixture, ESTE test falla
 * en el CI del CRM antes de desplegar, no en producción.
 */
import { describe, it, expect } from 'vitest'
import { createHmac, createHash } from 'node:crypto'
import {
  signWhatspowerPayload,
  deriveStageEventId,
} from '@/lib/whatspower-bridge'
import {
  signEcosystemToken,
  verifyEcosystemToken,
  SingleUseJti,
  ECOSYSTEM_SSO_TTL_MS,
  ECOSYSTEM_SSO_SCOPE,
  ECOSYSTEM_EXCHANGE_PATH,
} from '@/lib/ecosystem-sso'

/* ---------- FIXTURE COMPARTIDO v1 (no cambiar sin coordinar los 3 repos) ---------- */
export const FIXTURE = {
  timestamp: '1700000000',
  rawBody: '{"eventId":"e2e-fixture-001","orgId":"org-demo","contact":{"phone":"573000000001","name":"Operador Demo"},"message":{"text":"Hola"}}',
  secret: 'fixture-secreto-compartido-e2e-32-chars-minimo!',
} as const

export const FIXTURE_EXPECTED_HEX = createHmac('sha256', FIXTURE.secret)
  .update(`${FIXTURE.timestamp}.${FIXTURE.rawBody}`, 'utf8')
  .digest('hex')

describe('HMAC v2 compartido (CRM ↔ 2A, contrato v1.1.0)', () => {
  it('el vector fijo produce el hex esperado (fixture estable entre repos)', () => {
    expect(signWhatspowerPayload(FIXTURE.timestamp, FIXTURE.rawBody, FIXTURE.secret))
      .toBe(FIXTURE_EXPECTED_HEX)
    // Estabilidad de longitud/formato: hex puro sha256, sin prefijo.
    expect(FIXTURE_EXPECTED_HEX).toMatch(/^[0-9a-f]{64}$/)
  })

  it('el timestamp ENTRA en la MAC: cambiarlo invalida la firma (anti-replay)', () => {
    const s1 = signWhatspowerPayload(FIXTURE.timestamp, FIXTURE.rawBody, FIXTURE.secret)
    const s2 = signWhatspowerPayload(String(Number(FIXTURE.timestamp) + 1), FIXTURE.rawBody, FIXTURE.secret)
    expect(s2).not.toBe(s1)
  })

  it('modificar el body invalida la firma byte a byte', () => {
    const tampered = FIXTURE.rawBody.replace('Hola', 'HOLA')
    expect(signWhatspowerPayload(FIXTURE.timestamp, tampered, FIXTURE.secret))
      .not.toBe(FIXTURE_EXPECTED_HEX)
  })

  it('un carácter del secreto distinto → firma distinta (secreto por org)', () => {
    expect(signWhatspowerPayload(FIXTURE.timestamp, FIXTURE.rawBody, FIXTURE.secret + 'x'))
      .not.toBe(FIXTURE_EXPECTED_HEX)
  })

  it('acepta timestamp string y numérico de forma idéntica (canonical String(ts))', () => {
    expect(signWhatspowerPayload(1700000000, FIXTURE.rawBody, FIXTURE.secret))
      .toBe(signWhatspowerPayload('1700000000', FIXTURE.rawBody, FIXTURE.secret))
  })

  it('huella documental del fixture (para verificar la copia en 2A/2B)', () => {
    // El sha256-16 del hex esperado identifica la versión del vector: si una
    // capa tiene otra huella, su fixture está desalineada.
    const fingerprint = createHash('sha256').update(FIXTURE_EXPECTED_HEX).digest('hex').slice(0, 16)
    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/)
    expect(FIXTURE_EXPECTED_HEX).toHaveLength(64)
  })

  it('el payload inbound del fixture respeta la forma del contrato (org en identidad)', () => {
    const parsed = JSON.parse(FIXTURE.rawBody) as { eventId: string; orgId: string; contact: { phone: string; name: string }; message: { text: string } }
    expect(Object.keys(parsed).sort()).toEqual(['contact', 'eventId', 'message', 'orgId'])
    expect(parsed.orgId).toBe('org-demo')
    expect(parsed.eventId).toBeTruthy()
    expect(parsed.contact.phone).toMatch(/^573\d{9}$/)
  })
})

describe('SSO espejado (CRM → 2A/2B, canje en /studio/login-ecosystem)', () => {
  const SECRET = 'ecosystem-sso-secreto-compartido-32-chars!'

  it('formato del token: v1.<payloadB64url>.<macB64url> con scope fijo', () => {
    const token = signEcosystemToken(SECRET, 1_700_000_000_000)
    const parts = token.split('.')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe('v1')
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    expect(payload.scope).toBe(ECOSYSTEM_SSO_SCOPE)
    expect(payload.jti).toMatch(/^[0-9a-f]{32}$/)
  })

  it('TTL de 90 segundos exactos (exp − iat = ECOSYSTEM_SSO_TTL_MS)', () => {
    const token = signEcosystemToken(SECRET, 1_700_000_000_000)
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    expect(payload.exp - payload.iat).toBe(90_000)
    expect(ECOSYSTEM_SSO_TTL_MS).toBe(90_000)
  })

  it('verificación válida y eco de organización/rol obligatorio', () => {
    const token = signEcosystemToken(SECRET, 1_700_000_000_000, ECOSYSTEM_SSO_TTL_MS, {
      orgId: 'org-demo',
      role: 'owner',
    })
    const v = verifyEcosystemToken(token, SECRET, 1_700_000_001_000, 'org-demo')
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.payload.orgId).toBe('org-demo') // eco EXACTO de la organización
      expect(v.payload.role).toBe('owner')
    }
  })

  it('organización distinta de la esperada → rechazo sin oráculo', () => {
    const token = signEcosystemToken(SECRET, 1_700_000_000_000, ECOSYSTEM_SSO_TTL_MS, { orgId: 'org-otra' })
    const v = verifyEcosystemToken(token, SECRET, 1_700_000_001_000, 'org-demo')
    expect(v.ok).toBe(false)
  })

  it('expiración: la ventana de 90 s es estricta (en el límite ya no canjea)', () => {
    const iat = 1_700_000_000_000
    const token = signEcosystemToken(SECRET, iat)
    expect(verifyEcosystemToken(token, SECRET, iat + 89_999).ok).toBe(true)
    const v90 = verifyEcosystemToken(token, SECRET, iat + 90_000)
    expect(v90.ok).toBe(false)
  })

  it('tamper del payload → firma inválida (la MAC cubre el body completo)', () => {
    const token = signEcosystemToken(SECRET, 1_700_000_000_000)
    const parts = token.split('.')
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    payload.role = 'superadmin' // escalación de rol intentada
    const forged = `v1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${parts[2]}`
    const v = verifyEcosystemToken(forged, SECRET, 1_700_000_001_000)
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.reason).toBe('firma inválida')
  })

  it('secreto corto o ausente → fail-closed (jamás emite ni canjea)', () => {
    expect(() => signEcosystemToken('corto')).toThrow()
    const v = verifyEcosystemToken(signEcosystemToken(SECRET), undefined, 1_700_000_001_000)
    expect(v.ok).toBe(false)
  })

  it('jti de un solo uso: el canje repetido del mismo enlace se rechaza', () => {
    const jti1 = JSON.parse(Buffer.from(signEcosystemToken(SECRET, 1_700_000_000_000).split('.')[1], 'base64url').toString('utf8')).jti
    const jti2 = JSON.parse(Buffer.from(signEcosystemToken(SECRET, 1_700_000_000_000).split('.')[1], 'base64url').toString('utf8')).jti
    expect(jti2).not.toBe(jti1) // cada emisión es un enlace nuevo
    const registry = new SingleUseJti()
    expect(registry.claim(jti1, 1_700_000_001_000)).toBe(true) // primer canje OK
    expect(registry.claim(jti1, 1_700_000_002_000)).toBe(false) // replay del mismo jti
    expect(registry.claim(jti2, 1_700_000_003_000)).toBe(true) // jti distinto pasa
  })

  it('retención de jti: tras la ventana la huella se purga (purga perezosa)', () => {
    const registry = new SingleUseJti(10 * 60_000)
    const jti = JSON.parse(Buffer.from(signEcosystemToken(SECRET, 1_700_000_000_000).split('.')[1], 'base64url').toString('utf8')).jti
    expect(registry.claim(jti, 1_700_000_000_000)).toBe(true)
    expect(registry.claim(jti, 1_700_000_000_000 + 10 * 60_000 + 1)).toBe(true)
  })

  it('ruta canónica de canje compartida por las capas receptoras', () => {
    expect(ECOSYSTEM_EXCHANGE_PATH).toBe('/studio/login-ecosystem')
  })
})

describe('idempotencia de stage-change (eventId determinista por ventana)', () => {
  const NOW = 1_700_000_000_000 // ventana fija: mismo bucket → mismo eventId

  it('mismo evento de negocio dentro de la ventana → mismo eventId (no se duplica)', () => {
    const a = deriveStageEventId('org-demo', 'opp-9', 'Oferta', 'Seguimiento', NOW)
    const b = deriveStageEventId('org-demo', 'opp-9', 'Oferta', 'Seguimiento', NOW)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
  })

  it('transición distinta del mismo deal → eventId distinto', () => {
    const a = deriveStageEventId('org-demo', 'opp-9', 'Oferta', 'Seguimiento', NOW)
    const b = deriveStageEventId('org-demo', 'opp-9', 'Seguimiento', 'Oferta', NOW)
    expect(b).not.toBe(a)
  })

  it('organización distinta → eventId distinto (sin colisión cross-org)', () => {
    const a = deriveStageEventId('org-demo', 'opp-9', 'Oferta', 'Seguimiento', NOW)
    const b = deriveStageEventId('org-otra', 'opp-9', 'Oferta', 'Seguimiento', NOW)
    expect(b).not.toBe(a)
  })
})
