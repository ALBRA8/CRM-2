import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handle, json, parseIntParam } from '@/lib/api-helpers'
import { listInbox, getInboxMessages, markInboxRead, parseInboxKey, type InboxChannel, type InboxFilters } from '@/lib/inbox'

/**
 * GET /api/inbox            — lista unificada de conversaciones (WA + TG + IG + FB + TT).
 * GET /api/inbox?key=...    — mensajes de una conversación + marca como leída.
 *
 * Filtros (F3-T04): ?channel=whatsapp|telegram|instagram|facebook|tiktok
 *                   ?connection=<ChannelConnectionId>
 *                   ?search=<texto libre sobre nombre/teléfono/último mensaje>
 *                   ?limit=1..200 (paginación)
 *
 * La key es "wa:<convId>" | "tg:<clientId>" | "ig:<clientId>" | "cc:<convId>"
 * (parseo estricto, fail-closed). Todo aislado por organizationId de la sesión
 * JWT; un contacto aparece UNA sola vez (criterio de unificación F3-T03).
 */

const VALID_CHANNELS: InboxChannel[] = ['whatsapp', 'telegram', 'instagram', 'facebook', 'tiktok']

export async function GET(req: NextRequest) {
  return handle(async () => {
    const auth = await requireAuth(req)
    const params = req.nextUrl.searchParams
    const key = params.get('key')

    if (!key) {
      const limit = parseIntParam(req, 'limit', 100, 1, 200)
      const channelParam = params.get('channel')
      if (channelParam && !VALID_CHANNELS.includes(channelParam as InboxChannel)) {
        return json({ error: `Canal no válido: ${channelParam}` }, { status: 400 })
      }
      const connectionParam = params.get('connection')
      if (connectionParam && (connectionParam.length > 64 || /[^A-Za-z0-9_-]/.test(connectionParam))) {
        return json({ error: 'Identificador de conexión no válido' }, { status: 400 })
      }
      const searchParam = params.get('search')
      if (searchParam && searchParam.length > 100) {
        return json({ error: 'Búsqueda demasiado larga (máximo 100 caracteres)' }, { status: 400 })
      }
      const filters: InboxFilters = {
        channel: (channelParam as InboxChannel) || null,
        connectionId: connectionParam || null,
        search: searchParam?.trim() || null,
      }
      const conversations = await listInbox(auth.orgId, limit, filters)
      return json({ conversations })
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
