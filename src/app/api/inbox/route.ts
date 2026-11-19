import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handle, json, parseIntParam } from '@/lib/api-helpers'
import {
  listInbox, listInboxAccounts, getInboxMessages, markInboxRead, parseInboxKey, INBOX_CHANNELS,
} from '@/lib/inbox'

/**
 * GET /api/inbox            — lista unificada de conversaciones (WA + TG + IG + FB + TikTok)
 *                             con filtros F3: channel, connection (cuenta) y q (búsqueda).
 * GET /api/inbox?key=...    — mensajes de una conversación + marca como leída.
 *
 * La key es "wa:<convId>" | "tg:<clientId>" | "ig:<clientId>" | "fb:<clientId>" |
 * "cc:<convId>" (parseo estricto, fail-closed). Todo aislado por organizationId
 * de la sesión JWT.
 *
 * Filtros (F3, plan definitivo fase 3):
 *  - channel=whatsapp|telegram|instagram|facebook|tiktok (allowlist; otro valor → 400)
 *  - connection=<displayName de la cuenta conectada> (solo filas canónicas de esa cuenta)
 *  - q=<texto libre> — busca por nombre, teléfono (normalizado a dígitos) y último mensaje
 * Los filtros se aplican DESPUÉS del dedup M7: filtrado nunca muestra duplicados.
 * Ventana: los filtros operan sobre la ventana cargada (limit 1..200).
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const auth = await requireAuth(req)
    const key = req.nextUrl.searchParams.get('key')

    if (!key) {
      const limit = parseIntParam(req, 'limit', 100, 1, 200)
      const channel = req.nextUrl.searchParams.get('channel') || undefined
      const connection = req.nextUrl.searchParams.get('connection') || undefined
      const q = req.nextUrl.searchParams.get('q') || undefined
      if (channel && !(INBOX_CHANNELS as readonly string[]).includes(channel.trim().toLowerCase())) {
        return json({ error: `Canal inválido; permitidos: ${INBOX_CHANNELS.join(', ')}` }, { status: 400 })
      }
      const [conversations, accounts] = await Promise.all([
        listInbox(auth.orgId, limit, { channel, connection, q }),
        listInboxAccounts(auth.orgId),
      ])
      return json({ conversations, accounts })
    }

    if (!parseInboxKey(key)) {
      return json({ error: 'Conversación inválida' }, { status: 400 })
    }

    const [messages] = await Promise.all([
      getInboxMessages(auth.orgId, key),
      markInboxRead(auth.orgId, key),
    ])
    return json({ messages })
  })
}
