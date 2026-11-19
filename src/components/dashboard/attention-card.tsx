'use client'

/**
 * attention-card.tsx — bloque "Requiere atención" del dashboard (F4/U2).
 * Muestra SOLO motivos con pendientes reales (count > 0, lo decide el módulo
 * puro dashboard-attention.ts) y cada motivo lleva a la acción en 1 clic vía
 * la navegación SPA (setView). Si la API falla, el bloque desaparece en
 * silencio: el dashboard nunca se rompe por este bloque.
 */

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, ChevronRight, CheckCircle2, MessageCircle, FileText, CalendarClock } from 'lucide-react'
import {
  buildAttentionMotives, sanitizeAttentionCounts, attentionSummary,
  type AttentionMotive, type AttentionMotiveId,
} from '@/lib/dashboard-attention'

const MOTIVE_ICON: Record<AttentionMotiveId, typeof MessageCircle> = {
  unread_messages: MessageCircle,
  overdue_tasks: AlertCircle,
  draft_quotes: FileText,
  upcoming_reservations: CalendarClock,
}

const MOTIVE_TONE: Record<AttentionMotiveId, string> = {
  unread_messages: 'bg-emerald-50 text-emerald-700',
  overdue_tasks: 'bg-red-50 text-red-700',
  draft_quotes: 'bg-amber-50 text-amber-700',
  upcoming_reservations: 'bg-sky-50 text-sky-700',
}

export function AttentionCard() {
  const { setView } = useAppStore()
  const [motives, setMotives] = useState<AttentionMotive[] | null>(null)

  useEffect(() => {
    let cancelled = false
    api.getAttentionMotives()
      .then((res) => {
        if (cancelled) return
        const counts = sanitizeAttentionCounts((res as { counts?: unknown }).counts)
        setMotives(buildAttentionMotives(counts))
      })
      .catch(() => {
        // El bloque es de conveniencia: un fallo no debe romper el dashboard
        if (!cancelled) setMotives([])
      })
    return () => { cancelled = true }
  }, [])

  if (motives === null) return <Skeleton className="h-40 rounded-xl" />
  if (motives.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{attentionSummary([])}</p>
            <p className="text-xs text-slate-400">Mensajes, cotizaciones y agenda al día.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">Requiere atención</h3>
          </div>
          <span className="text-[11px] text-slate-400">{attentionSummary(motives)}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {motives.map((m) => {
            const Icon = MOTIVE_ICON[m.id]
            return (
              <Button
                key={m.id}
                variant="outline"
                className="h-auto justify-start gap-3 p-3 text-left font-normal hover:bg-slate-50"
                onClick={() => setView(m.view)}
              >
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${MOTIVE_TONE[m.id]}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-slate-900">
                    {m.label} · {m.count}
                  </span>
                  <span className="block text-[11px] text-slate-400 truncate">{m.description}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
              </Button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
