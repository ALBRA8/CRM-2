'use client'

/**
 * U3 — Alerta de error unificada del CRM.
 *
 * Consume `mensajeDeError()` (src/lib/errores.ts) y muestra SIEMPRE lenguaje
 * de usuario: qué pasó (título), qué hacer (solución) y el paso a paso.
 * El detalle técnico original queda colapsado para que el operador pueda
 * copiarlo al pedir soporte, sin verlo de golpe.
 */
import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { mensajeDeError } from '@/lib/errores'

export function ErrorAlert({ error, className = '' }: { error: unknown; className?: string }) {
  const [open, setOpen] = useState(false)
  const entry = mensajeDeError(error)
  return (
    <div
      className={`rounded-xl border border-red-200 bg-red-50 p-4 ${className}`}
      role="alert"
      data-testid="error-alert"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-red-800 text-sm">{entry.titulo}</p>
          <p className="text-sm text-red-700 mt-1">{entry.solucion}</p>
          <p className="text-xs text-red-600/90 mt-1.5 leading-relaxed">{entry.paso}</p>
          {entry.detalle && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700"
              >
                {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {open ? 'Ocultar detalle técnico' : 'Detalle técnico para soporte'}
              </button>
              {open && (
                <p className="mt-1.5 text-[11px] font-mono text-red-600/80 break-words bg-white/60 rounded p-2">
                  {entry.detalle}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
