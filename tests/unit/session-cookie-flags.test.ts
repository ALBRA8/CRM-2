/**
 * Flags de la cookie de sesión (albra_session) — 2026-11-17.
 *
 * Contrato (H del diagnóstico del dueño):
 *  - Por defecto la cookie es HttpOnly + SameSite=Lax + Secure SOLO en
 *    producción. Con http://localhost los navegadores aceptan Secure, pero
 *    si el CRM se abre por IP de red LAN la cookie NO se guarda y "la demo
 *    no entra".
 *  - SESSION_COOKIE_SECURE=false es el escape EXPLÍCITO del dueño (jamás por
 *    defecto) para servir por IP sin HTTPS: omite Secure en cualquier entorno.
 *  - La cookie JAMÁS pierde HttpOnly ni SameSite bajo ninguna combinación.
 */
import { describe, expect, it, afterEach, vi } from 'vitest'
import { SESSION_COOKIE } from '@/lib/auth'
import { jsonWithSession } from '@/app/api/_lib/shared'

// NODE_ENV es readonly para TS (tipos de Next): se muta con vi.stubEnv.
const PREV_SECURE = process.env.SESSION_COOKIE_SECURE

function cookieOf(): string {
  const res = jsonWithSession({ ok: true }, 'jwt-de-prueba-no-funcional')
  const setCookie = res.headers.get('set-cookie') || ''
  expect(setCookie).toContain(`${SESSION_COOKIE}=`)
  return setCookie
}

afterEach(() => {
  vi.unstubAllEnvs()
  if (PREV_SECURE === undefined) delete process.env.SESSION_COOKIE_SECURE; else process.env.SESSION_COOKIE_SECURE = PREV_SECURE
})

describe('Cookie de sesión — Secure condicional (H del dueño)', () => {
  it('1. Producción → Secure presente (por defecto, sin escape)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    delete process.env.SESSION_COOKIE_SECURE
    const c = cookieOf()
    expect(c).toContain('HttpOnly')
    expect(c.toLowerCase()).toContain('samesite=lax')
    expect(c).toContain('Secure')
  })

  it('2. Desarrollo → SIN Secure (así la cookie se guarda también por IP de LAN)', () => {
    vi.stubEnv('NODE_ENV', 'development')
    delete process.env.SESSION_COOKIE_SECURE
    const c = cookieOf()
    expect(c).toContain('HttpOnly')
    expect(c).not.toContain('Secure')
  })

  it('3. SESSION_COOKIE_SECURE=false → SIN Secure incluso en producción (escape EXPLÍCITO del dueño)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.SESSION_COOKIE_SECURE = 'false'
    const c = cookieOf()
    expect(c).toContain('HttpOnly')
    expect(c).not.toContain('Secure')
  })

  it('4. SESSION_COOKIE_SECURE con otro valor NO abre el escape (fail-closed)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.SESSION_COOKIE_SECURE = 'FALSE'
    expect(cookieOf()).toContain('Secure')
    process.env.SESSION_COOKIE_SECURE = '1'
    expect(cookieOf()).toContain('Secure')
  })

  it('5. La cookie jamás pierde HttpOnly ni SameSite=Lax (invariantes)', () => {
    for (const node of ['development', 'production'] as const) {
      for (const secure of [undefined, 'false', 'true']) {
        vi.stubEnv('NODE_ENV', node)
        if (secure === undefined) delete process.env.SESSION_COOKIE_SECURE; else process.env.SESSION_COOKIE_SECURE = secure
        const c = cookieOf()
        expect(c).toContain('HttpOnly')
        expect(c.toLowerCase()).toContain('samesite=lax')
        expect(c).toContain('Path=/')
      }
    }
  })
})
