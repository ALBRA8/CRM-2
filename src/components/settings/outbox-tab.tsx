'use client'

/**
 * M8 — Vista de operador para la reconciliación de envíos UNCERTAIN.
 *
 * Lista los envíos `unknown` (y `sending` con intentos altos como sospechosos)
 * de la organización y permite conciliar UNO con evidencia del proveedor,
 * con la MISMA política del endpoint interno: sin evidencia no se concilia
 * (el botón queda deshabilitado) y el `unknown` jamás se reintenta solo.
 */
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  validateReconciliationEvidence, canSubmitReconciliation, resolutionLabel,
  uncertainAge, truncateBody, rowAlertLevel, type EvidenceErrors,
} from '@/lib/outbox-ui'

interface UncertainRow {
  id: string
  status: string
  body: string
  attemptCount: number
  providerErrorCode: string | null
  providerMessageId: string | null
  createdAt: string
  channel: string
  contactName: string | null
  contactHandle: string
  conversationId: string
}

export function OutboxTab() {
  const isAdmin = useAppStore((s) => s.isAdmin)

  const [rows, setRows] = useState<UncertainRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Conciliación de una fila
  const [pending, setPending] = useState<UncertainRow | null>(null)
  const [resolution, setResolution] = useState<'sent' | 'failed'>('sent')
  const [providerMessageId, setProviderMessageId] = useState('')
  const [evidence, setEvidence] = useState('')
  const [errors, setErrors] = useState<EvidenceErrors>({})
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    else setRefreshing(true)
    try {
      const res = (await api.getUncertainOutbox()) as { uncertain?: UncertainRow[] }
      setRows(res.uncertain || [])
    } catch (err) {
      if (initial) toast.error(err instanceof Error ? err.message : 'No se pudo cargar la conciliación')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(true)
    const t = setInterval(() => { void load(true) }, 30_000)
    return () => clearInterval(t)
  }, [load])

  const openReconcile = (row: UncertainRow) => {
    setPending(row)
    setResolution('sent')
    setProviderMessageId('')
    setEvidence('')
    setErrors({})
  }

  const submitReconciliation = async () => {
    if (!pending) return
    const errs = validateReconciliationEvidence({ resolution, providerMessageId, evidence })
    setErrors(errs)
    if (!canSubmitReconciliation(errs)) return
    setSubmitting(true)
    try {
      await api.reconcileUncertainOutbox({
        id: pending.id,
        resolution,
        ...(providerMessageId.trim() ? { providerMessageId: providerMessageId.trim() } : {}),
        ...(evidence.trim() ? { evidence: evidence.trim() } : {}),
      })
      toast.success(`Conciliado como ${resolutionLabel(resolution)}`)
      setPending(null)
      await load(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo conciliar')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="mt-4">
        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="p-5 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-slate-400" />
            <p className="text-sm text-slate-600">La conciliación de envíos es una herramienta de administradores.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        <span className="ml-3 text-sm text-slate-500">Cargando envíos inciertos…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 mt-4" data-testid="outbox-tab">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Clock className="w-4 h-4 text-amber-600" />
          {rows.length === 0
            ? 'Sin envíos inciertos ni sospechosos: todo al día.'
            : `${rows.length} envío${rows.length === 1 ? '' : 's'} requieren revisión`}
        </div>
        <Button variant="outline" size="sm" onClick={() => void load(false)} disabled={refreshing}>
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Actualizar
        </Button>
      </div>

      <Card className="border-0 shadow-sm bg-amber-50/60">
        <CardContent className="p-4">
          <p className="text-xs text-amber-800">
            Política: un envío <strong>unknown</strong> jamás se reintenta automáticamente. Para conciliar,
            verifica en el proveedor (Meta/TikTok) y aporta el ID del mensaje o una nota de lo verificado.
            Toda conciliación queda auditada en la conexión.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {rows.map((row) => {
          const level = rowAlertLevel(row.status, row.attemptCount)
          return (
            <motion.div key={row.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} data-testid={`uncertain-row-${row.id}`}>
              <Card className={`border-0 shadow-sm ${level === 'unknown' ? 'bg-red-50/50' : 'bg-amber-50/40'}`}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100">
                      {level === 'unknown'
                        ? <AlertTriangle className="w-5 h-5 text-red-600" />
                        : <Clock className="w-5 h-5 text-amber-600" />}
                    </div>
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800">{row.contactName || row.contactHandle || 'Contacto'}</span>
                        <Badge variant="outline" className={
                          level === 'unknown'
                            ? 'border-red-200 text-red-700 bg-red-50'
                            : 'border-amber-200 text-amber-700 bg-amber-50'
                        }>
                          {row.status === 'unknown' ? 'UNCERTAIN' : 'sending'}
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 text-slate-500 text-[10px]">{row.channel}</Badge>
                      </div>
                      <p className="text-sm text-slate-600 mt-1">{truncateBody(row.body)}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {uncertainAge(row.createdAt)} · {row.attemptCount} intento{row.attemptCount === 1 ? '' : 's'}
                        {row.providerErrorCode && row.providerErrorCode !== 'MANUAL_RECONCILIATION_IN_PROGRESS' && (
                          <> · error: <span className="font-mono">{row.providerErrorCode}</span></>
                        )}
                      </p>
                    </div>
                    {row.status === 'unknown' && (
                      <Button variant="outline" size="sm" onClick={() => openReconcile(row)} data-testid={`reconcile-${row.id}`}>
                        <CheckCircle2 className="w-4 h-4" /> Conciliar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Diálogo de conciliación con evidencia */}
      <Dialog open={!!pending} onOpenChange={(open) => { if (!open) setPending(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Conciliar envío a {pending?.contactName || pending?.contactHandle}</DialogTitle>
            <DialogDescription>
              Confirma con el proveedor qué pasó con este mensaje. La resolución exige evidencia
              (ID del proveedor o nota de lo verificado).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-2">Mensaje:</p>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-2.5">{truncateBody(pending?.body, 300)}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setResolution('sent')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  resolution === 'sent' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-medium' : 'border-slate-200 text-slate-600'
                }`}
                data-testid="resolution-sent"
              >
                {resolutionLabel('sent')}
              </button>
              <button
                onClick={() => setResolution('failed')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  resolution === 'failed' ? 'border-red-500 bg-red-50 text-red-700 font-medium' : 'border-slate-200 text-slate-600'
                }`}
                data-testid="resolution-failed"
              >
                {resolutionLabel('failed')}
              </button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pmi">ID del mensaje en el proveedor (opcional)</Label>
              <Input
                id="pmi" value={providerMessageId} data-testid="provider-message-id"
                onChange={(e) => setProviderMessageId(e.target.value)} placeholder="wamid.HBgLMzU…"
              />
              {errors.providerMessageId && <p className="text-xs text-red-600">{errors.providerMessageId}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evidence">Evidencia verificada (si no hay ID)</Label>
              <Input
                id="evidence" value={evidence} data-testid="evidence-note"
                onChange={(e) => setEvidence(e.target.value)} placeholder="Confirmado en el panel de Meta a las 10:15…"
              />
              {errors.evidence && <p className="text-xs text-red-600">{errors.evidence}</p>}
              {errors.resolution && <p className="text-xs text-red-600">{errors.resolution}</p>}
            </div>
            <Button
              className="w-full"
              disabled={!canSubmitReconciliation(validateReconciliationEvidence({ resolution, providerMessageId, evidence })) || submitting}
              onClick={() => void submitReconciliation()}
              data-testid="submit-reconciliation"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Confirmar conciliación
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
