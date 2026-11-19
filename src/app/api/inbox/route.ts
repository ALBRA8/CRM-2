import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handle, json, parseIntParam } from '@/lib/api-helpers'
import { listInbox, getInboxMessages, markInboxRead, parseInboxKey, type InboxChannel, type InboxFilters } from '@/lib/inbox'

/**
 * GET /api/inbox            — lista unificada de conversaciones (WA + TG + IG + FB + TT).
 * GET /api/inbox?key=...    — mensajes de una conversación + marca como leída.
 *
 * (F3 / F3-T04) El listado acepta filtros server-side ANTES del recorte por
 * límite, para que la ventana siempre esté llena de resultados que cumplen:
 *   ?channel=whatsapp|telegram|instagram|facebook|tiktok
 *   ?connection=<ChannelConnection id>   (cuenta conectada; solo canónicas)
 *   ?q=<búsqueda libre>                  (contacto, handle y último mensaje;
 *                                         sin acentos y case-insensitive)
 *   ?limit=1..200                        (default 100)
 *
 * La key es "cc:<convId>" | "wa:<convId>" | "tg:<clientId>" | "ig:<clientId>"
 * | "fb:<clientId>" (parseo estricto, fail-closed). Todo aislado por
 * organizationId de la sesión JWT.
 */

const CHANNELS: readonly InboxChannel[] = ['whatsapp', 'telegram', 'instagram', 'facebook', 'tiktok'] as const

function safeParam(value: string | null, maxLen: number): string {
  if (!value || typeof value !== 'string') return ''
  return value.slice(0, maxLen)
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const auth = await requireAuth(req)
    const key = req.nextUrl.searchParams.get('key')

    if (!key) {
      const limit = parseIntParam(req, 'limit', 100, 1, 200)

      // (F3) Filtros server-side. Un canal desconocido es 400 (fail-closed,
      // mismo espíritu que el parseo estricto de keys): el frontend solo
      // envía canales de la lista.
      const rawChannel = safeParam(req.nextUrl.searchParams.get('channel'), 20)
      let channel: InboxChannel | undefined
      if (rawChannel) {
        if (!CHANNELS.includes(rawChannel as InboxChannel)) {
          return json({ error: `Canal inválido: ${rawChannel}` }, { status: 400 })
        }
        channel = rawChannel as InboxChannel
      }
      const filters: InboxFilters = {
        ...(channel ? { channel } : {}),
        ...(safeParam(req.nextUrl.searchParams.get('connection'), 64)
          ? { connectionId: safeParam(req.nextUrl.searchParams.get('connection'), 64) }
          : {}),
        ...(safeParam(req.nextUrl.searchParams.get('q'), 100)
          ? { query: safeParam(req.nextUrl.searchParams.get('q'), 100) }
          : {}),
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
