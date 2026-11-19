'use client'

import { LifeBuoy } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from 'sonner'
import { explainError, type ErrorEntry, type ExplainInput } from '@/lib/errores'

/**
 * (U3) Alerta de error unificada y aviso por toast, alimentadas por el
 * catálogo accionable `src/lib/errores.ts`.
 *
 * Regla: el mensaje técnico original (archivos, comandos, códigos HTTP)
 * JAMÁS se muestra; el usuario ve qué pasó y qué hacer.
 */

export function ErrorAlert({ error, className }: { error: ExplainInput; className?: string }) {
  const e: ErrorEntry = explainError(error)
  return (
    <Alert className={className}>
      <AlertTitle>{e.title}</AlertTitle>
      <AlertDescription>
        <div className="space-y-1.5">
          <p>{e.solution}</p>
          {e.steps && e.steps.length > 0 && (
            <ol className="list-decimal list-inside space-y-0.5 text-sm">
              {e.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
          {e.support && (
            <p className="flex items-center gap-1.5 text-sm text-slate-500 mt-1">
              <LifeBuoy className="w-3.5 h-3.5 flex-shrink-0" />
              Si el problema continúa, contacta al soporte de tu organización.
            </p>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}

/** Aviso por toast con la entrada accionable del catálogo (título + solución). */
export function notifyError(error: ExplainInput, fallbackTitle?: string) {
  const e = explainError(error)
  toast.error(fallbackTitle || e.title, {
    description: e.solution,
  })
}
