'use client'

import { CheckCircle2, Circle, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { wizardComplete, wizardProgress, type WizardStep } from '@/lib/health-ui'

/**
 * (F5) Wizard de puesta en marcha de 4 pasos.
 *
 * Los pasos NO se marcan por clic del usuario: llegan ya validados desde el
 * modelo puro contra la respuesta real del doctor. Una instalación completa
 * no renderiza este componente (la página decide con wizardComplete).
 */
export function OnboardingWizard({
  steps,
  onNavigate,
}: {
  steps: WizardStep[]
  onNavigate?: (href: string) => void
}) {
  const complete = wizardComplete(steps)
  const progress = wizardProgress(steps)
  const current = steps.find((s) => !s.done)

  const go = (href?: string) => {
    if (href && onNavigate) onNavigate(href)
    else if (href && typeof window !== 'undefined') window.location.assign(href)
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            {complete ? 'Puesta en marcha completa' : 'Puesta en marcha'}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {complete
              ? 'Tu organización está lista para operar.'
              : `Paso ${steps.filter((s) => s.done).length + 1} de ${steps.length}: ${current?.title ?? ''}`}
          </p>
        </div>
        <span className="text-xs font-bold text-emerald-700 bg-emerald-100 rounded-full px-2.5 py-1">
          {progress}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-emerald-100 mt-3 overflow-hidden">
        <motion.div
          className="h-full bg-emerald-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
        {steps.map((step, idx) => {
          const isNext = current?.id === step.id
          return (
            <div
              key={step.id}
              className={`rounded-lg border p-2.5 transition-colors ${
                step.done
                  ? 'border-emerald-200 bg-white'
                  : isNext
                    ? 'border-emerald-300 bg-white shadow-sm'
                    : 'border-slate-200 bg-white/60'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {step.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <Circle className={`w-4 h-4 flex-shrink-0 ${isNext ? 'text-emerald-500' : 'text-slate-300'}`} />
                )}
                <span className={`text-xs font-bold ${step.done ? 'text-slate-500 line-through decoration-emerald-400' : 'text-slate-900'}`}>
                  {idx + 1}. {step.title}
                </span>
              </div>
              <p className="text-[13px] text-slate-500 mt-1 leading-snug">{step.description}</p>
              {!step.done && step.action && (
                <button
                  onClick={() => go(step.action?.href)}
                  className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-600 hover:text-emerald-800 transition-colors"
                >
                  {step.action.label}
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
