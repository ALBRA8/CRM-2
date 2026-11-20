'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Inbox as InboxIcon, MessageCircle, Send as SendIcon, Instagram, RefreshCw, Loader2, Mic, Music2, Search, Building2, X, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { notifyError } from '@/components/ui/error-alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { useAppStore } from '@/lib/store'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { InboxConversation, InboxMessage } from '@/lib/inbox'

/**
 * Bandeja omnicanal (Fase 4): WhatsApp + Telegram + Instagram + Messenger + TikTok en una sola vista.
 * Dos paneles (lista + hilo) en desktop; en móvil se alterna lista/hilo.
 * Polling cada 12s; envío por el canal de cada conversación vía /api/inbox/send.
 *
 * (F3 / F3-T04) Los filtros por canal, cuenta conectada y búsqueda libre son
 * SERVER-SIDE (antes del recorte por límite): la ventana de 100 siempre está
 * llena de resultados que cumplen. El polling respeta los filtros activos.
 */

/** Icono Messenger (rayo) — lucide no lo trae (mismo SVG que settings/facebook-tab) */
function MessengerIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2C6.477 2 2 6.145 2 11.259c0 2.913 1.454 5.51 3.722 7.208V22l3.405-1.869c.899.249 1.855.383 2.873.383 5.523 0 10-4.145 10-9.255C22 6.145 17.523 2 12 2zm1.008 12.461-2.546-2.716-4.969 2.716 5.464-5.797 2.607 2.716 4.908-2.716-5.464 5.797z" />
    </svg>
  )
}

const CHANNEL_ICON = {
  whatsapp: MessageCircle,
  telegram: SendIcon,
  instagram: Instagram,
  facebook: MessengerIcon,
  tiktok: Music2,
} as const

const CHANNEL_BADGE = {
  whatsapp: 'bg-emerald-100 text-emerald-700',
  telegram: 'bg-sky-100 text-sky-700',
  instagram: 'bg-pink-100 text-pink-700',
  facebook: 'bg-blue-100 text-blue-700',
  tiktok: 'bg-slate-900 text-white',
} as const

type ChannelFilter = 'all' | InboxConversation['channel']

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d} d` : new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

export function InboxPage() {
  const [conversations, setConversations] = useState<InboxConversation[]>([])
  const [selected, setSelected] = useState<InboxConversation | null>(null)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState<ChannelFilter>('all')
  // (F3) Filtros server-side: cuenta conectada + búsqueda libre (debounce 300 ms).
  const [accountFilter, setAccountFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [knownAccounts, setKnownAccounts] = useState<{ id: string; name: string }[]>([])
  const threadRef = useRef<HTMLDivElement>(null)
  const canonicalRequestRef = useRef<{ key: string; text: string; id: string } | null>(null)

  // Debounce de la búsqueda: no golpeamos la API por cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchInput.trim().slice(0, 100)), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const buildParams = useCallback((): Record<string, string> | undefined => {
    const params: Record<string, string> = {}
    if (filter !== 'all') params.channel = filter
    if (accountFilter !== 'all') params.connection = accountFilter
    if (query) params.q = query
    return Object.keys(params).length > 0 ? params : undefined
  }, [filter, accountFilter, query])

  const loadList = useCallback(async (silent = false) => {
    if (!silent) setLoadingList(true)
    try {
      const res = (await api.getInbox(buildParams())) as { conversations?: InboxConversation[] }
      setConversations(res.conversations || [])
    } catch {
      if (!silent) toast.error('No se pudo cargar la bandeja')
    } finally {
      setLoadingList(false)
    }
  }, [buildParams])

  const openConversation = useCallback(async (conv: InboxConversation) => {
    setSelected(conv)
    setDraft('')
    setLoadingThread(true)
    try {
      const res = (await api.getInboxMessages(conv.key)) as { messages?: InboxMessage[] }
      setMessages(res.messages || [])
      // Abierta → ya no está "sin leer" en la lista local
      setConversations((prev) => prev.map((c) => (c.key === conv.key ? { ...c, unreadCount: 0 } : c)))
    } catch {
      toast.error('No se pudo cargar la conversación')
    } finally {
      setLoadingThread(false)
    }
  }, [])

  // Re-carga cuando cambian los filtros server-side (canal, cuenta, búsqueda).
  useEffect(() => {
    loadList()
  }, [loadList])

  // Catálogo de cuentas conectadas para el selector: se aprende de las cargas
  // SIN filtro de cuenta (al filtrar por una, las opciones no se encogen).
  useEffect(() => {
    if (accountFilter !== 'all') return
    const seen = new Map<string, string>()
    for (const c of conversations) {
      if (c.connectionId && c.connectionName) seen.set(c.connectionId, c.connectionName)
    }
    if (seen.size === 0) return
    setKnownAccounts((prev) => {
      const merged = new Map(prev.map((a) => [a.id, a.name]))
      for (const [id, name] of seen) merged.set(id, name)
      return [...merged].map(([id, name]) => ({ id, name }))
    })
  }, [conversations, accountFilter])

  // Poll del hilo abierto (solo si no se está enviando)
  useEffect(() => {
    if (!selected) return
    const t = setInterval(async () => {
      if (sending) return
      try {
        const res = (await api.getInboxMessages(selected.key)) as { messages?: InboxMessage[] }
        setMessages(res.messages || [])
      } catch {
        /* silencioso */
      }
    }, 12000)
    return () => clearInterval(t)
  }, [selected, sending])

  // Poll silencioso que respeta los filtros activos (mismo loadList que la carga inicial).
  useEffect(() => {
    const t = setInterval(() => loadList(true), 12000)
    return () => clearInterval(t)
  }, [loadList])

  // Auto-scroll al último mensaje
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // (F3) El servidor ya aplica canal + cuenta + búsqueda ANTES del recorte:
  // la lista que llega está lista para mostrar.
  const filtered = conversations

  const hasActiveFilters = filter !== 'all' || accountFilter !== 'all' || query.length > 0

  function resetFilters() {
    setFilter('all')
    setAccountFilter('all')
    setSearchInput('')
    setQuery('')
  }

  const totalUnread = useMemo(() => conversations.reduce((acc, c) => acc + c.unreadCount, 0), [conversations])

  async function handleSend() {
    if (!selected || !draft.trim() || sending) return
    // Solo conversaciones canónicas de canales soportados pueden encolarse.
    if (!selected.key.startsWith('cc:')) return
    if (selected.channel !== 'whatsapp' && selected.channel !== 'instagram' && selected.channel !== 'tiktok') return
    setSending(true)
    const optimistic: InboxMessage = {
      id: `tmp-${Date.now()}`,
      direction: 'out',
      senderType: 'user',
      text: draft.trim(),
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])
    const text = draft.trim()
    const canonical = selected.key.startsWith('cc:')
    let acceptedCanonical = false
    setDraft('')
    try {
      const requestId = canonical
        ? (canonicalRequestRef.current?.key === selected.key && canonicalRequestRef.current.text === text
            ? canonicalRequestRef.current.id
            : globalThis.crypto.randomUUID())
        : undefined
      if (canonical && requestId) canonicalRequestRef.current = { key: selected.key, text, id: requestId }
      await api.sendInboxMessage({
        key: selected.key,
        contactHandle: selected.contactHandle,
        clientId: selected.clientId,
        text,
        ...(requestId ? { clientRequestId: requestId } : {}),
      })
      if (canonical) {
        acceptedCanonical = true
        canonicalRequestRef.current = null
      }
      // Refresca el hilo real; en canonical muestra estado de outbox, no simula entrega.
      const res = (await api.getInboxMessages(selected.key)) as { messages?: InboxMessage[] }
      setMessages(res.messages || [])
      if (canonical) {
        toast.info('Mensaje guardado en cola. Todavía no se ha enviado al proveedor.')
      } else {
        setConversations((prev) =>
          prev.map((c) => (c.key === selected.key ? { ...c, lastMessage: text, lastMessageAt: optimistic.createdAt, lastMessageFrom: 'out' } : c))
        )
      }
    } catch (err) {
      if (canonical && acceptedCanonical) {
        toast.info('El mensaje quedó en cola; no se pudo actualizar el hilo. Actualiza para consultar su estado.')
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        setDraft(text)
        notifyError({ message: err instanceof Error ? err.message : undefined }, 'No se pudo enviar el mensaje')
      }
    } finally {
      setSending(false)
    }
  }

  const filters: Array<{ id: ChannelFilter; label: string }> = [
    { id: 'all', label: 'Todas' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'telegram', label: 'Telegram' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'facebook', label: 'Messenger' },
    { id: 'tiktok', label: 'TikTok' },
  ]

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 md:px-8 py-4 border-b border-slate-100">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Bandeja</h1>
          <p className="text-xs text-slate-500">
            WhatsApp · Telegram · Instagram · Messenger · TikTok {totalUnread > 0 ? `— ${totalUnread} sin leer` : '— todo al día'}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="text-slate-500 h-8 w-8 p-0" onClick={() => loadList()} title="Actualizar">
          {loadingList ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      <div className="flex-1 min-h-0 grid md:grid-cols-[340px_1fr]">
        {/* Lista de conversaciones */}
        <div className={cn('border-r border-slate-100 flex flex-col min-h-0', selected && 'hidden md:flex')}>
          <div className="flex flex-col gap-2 p-3 border-b border-slate-50">
            {/* (F3) Búsqueda libre + cuenta conectada — server-side */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Buscar contacto, número o mensaje…"
                  className="h-8 text-xs pl-8 pr-7 bg-white"
                />
                {searchInput && (
                  <button
                    onClick={() => setSearchInput('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    title="Limpiar búsqueda"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {knownAccounts.length > 0 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <Select value={accountFilter} onValueChange={setAccountFilter}>
                    <SelectTrigger className="h-8 text-xs w-[120px] bg-white">
                      <SelectValue placeholder="Cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las cuentas</SelectItem>
                      {knownAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {filters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[13px] font-medium transition-colors',
                    filter === f.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {f.label}
                </button>
              ))}
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="px-2.5 py-1 rounded-full text-[13px] font-medium bg-slate-800 text-white hover:bg-slate-700 transition-colors"
                  title="Quitar todos los filtros"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {loadingList ? (
              <div className="p-8 text-center">
                <Loader2 className="w-6 h-6 text-slate-300 mx-auto animate-spin" />
                <p className="text-xs text-slate-400 mt-2">Cargando conversaciones…</p>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                size="sm"
                icon={InboxIcon}
                title="Sin conversaciones aún"
                description="Los mensajes de WhatsApp, Telegram, Instagram, Messenger y TikTok aparecerán aquí"
                action={{
                  label: 'Conectar un número',
                  icon: QrCode,
                  onClick: () => {
                    window.history.replaceState(null, '', '/settings?tab=whatsapp')
                    useAppStore.getState().setView('settings')
                  },
                }}
              />
            ) : (
              filtered.map((conv) => {
                const Icon = CHANNEL_ICON[conv.channel]
                return (
                  <button
                    key={conv.key}
                    onClick={() => openConversation(conv)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50 transition-colors',
                      selected?.key === conv.key && 'bg-emerald-50/60'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="relative flex-shrink-0">
                        <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">
                          {conv.contactName.slice(0, 2).toUpperCase()}
                        </div>
                        <span className={cn('absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center', CHANNEL_BADGE[conv.channel])}>
                          <Icon className="w-2.5 h-2.5" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-medium text-slate-900 truncate">{conv.contactName}</span>
                          {conv.connectionName && <span className="text-[13px] text-slate-400 truncate max-w-[90px] ml-1">{conv.connectionName}</span>}
                          <span className="text-[13px] text-slate-400 flex-shrink-0 ml-1">{timeAgo(conv.lastMessageAt)}</span>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className={cn('text-xs truncate', conv.lastMessageFrom === 'in' ? 'text-slate-600' : 'text-slate-400')}>
                            {conv.lastMessageFrom === 'out' && 'Tú: '}
                            {conv.lastMessage || 'Sin mensajes'}
                          </span>
                          {conv.unreadCount > 0 && (
                            <span className="ml-1 flex-shrink-0 w-4 h-4 rounded-full bg-emerald-600 text-white text-[13px] font-bold flex items-center justify-center">
                              {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Hilo de conversación */}
        <div className={cn('flex flex-col min-h-0 bg-slate-50/40', !selected && 'hidden md:flex')}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-6">
                <InboxIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-500">Selecciona una conversación</p>
                <p className="text-xs text-slate-400 mt-1">Responde a tus clientes desde un solo lugar, sin importar el canal</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 bg-white">
                <Button variant="ghost" size="sm" className="md:hidden h-7 w-7 p-0 text-slate-500" onClick={() => setSelected(null)}>
                  ←
                </Button>
                <span className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0', CHANNEL_BADGE[selected.channel])}>
                  {(() => {
                    const Icon = CHANNEL_ICON[selected.channel]
                    return <Icon className="w-3.5 h-3.5" />
                  })()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{selected.contactName}</p>
                  <p className="text-[13px] text-slate-400 truncate">
                    vía {selected.channelLabel}{selected.connectionName ? ` · ${selected.connectionName}` : ''} · {selected.contactHandle || 'sin handle'}
                  </p>
                </div>
                {selected.isAutoReply && (
                  <span className="text-[13px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">Agente IA activo</span>
                )}
              </div>

              <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2 min-h-0">
                {loadingThread ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 mt-8">Sin mensajes en esta conversación</p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={cn('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[75%] px-3 py-2 rounded-2xl text-[13px] leading-snug whitespace-pre-wrap break-words',
                          m.direction === 'out'
                            ? m.senderType === 'agent'
                              ? 'bg-amber-100 text-amber-900 rounded-br-sm'
                              : 'bg-emerald-600 text-white rounded-br-sm'
                            : 'bg-white text-slate-800 border border-slate-100 rounded-bl-sm'
                        )}
                      >
                        {m.messageType === 'voice' && (
                          <span className="flex items-center gap-1 text-[13px] font-medium text-slate-500 mb-0.5">
                            <Mic className="w-3 h-3" /> Nota de voz (transcrita)
                          </span>
                        )}
                        {m.text}
                        {m.deliveryStatus && (
                          <span className={cn(
                            'block text-[13px] mt-1 font-medium',
                            m.deliveryStatus === 'failed' || m.deliveryStatus === 'delivery_failed' ? 'text-red-200' : m.deliveryStatus === 'unknown' ? 'text-amber-200' : 'text-emerald-100'
                          )}>
                            {m.deliveryStatus === 'queued' ? 'En cola · aún no enviado' :
                              m.deliveryStatus === 'sending' ? 'En proceso de entrega' :
                              m.deliveryStatus === 'sent' ? 'Aceptado por el proveedor' :
                              m.deliveryStatus === 'delivered' ? 'Entregado' :
                              m.deliveryStatus === 'read' ? 'Leído' :
                              m.deliveryStatus === 'delivery_failed' ? 'No se pudo entregar' :
                              m.deliveryStatus === 'failed' ? 'Rechazado · no enviado' :
                              'Resultado incierto · verificar antes de reenviar'}
                          </span>
                        )}
                        <span className={cn('block text-[13px] mt-1', m.direction === 'out' ? (m.senderType === 'agent' ? 'text-amber-600' : 'text-emerald-200') : 'text-slate-400')}>
                          {m.senderType === 'agent' ? 'Agente IA · ' : ''}
                          {new Date(m.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-3 border-t border-slate-100 bg-white">
                {!selected.key.startsWith('cc:') && <p className="text-[13px] text-amber-700 mb-2">Esta conversación todavía usa el formato legacy. El envío está deshabilitado hasta migrarla a una conexión canónica.</p>}
                {selected.key.startsWith('cc:') && <p className="text-[13px] text-amber-700 mb-2">{selected.channel === 'whatsapp' || selected.channel === 'instagram' || selected.channel === 'tiktok' ? 'El mensaje se guardará en una cola segura y podrás ver su estado. El worker de entrega aún no está habilitado: no se enviará al proveedor ni se usará una cuenta legacy.' : 'El envío canónico de este canal todavía no está soportado; no se usará una cuenta legacy.'}</p>}
                <div className="flex gap-2 items-end">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    placeholder={!selected.key.startsWith('cc:') ? 'Envío deshabilitado para conversaciones legacy…' : 'Escribe para guardar en la cola (sin envío todavía)…'}
                    disabled={!selected.key.startsWith('cc:') || (selected.channel !== 'whatsapp' && selected.channel !== 'instagram' && selected.channel !== 'tiktok')}
                    className="min-h-[42px] max-h-32 resize-none text-[13px]"
                    rows={1}
                  />
                  <Button onClick={handleSend} disabled={sending || !draft.trim() || !selected.key.startsWith('cc:') || (selected.channel !== 'whatsapp' && selected.channel !== 'instagram' && selected.channel !== 'tiktok')} className="bg-emerald-600 hover:bg-emerald-700 text-white h-[42px] px-4 gap-1.5">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendIcon className="w-4 h-4" />}
                    <span className="hidden sm:inline">{selected.key.startsWith('cc:') ? 'Encolar' : 'Enviar'}</span>
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
