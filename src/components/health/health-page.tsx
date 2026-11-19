'use client'

/**
 * health-page.tsx — Pantalla de SALUD y puesta en marcha guiada (F5/F6-T02 del
 * plan definitivo CRM-ALBRA v2.0).
 *
 * Consume:
 *  - GET /api/doctor (contrato SIN cambios): checks OK/AVISO/ERROR de la org;
 *  - GET /api/health/setup: señales reales del wizard de 4 pasos.
 *
 * Criterios del plan:
 *  - una instalación sana NUNCA ve el wizard;
 *  - cada AVISO tiene una acción sugerida que lleva a la vista que resuelve;
 *  - botón "Arreglar" solo cuando el doctor expone fix determinista (?fix=1).
 */

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  HeartPulse, RefreshCw, Loader2, CheckCircle2, AlertTriangle, XCircle,
  ChevronRight, Wrench, PartyPopper, Circle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  type DoctorResponse, type DoctorCheck,
  verdictMeta, CHECK_STATUS_META, checkAction, hasDeterministicFix,
  deriveSetupSteps, shouldShowWizard, wizardProgress, type SetupStateInput, type SetupStep,
} from '@/lib/health-view-model'

function formatMoment(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d)
}

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
}

export function HealthPage() {
  const { setView } = useAppStore()
  const [doctor, setDoctor] = useState<DoctorResponse | null>(null)
  const [steps, setSteps] = useState<SetupStep[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [fixOpen, setFixOpen] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const [doctorRes, setupRes] = await Promise.all([
        api.getDoctor() as Promise<DoctorResponse>,
        api.getHealthSetup() as Promise<{ steps: SetupStateInput }>,
      ])
      setDoctor(doctorRes)
      setSteps(deriveSetupSteps(setupRes.steps))
    } catch (err) {
      if (!silent) {
        toast.error(err instanceof Error ? err.message : 'No se pudo ejecutar el diagnóstico')
        setDoctor({ verdict: 'critical', checks: [] })
        setSteps(null)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(true)
  }, [load])

  const applyFix = async () => {
    setFixing(true)
    try {
      await api.runDoctorFix()
      toast.success('Fix determinista aplicado (runs huérfanos marcados como failed)')
      setFixOpen(false)
      await load(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo aplicar el fix')
    } finally {
      setFixing(false)
    }
  }

  const verdict = doctor ? verdictMeta(doctor.verdict) : verdictMeta(undefined)
  const checks = doctor?.checks ?? []
  const fixAvailable = doctor ? hasDeterministicFix(doctor.checks) : false
  const showWizard = steps ? shouldShowWizard(steps) : false
  const progress = steps ? wizardProgress(steps) : 0

  const go = (view: string) => {
    window.history.replaceState(null, '', view === 'wa-connections' ? '/whatsapp/conexiones' : view === 'inbox' ? '/inbox' : view === 'settings' ? '/settings' : view === 'automations' ? '/automations' : '/dashboard')
    setView(view)
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <HeartPulse className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Salud del sistema</h1>
            <p className="text-xs text-slate-500">
              Diagnóstico de tu organización · versión {doctor?.version ?? '—'} · {formatMoment(doctor?.generatedAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {fixAvailable && (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => setFixOpen(true)}>
              <Wrench className="w-3.5 h-3.5" /> Arreglar
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Ejecutar diagnóstico
          </Button>
        </div>
      </div>

      {/* Veredicto */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${verdict.dotClass}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900">{verdict.label}</p>
            <p className="text-xs text-slate-500">{verdict.description}</p>
          </div>
          <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${verdict.badgeClass}`}>
            {checks.filter((c) => c.status === 'ok').length}/{checks.length} OK
          </Badge>
        </CardContent>
      </Card>

      {/* Wizard de puesta en marcha (solo si hay pasos pendientes) */}
      {showWizard && steps && (
        <Card className="border-0 shadow-sm bg-sky-50/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <PartyPopper className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900">Puesta en marcha ({progress}/4)</h3>
              </div>
            </div>
            <Progress value={(progress / 4) * 100} className="h-1.5 mb-3" />
            <div className="space-y-2">
              {steps.map((step) => (
                <div key={step.id} className="flex items-center gap-3 rounded-lg bg-white p-2.5 border border-slate-100">
                  {step.done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-300 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-semibold ${step.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                      {step.label}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{step.description}</p>
                  </div>
                  {!step.done && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 flex-shrink-0" onClick={() => go(step.view)}>
                      {step.actionLabel} <ChevronRight className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Checks */}
      {loading ? (
        [...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
      ) : checks.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center text-sm text-slate-400">
            No hay resultados de diagnóstico. Ejecuta el diagnóstico para ver el estado.
          </CardContent>
        </Card>
      ) : (
        checks.map((check: DoctorCheck) => {
          const meta = CHECK_STATUS_META[check.status]
          const Icon = STATUS_ICON[check.status] ?? Circle
          const action = checkAction(check)
          return (
            <Card key={check.id} className="border-0 border-l-4 shadow-sm" style={{ borderLeftColor: check.status === 'ok' ? '#10b981' : check.status === 'warn' ? '#f59e0b' : '#ef4444' }}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0">
                    <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${check.status === 'ok' ? 'text-emerald-600' : check.status === 'warn' ? 'text-amber-600' : 'text-red-600'}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">{check.label}</span>
                        <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${meta.badgeClass}`}>{meta.label}</Badge>
                      </div>
                      {check.detail && <p className="text-xs text-slate-500 mt-1">{check.detail}</p>}
                    </div>
                  </div>
                  {action && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 flex-shrink-0" onClick={() => go(action.view)}>
                      {action.label} <ChevronRight className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })
      )}

      {/* Confirmación del fix determinista */}
      <AlertDialog open={fixOpen} onOpenChange={setFixOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar el fix determinista?</AlertDialogTitle>
            <AlertDialogDescription>
              Marca como failed las ejecuciones de automatización huérfanas (procesos que murieron a mitad de run)
              DE ESTA organización. No toca datos comerciales ni mensajes. El fix solo está disponible cuando el
              diagnóstico lo recomienda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
              onClick={(e) => { e.preventDefault(); void applyFix() }}
            >
              {fixing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Aplicar fix'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
