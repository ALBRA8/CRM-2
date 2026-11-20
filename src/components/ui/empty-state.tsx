'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * EmptyState (U5 — F4-T05): estado vacío reutilizable para TODAS las pantallas.
 *
 * Problema que resuelve: cada pantalla pintaba su propio "vacío" con estilos
 * distintos y, en varias, solo un texto de 10px sin acción. El criterio de
 * aceptación de U5 exige: ninguna pantalla vacía sin mensaje Y sin guía.
 *
 * Reglas del componente:
 *  - Tipografía mínima 13px (escala tipográfica U5); nada por debajo.
 *  - Siempre ofrece una acción siguiente (CTA) cuando existe una ruta clara:
 *    "no hay conversaciones → conecta tu primer número".
 *  - Compatible con modo oscuro: solo clases remapeadas por la capa `.dark`
 *    de globals.css (bg-slate-50, text-slate-400/500/600…), sin dark: sueltos.
 *  - `size="sm"` para columnas laterales (listas de la bandeja), `md` para
 *    el cuerpo principal de una pantalla.
 */

export interface EmptyStateAction {
  label: string
  onClick?: () => void
  /** Icono opcional dentro del botón (p. ej. Plus, QrCode). */
  icon?: LucideIcon
}

export interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: EmptyStateAction
  size?: 'sm' | 'md'
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, size = 'md', className }: EmptyStateProps) {
  const isSmall = size === 'sm'
  const iconBox = isSmall ? 'w-12 h-12' : 'w-16 h-16'
  const iconSize = isSmall ? 'w-6 h-6' : 'w-8 h-8'

  return (
    <div className={cn('text-center', isSmall ? 'p-6' : 'p-10 sm:p-12', className)}>
      <div
        className={cn(
          'bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3',
          iconBox
        )}
      >
        <Icon className={cn('text-emerald-400', iconSize)} aria-hidden />
      </div>
      <h3 className={cn('font-semibold text-slate-700', isSmall ? 'text-[13px]' : 'text-base')}>
        {title}
      </h3>
      {description && (
        <p className={cn('text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed', isSmall ? 'text-[13px]' : 'text-sm')}>
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-colors shadow-sm shadow-emerald-600/20"
        >
          {action.icon && <action.icon className="w-4 h-4" aria-hidden />}
          {action.label}
        </button>
      )}
    </div>
  )
}
