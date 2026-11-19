'use client'

/**
 * outbox-page.tsx — Reconciliación operable de envíos UNCERTAIN (M8 del plan
 * definitivo CRM-ALBRA v2.0).
 *
 * El operador (admin) resuelve una intención `unknown` en minutos sin SQL:
 * lista los inciertos de SU organización, exige confirmación de verificación
 * en el proveedor (providerChecked) y una nota de evidencia que queda
 * auditada en ChannelConnectionEvent. Nunca reintenta automáticamente.
 */

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertTriangle, RefreshCw, Loader2, Inbox as InboxIcon, ShieldAlert, CheckCircle2, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

interface UncertainItem {
  id: string
  body: string
  channel: string
  connectionName: string | null
  contact: string
  contactName: string | null
  conversationId: string
  connectionStatus: string | null
  errorCode: string | null
  attemptCount: number
  createdAt: string
  finishedAt: string | null
}

type Resolution = 'sent' | 'failed'

function formatMoment(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d)
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', telegram: 'Telegram', instagram: 'Instagram',
  facebook: 'Messenger', tiktok: 'TikTok',
}

export function OutboxReconciliationPage() {
  const [items, setItems] = useState<UncertainItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [target, setTarget] = useState<UncertainItem | null>(null)
  const [resolution, setResolution] = useState<Resolution>('sent')
  const [providerChecked, setProviderChecked] = useState(false)
  const [evidence, setEvidence] = useState('')
  const [providerMessageId, setProviderMessageId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const res = await api.getUncertainOutbound() as { uncertain?: UncertainItem[] }
      setItems(res.uncertain ?? [])
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : 'No se pudo cargar la lista de inciertos')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(true)
    const t = setInterval(() => { void load(true) }, 20_000)
    return () => clearInterval(t)
  }, [load])

  const openDialog = (item: UncertainItem) => {
    setTarget(item)
    setResolution('sent')
    setProviderChecked(false)
    setEvidence('')
    setProviderMessageId('')
  }

  const submit = async () => {
    if (!target) return
    if (!providerChecked) {
      toast.error('Confirma que ya verificaste el estado en el proveedor')
      return
    }
    if (evidence.trim().length < 10) {
      toast.error('La evidencia es obligatoria (mínimo 10 caracteres): describe qué comprobaste')
      return
    }
    setSubmitting(true)
    try {
      await api.reconcileUncertainOutbound(target.id, {
        resolution,
        providerChecked: true,
        evidence: evidence.trim(),
        ...(providerMessageId.trim() ? { providerMessageId: providerMessageId.trim() } : {}),
      })
      toast.success(`Intención conciliada como ${resolution === 'sent' ? 'ENVIADA' : 'FALLIDA'} y auditada`)
      setTarget(null)
      await load(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo conciliar la intención')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Reconciliación de envíos inciertos</h1>
            <p className="text-xs text-slate-500">
              Resuelve mensajes con resultado desconocido usando la evidencia del proveedor. Sin SQL, con auditoría.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Actualizar
        </Button>
      </div>

      {/* Política */}
      <Card className="border-0 shadow-sm bg-amber-50/60">
        <CardContent className="p-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-800">
            <p className="font-semibold mb-0.5">Política de conciliación</p>
            <p>
              Un envío <span className="font-mono">unknown</span> jamás se reintenta automáticamente (cero duplicados,
              cero mensajes perdidos). Para resolverlo debes comprobar el estado en el proveedor y registrar la
              evidencia: el caso queda auditado con tu usuario y la hora.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      {loading ? (
        [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
      ) : items.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">Sin envíos inciertos</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Cuando un envío quede con resultado desconocido (timeout o corte tras enviar), aparecerá aquí para
              que lo resuelvas con la evidencia del proveedor.
            </p>
          </CardContent>
        </Card>
      ) : (
        items.map((item) => (
          <Card key={item.id} className="border-0 border-l-4 border-l-amber-500 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-slate-100 text-slate-600 border-slate-200">
                      {CHANNEL_LABEL[item.channel] ?? item.channel}
                    </Badge>
                    <span className="text-sm font-bold text-slate-900">
                      {item.contactName || item.contact}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-amber-50 text-amber-700 border-amber-200">
                      unknown
                    </Badge>
                    {item.connectionName && <span className="text-[10px] text-slate-400">vía {item.connectionName}</span>}
                  </div>
                  <p className="text-sm text-slate-600 mt-1.5 line-clamp-2">{item.body}</p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[11px] text-slate-400">
                    <span>Creado: {formatMoment(item.createdAt)}</span>
                    <span>Cortado: {formatMoment(item.finishedAt)}</span>
                    <span>Intentos: {item.attemptCount}</span>
                    {item.errorCode && <span className="font-mono">{item.errorCode}</span>}
                    <span className="font-mono">ID: {item.id}</span>
                  </div>
                </div>
                <Button
                  size="sm" className="h-8 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0"
                  onClick={() => openDialog(item)}
                >
                  <XCircle className="w-3.5 h-3.5" /> Resolver
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Dialog de resolución */}
      <Dialog open={!!target} onOpenChange={(open) => { if (!open) setTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Resolver envío incierto</DialogTitle>
            <DialogDescription className="text-xs">
              {target?.contactName || target?.contact} · {CHANNEL_LABEL[target?.channel ?? ''] ?? target?.channel}
              {` · "${target?.body.slice(0, 80)}..."`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setResolution('sent')}
                className={`rounded-lg border p-2.5 text-left transition-colors ${resolution === 'sent' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <CheckCircle2 className={`w-4 h-4 mb-1 ${resolution === 'sent' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <p className="text-xs font-semibold text-slate-800">Sí llegó</p>
                <p className="text-[10px] text-slate-500">El proveedor confirma la entrega</p>
              </button>
              <button
                onClick={() => setResolution('failed')}
                className={`rounded-lg border p-2.5 text-left transition-colors ${resolution === 'failed' ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <XCircle className={`w-4 h-4 mb-1 ${resolution === 'failed' ? 'text-red-600' : 'text-slate-400'}`} />
                <p className="text-xs font-semibold text-slate-800">No llegó</p>
                <p className="text-[10px] text-slate-500">El proveedor no lo registró</p>
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={providerChecked}
                onChange={(e) => setProviderChecked(e.target.checked)}
                className="accent-emerald-600"
              />
              Ya verifiqué el estado de este envío en el proveedor (obligatorio)
            </label>
            <div className="space-y-1">
              <Label htmlFor="ev-evidence" className="text-xs">Evidencia (queda auditada) *</Label>
              <textarea
                id="ev-evidence"
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Ej.: WhatsApp Manager muestra el mensaje entregado a las 14:32 (wamid.XXX)"
                className="w-full min-h-[70px] rounded-lg border border-slate-200 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {evidence.trim().length > 0 && evidence.trim().length < 10 && (
                <p className="text-[11px] text-red-600">Mínimo 10 caracteres.</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-provider-id" className="text-xs">ID del mensaje en el proveedor (opcional)</Label>
              <input
                id="ev-provider-id"
                value={providerMessageId}
                onChange={(e) => setProviderMessageId(e.target.value)}
                placeholder="wamid.XXX / message_id"
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setTarget(null)}>
              Cancelar
            </Button>
            <Button
              size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
              onClick={() => void submit()} disabled={submitting}
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Conciliar como {resolution === 'sent' ? 'enviado' : 'fallido'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nota para no administradores */}
      {!loading && items.length === 0 && (
        <p className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1">
          <InboxIcon className="w-3 h-3" /> Lista automática: se refresca cada 20 s.
        </p>
      )}
    </div>
  )
}
