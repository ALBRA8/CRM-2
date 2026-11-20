'use client'

/**
 * outbox-tab.tsx — (M8 / F3-T05) Salud de envíos: conciliación operable de
 * envíos UNCERTAIN para administradores de la organización.
 *
 * El operador resuelve un envío `unknown` SIN SQL manual:
 *  1. ve la lista de inciertos de SU organización (canal, cuenta, contacto,
 *     cuerpo, código del proveedor y antigüedad),
 *  2. comprueba el estado real en el proveedor (WhatsApp Manager, etc.),
 *  3. marca la casilla de verificación como evidencia y, si confirma el envío,
 *     pega el providerMessageId,
 *  4. resuelve `sent` o `failed`.
 *
 * La política de la outbox no cambia: los unknown JAMÁS se reintentan
 * automáticamente y la conciliación NUNCA hace llamadas de red; toda
 * resolución queda auditada (channelConnectionEvent, lo escribe la lib).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Inbox as InboxIcon,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

interface UncertainItem {
  id: string
  body: string
  providerErrorCode: string | null
  providerMessageId: string | null
  createdAt: string
  finishedAt: string | null
  channel: string
  contactName: string
  contactHandle: string
  connectionId: string
  connectionName: string | null
  connectionStatus: string
}

interface UncertainResponse {
  counts: { unknown: number; queued: number; sending: number; sent: number; failed: number }
  items: UncertainItem[]
}

type Resolution = 'sent' | 'failed'

/** Antigüedad legible desde finishedAt/createdAt. */
function age(iso: string | null): string {
  if (!iso) return '—'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h} h`
  return `${Math.floor(h / 24)} d`
}

export function OutboxTab() {
  const isAdmin = useAppStore((s) => s.isAdmin)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<UncertainResponse | null>(null)

  // Resolución en curso por item (evidencia + estado del botón).
  const [evidence, setEvidence] = useState<Record<string, { checked: boolean; messageId: string; resolution: Resolution | null; working: boolean }>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = (await api.getUncertainOutbox()) as UncertainResponse
      setData(res)
      setEvidence((prev) => {
        const ids = new Set(res.items.map((i) => i.id))
        const next: typeof prev = {}
        for (const [k, v] of Object.entries(prev)) if (ids.has(k)) next[k] = v
        return next
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cargar la salud de envíos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) void load()
    else setLoading(false)
  }, [load, isAdmin])

  const items = data?.items ?? []
  const counts = data?.counts

  const evidenceFor = (id: string) =>
    evidence[id] ?? { checked: false, messageId: '', resolution: null as Resolution | null, working: false }

  const setEvidenceFor = (id: string, patch: Partial<{ checked: boolean; messageId: string; resolution: Resolution | null; working: boolean }>) => {
    setEvidence((prev) => ({ ...prev, [id]: { ...evidenceFor(id), ...patch } }))
  }

  const canSubmit = useCallback(
    (item: UncertainItem) => {
      const e = evidenceFor(item.id)
      if (!e.checked || !e.resolution || e.working) return false
      if (e.resolution === 'sent' && !e.messageId.trim()) return false
      return true
    },
    [evidence]
  )

  const handleReconcile = async (item: UncertainItem) => {
    const e = evidenceFor(item.id)
    if (!canSubmit(item)) return
    setEvidenceFor(item.id, { working: true })
    try {
      await api.reconcileOutboxMessage({
        id: item.id,
        resolution: e.resolution as Resolution,
        providerChecked: true,
        providerMessageId: e.messageId.trim() || undefined,
      })
      toast.success(`Envío conciliado como ${e.resolution === 'sent' ? 'ENVIADO' : 'FALLIDO'} (quedó auditado)`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo conciliar')
      setEvidenceFor(item.id, { working: false })
    }
  }

  const pendingCount = useMemo(() => items.length, [items])

  if (!isAdmin) {
    return (
      <div className="space-y-6 mt-4">
        <Card className="border-0 shadow-sm bg-slate-50/60">
          <CardContent className="p-5 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-slate-400" />
            <p className="text-sm text-slate-500">La conciliación de envíos es una operación de administrador.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 mt-4">
      {/* Resumen de la outbox de la organización */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <InboxIcon className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Salud de envíos</CardTitle>
                <CardDescription>
                  Estado de la outbox de tu organización. Los inciertos nunca se reintentan solos: se concilian aquí, con evidencia.
                </CardDescription>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refrescar
            </Button>
          </div>
        </CardHeader>
        {counts && (
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              {[
                { label: 'En cola', value: counts.queued, tone: 'text-sky-600' },
                { label: 'Enviando', value: counts.sending, tone: 'text-violet-600' },
                { label: 'Enviados', value: counts.sent, tone: 'text-emerald-600' },
                { label: 'Fallidos', value: counts.failed, tone: 'text-slate-500' },
                { label: 'Inciertos', value: counts.unknown, tone: counts.unknown > 0 ? 'text-rose-600' : 'text-slate-400' },
              ].map((c) => (
                <div key={c.label} className="rounded-lg bg-slate-50 px-2 py-3">
                  <p className={`text-lg font-bold ${c.tone}`}>{c.value}</p>
                  <p className="text-[13px] text-slate-500">{c.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Inciertos */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Envíos con resultado incierto {pendingCount > 0 && <Badge className="ml-1 bg-rose-100 text-rose-700">{pendingCount}</Badge>}
          </CardTitle>
          <CardDescription>
            Comprueba el estado en el proveedor (WhatsApp/Instagram Manager), marca la verificación y resuelve.
            Toda resolución queda auditada con tu sesión.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No hay envíos inciertos. Si un envío no llega, revisa primero “Fallidos” y la conexión del canal.
            </div>
          ) : (
            items.map((item) => {
              const e = evidenceFor(item.id)
              return (
                <div key={item.id} className="rounded-xl border border-slate-100 bg-white p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-900">{item.contactName}</span>
                        <Badge variant="outline" className="text-[13px] text-slate-400">{item.channel}</Badge>
                        {item.connectionName && <Badge variant="outline" className="text-[13px] text-slate-500">{item.connectionName}</Badge>}
                        <span className="text-[13px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> hace {age(item.finishedAt || item.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{item.body}</p>
                      <p className="text-[13px] text-slate-400 mt-0.5">
                        {item.contactHandle} · {item.providerErrorCode || 'sin código de error'}
                        {item.providerMessageId ? ` · ref proveedor: ${item.providerMessageId}` : ''}
                      </p>
                    </div>
                    {item.connectionStatus !== 'connected' && (
                      <span className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> cuenta desconectada
                      </span>
                    )}
                  </div>

                  {/* Evidencia del operador */}
                  <div className="rounded-lg bg-slate-50/80 border border-slate-100 p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setEvidenceFor(item.id, { resolution: 'sent' })}
                        className={cnBtn(e.resolution === 'sent')}
                        type="button"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Sí llegó (sent)
                      </button>
                      <button
                        onClick={() => setEvidenceFor(item.id, { resolution: 'failed' })}
                        className={cnBtn(e.resolution === 'failed')}
                        type="button"
                      >
                        <XCircle className="w-3.5 h-3.5" /> No llegó (failed)
                      </button>
                    </div>
                    <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={e.checked}
                        onChange={(ev) => setEvidenceFor(item.id, { checked: ev.target.checked })}
                        className="mt-0.5"
                      />
                      Verifiqué el estado REAL del mensaje en el proveedor (obligatorio para conciliar)
                    </label>
                    {e.resolution === 'sent' && (
                      <div className="space-y-1">
                        <Input
                          value={e.messageId}
                          onChange={(ev) => setEvidenceFor(item.id, { messageId: ev.target.value.slice(0, 256) })}
                          placeholder="Identificador del mensaje en el proveedor (evidencia obligatoria para 'sent')"
                          className="h-8 text-xs font-mono"
                        />
                        <p className="text-[13px] text-slate-400">
                          Con esta evidencia el hilo del cliente queda actualizado sin duplicar el mensaje.
                        </p>
                      </div>
                    )}
                    {e.resolution === 'failed' && (
                      <p className="text-[13px] text-slate-400">
                        Se registra como no enviado (no se reintenta automáticamente). Podrás volver a escribirle desde la Bandeja.
                      </p>
                    )}
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => handleReconcile(item)}
                        disabled={!canSubmit(item)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {e.working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        Conciliar
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Estilo compartido de los botones de resolución. */
function cnBtn(active: boolean): string {
  return [
    'px-2.5 py-1 rounded-full text-[13px] font-medium border transition-colors flex items-center gap-1',
    active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100',
  ].join(' ')
}
