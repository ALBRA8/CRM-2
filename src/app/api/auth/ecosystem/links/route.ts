import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handle, json } from '../../../_lib/shared'
import { buildEcosystemLink } from '@/lib/ecosystem-sso'

/**
 * GET /api/auth/ecosystem/links — acceso directo al ecosistema (2026-11-17).
 *
 * Devuelve enlaces de UN SOLO USO para abrir las capas del ecosistema con
 * sesión de operador, sin volver a introducir credenciales:
 *  - whatspower: WHATSPOWER (capa 2A) → /studio/login-ecosystem
 *  - ultra: WHATSPOWER-ULTRA (capa 2B) → /studio/login-ecosystem
 *
 * Reglas:
 *  - Requiere sesión CRM válida (demo o real): el enlace se emite SOLO a
 *    usuarios autenticados.
 *  - Fail-closed: sin ECOSYSTEM_SSO_SECRET o sin la URL del studio
 *    (WHATSPOWER_STUDIO_URL / ULTRA_STUDIO_URL) el enlace se declara
 *    `available:false` y JAMÁS se emite un token que nadie podría canjear.
 *  - Los tokens viven 90 s y el receptor los canjea una sola vez (HMAC-SHA256,
 *    timing-safe; ver src/lib/ecosystem-sso.ts y el módulo gemelo en 2A/2B).
 *  - No altera el login-demo anónimo ni los logins clásicos de cada studio.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAuth(req)
    const secret = process.env.ECOSYSTEM_SSO_SECRET
    return json({
      whatspower: buildEcosystemLink(process.env.WHATSPOWER_STUDIO_URL, secret),
      ultra: buildEcosystemLink(process.env.ULTRA_STUDIO_URL, secret),
    })
  })
}
