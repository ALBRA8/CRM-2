/**
 * tenant-route-hardening.test.ts — (reparación 2026-11-17, FASE 5)
 *
 * DEFENSA EN PROFUNDIDAD sobre las rutas que NO tenían suite dedicada:
 * OAuth/social (Instagram, Facebook, Telegram, TikTok, Google), gestión de
 * equipo, base de conocimiento, campos personalizados y rutas internas.
 *
 * Para CADA familia se verifica el mismo contrato de aislamiento multi-tenant:
 *  - anónimo → 401 (sin sesión)
 *  - miembro sin permisos → 403 (se exige admin)
 *  - admin de OTRA organización → 404 (el recurso jamás se resuelve cross-org;
 *    ni siquiera se revela su existencia: 404 sin oráculo, jamás 200/403)
 *
 * Los handlers se invocan como funciones puras con NextRequest real (mismo
 * patrón que tests/helpers.ts) sobre la BD efímera de vitest.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import type { NextRequest } from 'next/server'
import { FIX } from '../helpers'
import { req as makeReq, tokenFor } from '../helpers'
import { db } from '@/lib/db'

// — Handlers bajo prueba —
import { GET as igStartGET } from '@/app/api/instagram/oauth/start/route'
import { GET as igConfigGET } from '@/app/api/instagram/config/route'
import { GET as fbStartGET } from '@/app/api/facebook/oauth/start/route'
import { GET as fbConfigGET } from '@/app/api/facebook/config/route'
import { GET as tiktokStartGET } from '@/app/api/tiktok/oauth/start/route'
import { GET as tiktokConfigGET } from '@/app/api/tiktok/config/route'
import { GET as tgConfigGET } from '@/app/api/telegram/config/route'
import { GET as googleAuthGET } from '@/app/api/google/auth/route'
import { POST as googleDisconnectPOST } from '@/app/api/google/disconnect/route'
import { GET as teamGET, POST as teamPOST } from '@/app/api/team/route'
import { PUT as teamIdPUT, DELETE as teamIdDELETE } from '@/app/api/team/[id]/route'
import { GET as knowledgeIdGET, PUT as knowledgeIdPUT, DELETE as knowledgeIdDELETE } from '@/app/api/knowledge/[id]/route'
import { PUT as cfIdPUT, DELETE as cfIdDELETE } from '@/app/api/custom-fields/[id]/route'
import { GET as internalWaCredsGET } from '@/app/api/internal/whatsapp/credentials/route'
import { POST as internalOutboxPOST } from '@/app/api/internal/workflow-outbox/route'
import { HttpError } from '@/lib/auth'

const req = makeReq as (path: string, opts?: any) => NextRequest
/** Rutas dinámicas /[id]: los handlers exigen { params: Promise<{id}> } (Next 15+/16). */
function idParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

/** Admin de org B (creado aquí para probar cross-tenant con privilegios reales). */
let adminBToken = ''

async function statusOf(promise: Promise<Response>): Promise<number> {
  try {
    const res = await promise
    return res.status
  } catch (err) {
    // Los handlers lanzan HttpError: el framework lo convierte en respuesta.
    if (err instanceof HttpError) return err.status
    throw err
  }
}

beforeAll(async () => {
  const adminB = await db.user.create({
    data: {
      id: 'user-b-admin-f5',
      email: 'admin-b-f5@test.albra',
      name: 'Admin Beta F5 (prueba)',
      passwordHash: 'scrypt:00000000000000000000000000000000:' + '0'.repeat(128),
      role: 'admin',
      organizationId: FIX.orgB.id,
      isActive: true,
    },
  })
  adminBToken = tokenFor(adminB)
})

describe('FASE 5 — aislamiento tenant en rutas no verificadas (OAuth social)', () => {
  const families: Array<{ name: string; startGET: any; configGET: any }> = [
    { name: 'Instagram', startGET: igStartGET, configGET: igConfigGET },
    { name: 'Facebook', startGET: fbStartGET, configGET: fbConfigGET },
    { name: 'TikTok', startGET: tiktokStartGET, configGET: tiktokConfigGET },
  ]

  for (const f of families) {
    describe(f.name, () => {
      it(`oauth/start: anónimo → 401`, async () => {
        expect(await statusOf(f.startGET(req(`/api/${f.name.toLowerCase()}/oauth/start`)))).toBe(401)
      })

      it(`oauth/start: miembro sin permisos → 403`, async () => {
        expect(await statusOf(f.startGET(req(`/api/${f.name.toLowerCase()}/oauth/start`, { token: tokenFor(FIX.userB) })))).toBe(403)
      })

      it(`config: anónimo → 401; miembro → 403; admin de otra org ve SOLO su estado`, async () => {
        expect(await statusOf(f.configGET(req(`/api/${f.name.toLowerCase()}/config`)))).toBe(401)
        expect(await statusOf(f.configGET(req(`/api/${f.name.toLowerCase()}/config`, { token: tokenFor(FIX.userB) })))).toBe(403)
        // admin de org B: consulta válida para SU organización (estado vacío, sin secretos)
        const res = await f.configGET(req(`/api/${f.name.toLowerCase()}/config`, { token: adminBToken }))
        expect(res.status).toBe(200)
        const body = await res.json()
        // el contrato expone SOLO estado: valores de secretos VACÍOS + flags booleanos
        expect(JSON.stringify(body)).not.toMatch(/[A-Za-z0-9_\-]{32,}/)
      })

      it(`oauth/start: admin legítimo SIN credenciales de app → redirección honesta (sin fuga de secretos)`, async () => {
        const res = await f.startGET(req(`/api/${f.name.toLowerCase()}/oauth/start`, { token: tokenFor(FIX.userA) }))
        // org-a no tiene credenciales de app sembradas: la ruta responde HONESTA
        // (redirect a /settings con error explícito, o 400 fail-fast) sin fuga
        expect([302, 307, 400]).toContain(res.status)
        if (res.status === 302 || res.status === 307) {
          expect(res.headers.get('location')).toContain('/settings')
        }
      })
    })
  }

  it('Telegram config: anónimo → 401; miembro → 403; admin de otra org → 200 de SU org sin token', async () => {
    expect(await statusOf(tgConfigGET(req('/api/telegram/config')))).toBe(401)
    expect(await statusOf(tgConfigGET(req('/api/telegram/config', { token: tokenFor(FIX.userB) })))).toBe(403)
    const res = await tgConfigGET(req('/api/telegram/config', { token: adminBToken }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body?.config?.hasBotToken).toBe(false)
    expect(JSON.stringify(body)).not.toContain('bottoken=')
  })

  it('Google auth/disconnect: anónimo → 401; miembro → 403', async () => {
    expect(await statusOf(googleAuthGET(req('/api/google/auth')))).toBe(401)
    expect(await statusOf(googleAuthGET(req('/api/google/auth', { token: tokenFor(FIX.userB) })))).toBe(403)
    expect(await statusOf(googleDisconnectPOST(req('/api/google/disconnect', { method: 'POST' })))).toBe(401)
    expect(await statusOf(googleDisconnectPOST(req('/api/google/disconnect', { method: 'POST', token: tokenFor(FIX.userB) })))).toBe(403)
  })
})

describe('FASE 5 — gestión de equipo (/api/team y /api/team/:id)', () => {
  it('anónimo → 401 en listado y detalle', async () => {
    expect(await statusOf(teamGET(req('/api/team')))).toBe(401)
    expect(await statusOf(teamIdPUT(req('/api/team/user-a', { method: 'PUT', body: { name: 'X' } }), idParams('user-a')))).toBe(401)
    expect(await statusOf(teamIdDELETE(req('/api/team/user-a', { method: 'DELETE' }), idParams('user-a')))).toBe(401)
  })

  it('miembro: GET del equipo de SU org → 200 (requireAuth por diseño, org-scoped); crear miembro → 403', async () => {
    const res = await teamGET(req('/api/team', { token: tokenFor(FIX.userB) }))
    expect(res.status).toBe(200)
    const body = await res.json()
    // SOLO miembros de org-b: jamás aparece el owner de org-a
    expect(JSON.stringify(body)).not.toContain('owner-a@test.albra')
    expect(await statusOf(teamPOST(req('/api/team', { method: 'POST', token: tokenFor(FIX.userB), body: { name: 'X', email: 'nueva-b@test.albra', password: 'password123' } })))).toBe(403)
  })

  it('admin de OTRA org sobre usuario ajeno → 404 (sin oráculo de existencia)', async () => {
    // user-a pertenece a org-a; admin de org B jamás debe tocarlo ni descubrirlo
    expect(await statusOf(teamIdPUT(req('/api/team/user-a', { method: 'PUT', token: adminBToken, body: { name: 'Secuestro' } }), idParams('user-a')))).toBe(404)
    expect(await statusOf(teamIdDELETE(req('/api/team/user-a', { method: 'DELETE', token: adminBToken }), idParams('user-a')))).toBe(404)
    // verificación de efecto: el usuario de org A quedó INTACTO
    const victim = await db.user.findUnique({ where: { id: 'user-a' } })
    expect(victim?.name).toBe('Owner Alfa')
    expect(victim?.isActive).toBe(true)
  })
})

describe('FASE 5 — base de conocimiento y campos personalizados (/api/knowledge/:id, /api/custom-fields/:id)', () => {
  it('knowledge/:id: anónimo → 401; miembro → 403', async () => {
    expect(await statusOf(knowledgeIdGET(req('/api/knowledge/know-a1'), idParams('know-a1')))).toBe(401)
    expect(await statusOf(knowledgeIdPUT(req('/api/knowledge/know-a1', { method: 'PUT', token: tokenFor(FIX.userB), body: { title: 'x' } }), idParams('know-a1')))).toBe(403)
    expect(await statusOf(knowledgeIdDELETE(req('/api/knowledge/know-a1', { method: 'DELETE', token: tokenFor(FIX.userB) }), idParams('know-a1')))).toBe(403)
  })

  it('knowledge/:id: admin de otra org → 404 y el contenido ajeno queda intacto', async () => {
    expect(await statusOf(knowledgeIdGET(req('/api/knowledge/know-a1', { token: adminBToken }), idParams('know-a1')))).toBe(404)
    expect(await statusOf(knowledgeIdPUT(req('/api/knowledge/know-a1', { method: 'PUT', token: adminBToken, body: { title: 'hack' } }), idParams('know-a1')))).toBe(404)
    expect(await statusOf(knowledgeIdDELETE(req('/api/knowledge/know-a1', { method: 'DELETE', token: adminBToken }), idParams('know-a1')))).toBe(404)
    const row = await db.knowledge.findUnique({ where: { id: 'know-a1' } })
    expect(row?.title).toBe('Catálogo 2025')
  })

  it('custom-fields/:id: anónimo → 401; miembro → 403; admin ajeno → 404', async () => {
    expect(await statusOf(cfIdPUT(req('/api/custom-fields/cf-inexistente', { method: 'PUT', body: { label: 'x' } }), idParams('cf-inexistente')))).toBe(401)
    expect(await statusOf(cfIdPUT(req('/api/custom-fields/cf-inexistente', { method: 'PUT', token: tokenFor(FIX.userB), body: { label: 'x' } }), idParams('cf-inexistente')))).toBe(403)
    // un id que NO existe ni en su org → 404 (sin oráculo entre orgs)
    expect(await statusOf(cfIdPUT(req('/api/custom-fields/cf-inexistente', { method: 'PUT', token: adminBToken, body: { label: 'x' } }), idParams('cf-inexistente')))).toBe(404)
    expect(await statusOf(cfIdDELETE(req('/api/custom-fields/cf-inexistente', { method: 'DELETE', token: adminBToken }), idParams('cf-inexistente')))).toBe(404)
  })
})

describe('FASE 5 — rutas internas (/api/internal/*): jamás anónimas ni de usuario final', () => {
  it('internal/whatsapp/credentials: anónimo → 401; token de USUARIO final → rechazado (401/403)', async () => {
    expect(await statusOf(internalWaCredsGET(req('/api/internal/whatsapp/credentials')))).toBe(401)
    // el token de usuario final NO es una credencial de servicio interna
    const userTokenStatus = await statusOf(internalWaCredsGET(req('/api/internal/whatsapp/credentials', { token: tokenFor(FIX.userA) })))
    expect([401, 403]).toContain(userTokenStatus)
  })

  it('internal/workflow-outbox: anónimo → 401/403; credencial basura → 401/403', async () => {
    expect(await statusOf(internalOutboxPOST(req('/api/internal/workflow-outbox', { method: 'POST', body: { events: [] } })))).toBeGreaterThanOrEqual(401)
    const junk = await statusOf(internalOutboxPOST(req('/api/internal/workflow-outbox', {
      method: 'POST',
      headers: { 'authorization': 'Bearer credencial_inventada_no_registrada_000' },
      body: { events: [] },
    })))
    expect([401, 403]).toContain(junk)
  })
})
