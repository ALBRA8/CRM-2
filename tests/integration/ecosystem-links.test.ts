/**
 * ecosystem-links.test.ts — Acceso directo al ecosistema (2026-11-17)
 *
 * GET /api/auth/ecosystem/links: desde el CRM, cualquier sesión autenticada
 * (demo o real) obtiene enlaces de UN SOLO USO para abrir WHATSPOWER (capa 2A)
 * y WHATSPOWER-ULTRA (capa 2B) con sesión de operador, sin volver a escribir
 * secretos ni repetir logins.
 *
 * Contrato del emisor (capa 1):
 *  1. Anónimo → 401 (el enlace se emite SOLO a sesiones autenticadas).
 *  2. Sin ECOSYSTEM_SSO_SECRET o sin URL del servicio → available:false y
 *     url:null (fail-closed: jamás se emite un token que nadie puede canjear).
 *  3. Con entorno configurado → available:true, URL con token cuyo payload
 *     verificado es { scope:'studio-demo' } con TTL de 90 s.
 *  4. El token NO valida con otro secreto (firmas distintas por servicio).
 *  5. El receptor lo considera de un solo uso (SingleUseJti — contrato
 *     idéntico al de las capas 2A/2B).
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { req as makeReq, tokenA } from '../helpers'
import { GET as linksGET } from '@/app/api/auth/ecosystem/links/route'
import { signEcosystemToken, verifyEcosystemToken, SingleUseJti } from '@/lib/ecosystem-sso'

const req = makeReq as (path: string, opts?: any) => NextRequest

const SSO_SECRET = 'ecosystem_sso_secret_test_min_32_chars_0001'

const ENV_KEYS = ['ECOSYSTEM_SSO_SECRET', 'WHATSPOWER_STUDIO_URL', 'ULTRA_STUDIO_URL'] as const

async function statusOf(promise: Promise<Response>): Promise<number> {
  try {
    const res = await promise
    return res.status
  } catch {
    // HttpError 401 lanzado por requireAuth cuando no hay sesión
    return 401
  }
}

beforeAll(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

interface LinksResponse {
  whatspower: { available: boolean; url: string | null }
  ultra: { available: boolean; url: string | null }
}

describe('ECOSISTEMA — GET /api/auth/ecosystem/links (emisor capa 1)', () => {
  it('1. anónimo → 401: el enlace se emite SOLO a sesiones autenticadas', async () => {
    const status = await statusOf(linksGET(req('/api/auth/ecosystem/links')))
    expect(status).toBe(401)
  })

  it('2. autenticado sin entorno → available:false y jamás emite token', async () => {
    const res = await linksGET(req('/api/auth/ecosystem/links', { token: tokenA() }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as LinksResponse
    expect(body.whatspower).toEqual({ available: false, url: null })
    expect(body.ultra).toEqual({ available: false, url: null })
  })

  it('3. con entorno → enlaces con token verificable (scope studio-demo, TTL 90 s)', async () => {
    process.env.ECOSYSTEM_SSO_SECRET = SSO_SECRET
    process.env.WHATSPOWER_STUDIO_URL = 'http://127.0.0.1:3003'
    process.env.ULTRA_STUDIO_URL = 'http://127.0.0.1:3004'
    const res = await linksGET(req('/api/auth/ecosystem/links', { token: tokenA() }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as LinksResponse
    expect(body.whatspower.available).toBe(true)
    expect(body.ultra.available).toBe(true)
    expect(body.whatspower.url).toMatch(/^http:\/\/127\.0\.0\.1:3003\/studio\/login-ecosystem\?token=/)
    expect(body.ultra.url).toMatch(/^http:\/\/127\.0\.0\.1:3004\/studio\/login-ecosystem\?token=/)

    const wpToken = new URL(body.whatspower.url!).searchParams.get('token')!
    const verdict = verifyEcosystemToken(wpToken, SSO_SECRET)
    expect(verdict.ok).toBe(true)
    expect(verdict.ok && verdict.payload.scope).toBe('studio-demo')
    expect(verdict.ok && verdict.payload.exp - verdict.payload.iat).toBe(90_000)

    const ultraToken = new URL(body.ultra.url!).searchParams.get('token')!
    expect(verifyEcosystemToken(ultraToken, SSO_SECRET).ok).toBe(true)
  })

  it('4. cada enlace usa un jti distinto (dos llamadas → dos tokens independientes)', async () => {
    process.env.ECOSYSTEM_SSO_SECRET = SSO_SECRET
    process.env.WHATSPOWER_STUDIO_URL = 'http://127.0.0.1:3003'
    const r1 = (await (await linksGET(req('/api/auth/ecosystem/links', { token: tokenA() }))).json()) as LinksResponse
    const r2 = (await (await linksGET(req('/api/auth/ecosystem/links', { token: tokenA() }))).json()) as LinksResponse
    const t1 = new URL(r1.whatspower.url!).searchParams.get('token')!
    const t2 = new URL(r2.whatspower.url!).searchParams.get('token')!
    expect(t1).not.toBe(t2)
    const v1 = verifyEcosystemToken(t1, SSO_SECRET)
    const v2 = verifyEcosystemToken(t2, SSO_SECRET)
    if (!v1.ok || !v2.ok) throw new Error('ambos tokens deben verificar con el secreto del ecosistema')
    expect(v1.payload.jti).not.toBe(v2.payload.jti)
  })

  it('5. token NO valida con otro secreto', () => {
    const token = signEcosystemToken(SSO_SECRET)
    const verdict = verifyEcosystemToken(token, 'otro_secreto_totalmente_distinto_0002')
    expect(verdict.ok).toBe(false)
  })

  it('6. token expirado → inválido (el receptor lo rechaza)', () => {
    const expired = signEcosystemToken(SSO_SECRET, Date.now() - 10 * 60_000)
    expect(verifyEcosystemToken(expired, SSO_SECRET).ok).toBe(false)
  })

  it('7. SingleUseJti: el mismo jti solo se canjea una vez (contrato receptor)', () => {
    const store = new SingleUseJti()
    expect(store.claim('jti-eco-1')).toBe(true)
    expect(store.claim('jti-eco-1')).toBe(false)
    expect(store.claim('jti-eco-2')).toBe(true)
  })

  it('8. URL inválida configurada → available:false (sin crash, sin token)', async () => {
    process.env.ECOSYSTEM_SSO_SECRET = SSO_SECRET
    process.env.WHATSPOWER_STUDIO_URL = 'no-es-una-url'
    process.env.ULTRA_STUDIO_URL = 'http://127.0.0.1:3004'
    const res = await linksGET(req('/api/auth/ecosystem/links', { token: tokenA() }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as LinksResponse
    expect(body.whatspower).toEqual({ available: false, url: null })
    expect(body.ultra.available).toBe(true)
  })
})

describe('ECOSISTEMA — la ruta responde sin entorno parcial', () => {
  it('9. solo URL sin secreto → available:false en ambos', async () => {
    process.env.WHATSPOWER_STUDIO_URL = 'http://127.0.0.1:3003'
    const res = await linksGET(req('/api/auth/ecosystem/links', { token: tokenA() }))
    const body = (await res.json()) as LinksResponse
    expect(body.whatspower.available).toBe(false)
    expect(body.ultra.available).toBe(false)
  })
})
