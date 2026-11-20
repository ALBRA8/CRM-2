'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Wrench, ShieldAlert, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  orphanRuns,
  statusMeta,
  suggestedAction,
  verdictMeta,
  wizardComplete,
  wizardSteps,
  type DoctorResponse,
} from '@/lib/health-ui'
import { OnboardingWizard } from './onboarding-wizard'

/**
 * (F5) Pantalla de Salud por organización: consume /api/doctor (aislado por
 * org, P0.1/P0.2) y presenta OK/AVISO/ERROR con acción sugerida por ítem.
 *
 * - El wizard de puesta en marcha solo se muestra mientras haya pasos sin
 *   validar de verdad contra el doctor.
 * - El botón "Reparar" aplica ÚNICAMENTE el fix determinista del doctor
 *   (?fix=1: marcar runs huérfanos como failed) con confirmación en dos
 *   pasos. Jamás toca datos comerciales.
 * - Si el usuario no es admin (403), se muestra un estado claro sin datos.
 */
export function HealthPage() {
  const [data, setData] = useState<DoctorResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [fixArmed, setFixArmed] = useState(false)
  const [fixing, setFixing] = useState(false)

  const load = useCallback(async (withFix = false) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/doctor${withFix ? '?fix=1' : ''}`, { cache: 'no-store' })
      if (res.status === 403) {
        setForbidden(true)
        return
      }
      if (!res.ok) throw new Error('diagnóstico falló')
      const j = (await res.json()) as DoctorResponse
      setData(j)
      if (withFix) toast.success('Reparación aplicada')
    } catch {
      toast.error('No se pudo completar el diagnóstico')
    } finally {
      setLoading(false)
      setFixArmed(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const runFix = async () => {
    if (!fixArmed) {
      setFixArmed(true)
      return
    }
    setFixing(true)
    await load(true)
    setFixing(false)
  }

  if (forbidden) {
    return (
      <div className="p-6 max-w-lg mx-auto mt-10">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <ShieldAlert className="w-8 h-8 text-amber-600 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-900">Salud disponible para administradores</h2>
          <p className="text-sm text-slate-600 mt-1.5">
            El diagnóstico del sistema está reservado al dueño y administradores de la organización.
          </p>
        </div>
      </div>
    )
  }

  const verdict = data ? verdictMeta(data.verdict) : null
  const steps = data ? wizardSteps(data) : []
  const wizardDone = data ? wizardComplete(steps) : false
  const orphans = data ? orphanRuns(data.checks) : 0
  const VerdictIcon = verdict?.icon === 'ok' ? CheckCircle2 : verdict?.icon === 'warn' ? AlertTriangle : XCircle

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Salud</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Diagnóstico de tu organización{data?.version ? ` · versión ${data.version}` : ''}
            {data?.generatedAt ? ` · ${new Date(data.generatedAt).toLocaleString('es')}` : ''}
          </p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 h-8 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Reintentar diagnóstico
        </button>
      </div>

      {/* Verdict banner */}
      {verdict && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${verdict.bg} ${verdict.border}`}>
          <VerdictIcon className={`w-6 h-6 flex-shrink-0 mt-0.5 ${verdict.text}`} />
          <div>
            <h2 className={`text-sm font-bold ${verdict.text}`}>{verdict.label}</h2>
            <p className={`text-xs mt-0.5 ${verdict.text} opacity-80`}>{verdict.description}</p>
          </div>
        </div>
      )}

      {/* Wizard (solo mientras haya pasos sin validar de verdad) */}
      {data && !wizardDone && <OnboardingWizard steps={steps} />}

      {/* Checks */}
      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
        {(data?.checks ?? []).map((check) => {
          const meta = statusMeta(check.status)
          const action = suggestedAction(check)
          return (
            <div key={check.id} className="flex items-start justify-between gap-3 p-3.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${meta.dot}`} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-slate-900">{check.label}</h3>
                    <span className={`text-[13px] font-bold rounded-full px-1.5 py-0.5 ${meta.bg} ${meta.text}`}>
                      {meta.label}
                    </span>
                  </div>
                  {check.detail && <p className="text-xs text-slate-500 mt-0.5 leading-snug">{check.detail}</p>}
                  {action?.kind === 'note' && <p className="text-[13px] text-slate-400 mt-1">{action.label}</p>}
                </div>
              </div>
              {action?.kind === 'link' && (
                <button
                  onClick={() => typeof window !== 'undefined' && window.location.assign(action.href ?? '/')}
                  className="flex-shrink-0 inline-flex items-center rounded-lg border border-slate-200 px-2.5 h-7 text-[13px] font-semibold text-slate-600 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                >
                  {action.label}
                </button>
              )}
            </div>
          )
        })}
        {loading && !data && (
          <div className="p-6 text-center text-sm text-slate-400">Ejecutando diagnóstico…</div>
        )}
      </div>

      {/* Fix determinista (runs huérfanos) con confirmación en dos pasos */}
      {orphans > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-amber-800 flex items-center gap-1.5">
              <Wrench className="w-4 h-4" /> {orphans} ejecuciones atascadas reparables
            </h3>
            <p className="text-xs text-amber-700 mt-0.5">
              Ejecuciones que quedaron a medias y pueden marcarse como fallidas para desbloquear nuevas corridas.
              No toca datos comerciales.
            </p>
          </div>
          <button
            onClick={runFix}
            disabled={fixing}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-xs font-bold transition-colors ${
              fixArmed ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-amber-600 text-white hover:bg-amber-700'
            }`}
          >
            {fixArmed ? 'Confirmar reparación' : 'Reparar'}
          </button>
        </div>
      )}
    </div>
  )
}
