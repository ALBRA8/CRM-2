/**
 * ecosystem-sso.ts — Contrato SSO del ecosistema ALBRA (2026-11-17).
 *
 * El CRM (capa 1) es el EMISOR: con cualquier sesión autenticada (demo o real)
 * emite ENLACES de un solo uso para abrir las capas 2A (WHATSPOWER) y 2B
 * (WHATSPOWER-ULTRA) con sesión de operador, sin debilitar las puertas
 * endurecidas de cada servicio:
 *
 *   - Formato: `v1.<b64url(payload JSON)>.<b64url(HMAC-SHA256)>`
 *   - Payload: `{ scope:'studio-demo', jti, iat, exp }` — TTL de 90 segundos.
 *   - Emisor: exige `ECOSYSTEM_SSO_SECRET` y la URL pública del studio
 *     (`WHATSPOWER_STUDIO_URL` / `ULTRA_STUDIO_URL`); sin ellas NO se emite
 *     token (fail-closed) y el enlace se declara no disponible.
 *   - Receptor: la capa 2A/2B valida la firma en tiempo constante, el scope,
 *     la expiración y la unicidad del jti (módulo `ecosystem-sso.ts` idéntico
 *     en los tres repositorios).
 *   - NO sustituye al login-demo anónimo ni al login clásico de cada studio:
 *     es un traspaso de sesión consciente, firmado y efímero.
 */
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'

export const ECOSYSTEM_SSO_SCOPE = 'studio-demo'
export const ECOSYSTEM_SSO_TTL_MS = 90_000
export const ECOSYSTEM_SSO_JTI_RETENTION_MS = 10 * 60_000

export interface EcosystemTokenPayload {
  scope: string
  jti: string
  iat: number
  exp: number
}

export function signEcosystemToken(
  secret: string,
  nowMs: number = Date.now(),
  ttlMs: number = ECOSYSTEM_SSO_TTL_MS
): string {
  if (!secret || secret.length < 16) {
    throw new Error('ECOSYSTEM_SSO_SECRET ausente o demasiado corto (mínimo 16 caracteres)')
  }
  const payload: EcosystemTokenPayload = {
    scope: ECOSYSTEM_SSO_SCOPE,
    jti: randomBytes(16).toString('hex'),
    iat: nowMs,
    exp: nowMs + ttlMs,
  }
  const body = `v1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`
  const mac = createHmac('sha256', secret).update(body).digest()
  return `${body}.${mac.toString('base64url')}`
}

export type EcosystemVerification =
  | { ok: true; payload: EcosystemTokenPayload }
  | { ok: false; reason: string }

/** Verificación espejo (la usan los tests del emisor; las capas receptoras tienen su propia copia). */
export function verifyEcosystemToken(
  token: string,
  secret: string | undefined,
  nowMs: number = Date.now()
): EcosystemVerification {
  if (!secret) return { ok: false, reason: 'ECOSYSTEM_SSO_SECRET no configurado (ruta deshabilitada)' }
  const parts = typeof token === 'string' ? token.split('.') : []
  if (parts.length !== 3 || parts[0] !== 'v1') return { ok: false, reason: 'formato inválido' }
  const [, payloadB64, macB64] = parts
  const expected = createHmac('sha256', secret).update(`v1.${payloadB64}`).digest()
  let given: Buffer
  try {
    given = Buffer.from(macB64, 'base64url')
  } catch {
    return { ok: false, reason: 'firma inválida' }
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'firma inválida' }
  }
  let payload: EcosystemTokenPayload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as EcosystemTokenPayload
  } catch {
    return { ok: false, reason: 'payload inválido' }
  }
  if (!payload || payload.scope !== ECOSYSTEM_SSO_SCOPE || typeof payload.jti !== 'string' || typeof payload.exp !== 'number') {
    return { ok: false, reason: 'payload inválido' }
  }
  if (payload.exp <= nowMs) return { ok: false, reason: 'token expirado' }
  return { ok: true, payload }
}

/** Registro de un solo uso por jti (canje único; purga perezosa por retención). */
export class SingleUseJti {
  private seen = new Map<string, number>()
  private retentionMs: number

  constructor(retentionMs: number = ECOSYSTEM_SSO_JTI_RETENTION_MS) {
    this.retentionMs = retentionMs
  }

  /** Devuelve true si el jti se reclama por primera vez. */
  claim(jti: string, nowMs: number = Date.now()): boolean {
    for (const [k, t] of this.seen) if (nowMs - t > this.retentionMs) this.seen.delete(k)
    if (this.seen.has(jti)) return false
    this.seen.set(jti, nowMs)
    return true
  }

  get size(): number {
    return this.seen.size
  }
}

export interface EcosystemLink {
  available: boolean
  url: string | null
}

/** Ruta canónica de canje en las capas receptoras (2A y 2B). */
export const ECOSYSTEM_EXCHANGE_PATH = '/studio/login-ecosystem'

/** Construye el enlace de canje para un servicio; fail-closed si falta el secreto o la URL. */
export function buildEcosystemLink(
  baseUrl: string | undefined,
  secret: string | undefined
): EcosystemLink {
  if (!secret || !baseUrl) return { available: false, url: null }
  try {
    const url = new URL(baseUrl)
    // Se preserva la base configurada (origen y, si la hay, subruta de proxy)
    // y se anexa la ruta canónica de canje del contrato.
    url.pathname = `${url.pathname.replace(/\/+$/, '')}${ECOSYSTEM_EXCHANGE_PATH}`
    url.searchParams.set('token', signEcosystemToken(secret))
    return { available: true, url: url.toString() }
  } catch {
    return { available: false, url: null }
  }
}
