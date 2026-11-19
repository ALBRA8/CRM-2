'use client'

/**
 * error-alert.tsx — componente de alerta UNIFICADO sobre el catálogo de
 * errores accionables (U3/F4-T03 del plan definitivo).
 *
 * Dado un código (o un Error / mensaje de la API), muestra SIEMPRE en
 * lenguaje de usuario: qué pasó, qué significa, la solución y los pasos
 * concretos; con acción directa (1 clic) cuando el catálogo la define.
 * Nada del catálogo nombra archivos, comandos ni máquinas (invariante con
 * pruebas en tests/unit/errores.test.ts).
 */

import { useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { AlertTriangle, XCircle, Info, ChevronRight, LifeBuoy } from 'lucide-react'
import { resolveError, type ErrorEntry } from '@/lib/errores'

export type ErrorAlertTone = 'error' | 'warn' | 'info'

const TONE_STYLES: Record<ErrorAlertTone, { border: string; bg: string; text: string; icon: typeof Info; iconColor: string }> = {
  error: { border: 'border-red-200', bg: 'bg-red-50', text: 'text-red-800', icon: XCircle, iconColor: 'text-red-600' },
  warn: { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-800', icon: AlertTriangle, iconColor: 'text-amber-600' },
  info: { border: 'border-sky-200', bg: 'bg-sky-50', text: 'text-sky-800', icon: Info, iconColor: 'text-sky-600' },
}

function navigateTo(view: string): void {
  const pathMap: Record<string, string> = {
    inbox: '/inbox',
    'wa-connections': '/whatsapp/conexiones',
    settings: '/settings',
    automations: '/automations',
    outbox: '/outbox',
    health: '/health',
    quotes: '/quotes',
    whatsapp: '/whatsapp',
  }
  window.history.replaceState(null, '', pathMap[view] ?? '/dashboard')
}

export function ErrorAlert({ input, tone = 'warn' }: { input: unknown; tone?: ErrorAlertTone }) {
  const setView = useAppStore((s) => s.setView)
  const entry: ErrorEntry = useMemo(() => resolveError(input), [input])
  const style = TONE_STYLES[tone]
  const Icon = style.icon

  const navigate = (view: string) => {
    navigateTo(view)
    setView(view)
  }

  return (
    <div role="alert" className={`rounded-xl border ${style.border} ${style.bg} p-4 ${style.text}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${style.iconColor}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{entry.titulo}</p>
          {entry.explicacion && <p className="text-xs mt-0.5 opacity-90">{entry.explicacion}</p>}
          <p className="text-sm mt-1.5 font-medium">{entry.solucion}</p>
          {entry.pasos.length > 0 && (
            <ol className="mt-2 space-y-1 text-xs opacity-90 list-decimal list-inside">
              {entry.pasos.map((paso, i) => (
                <li key={i}>{paso}</li>
              ))}
            </ol>
          )}
          {(entry.accion || entry.requiereSoporte) && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {entry.accion && (
                <button
                  onClick={() => navigate(entry.accion!.view)}
                  className={`inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold ${style.text} ${style.border} hover:opacity-80 transition-opacity`}
                >
                  {entry.accion.label} <ChevronRight className="w-3 h-3" />
                </button>
              )}
              {entry.requiereSoporte && (
                <span className="inline-flex items-center gap-1 text-xs opacity-80">
                  <LifeBuoy className="w-3.5 h-3.5" /> Si sigue el problema, contacta a soporte.
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
