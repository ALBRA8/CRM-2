import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handle, json, parseIntParam } from '@/lib/api-helpers'
import {
  listInboxPage, getInboxMessages, markInboxRead, parseInboxKey, parseInboxFilters,
} from '@/lib/inbox'

/**
 * GET /api/inbox            — bandeja única paginada (M7 dedup + F3 filtros):
 *                             channel=whatsapp|telegram|instagram|facebook|tiktok,
 *                             account=<displayName de la conexión>, search=<texto>,
 *                             limit (1-200, default 50), offset (>=0).
 *                             Devuelve { conversations, suppressedCount, hasMore }.
 * GET /api/inbox?key=...    — mensajes de una conversación + marca como leída.
 *
 * La key es "wa:<convId>" | "tg:<clientId>" | "ig:<clientId>" | "cc:<id>"
 * (parseo estricto, fail-closed). Todo aislado por organizationId de la sesión
 * JWT. Los filtros nuevos son ADITIVOS: sin params el comportamiento es el de
 * la bandeja única con dedup y página por defecto.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const auth = await requireAuth(req)
    const sp = req.nextUrl.searchParams
    const key = sp.get('key')

    if (!key) {
      const filters = parseInboxFilters({
        channel: sp.get('channel'),
        account: sp.get('account'),
        search: sp.get('search'),
      })
      const result = await listInboxPage(auth.orgId, {
        ...filters,
        limit: parseIntParam(req, 'limit', 50, 1, 200),
        offset: parseIntParam(req, 'offset', 0, 0, 10_000),
      })
      return json(result)
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
