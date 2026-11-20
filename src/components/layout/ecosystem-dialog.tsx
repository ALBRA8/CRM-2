'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, ExternalLink, Layers, MessageCircle, Rocket, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * EcosystemDialog — acceso directo al ecosistema (2026-11-17).
 *
 * Desde cualquier sesión autenticada (incluida la demo), abre WHATSPOWER
 * (capa 2A) y WHATSPOWER-ULTRA (capa 2B) con sesión de operador: el CRM
 * emite un enlace firmado de UN SOLO USO (HMAC-SHA256, 90 s) y la capa
 * destino canjea la sesión sin volver a pedir credenciales.
 * Fail-closed: si el despliegue no tiene ECOSYSTEM_SSO_SECRET o la URL del
 * servicio, el acceso se muestra deshabilitado con el motivo.
 */

type EcosystemLink = { available: boolean; url: string | null }
type EcosystemLinksResponse = {
  whatspower: EcosystemLink
  ultra: EcosystemLink
}

const SERVICES = [
  {
    key: 'whatspower' as const,
    title: 'WhatsPower',
    tier: 'Capa 2A',
    icon: MessageCircle,
    accent: 'bg-sky-500/10 text-sky-600 border-sky-200 dark:border-sky-900 dark:text-sky-400',
    desc: 'Flows Studio, chatbots con IA y motor de automatización de WhatsApp.',
  },
  {
    key: 'ultra' as const,
    title: 'WhatsPower-Ultra',
    tier: 'Capa 2B',
    icon: Rocket,
    accent: 'bg-violet-500/10 text-violet-600 border-violet-200 dark:border-violet-900 dark:text-violet-400',
    desc: 'Campañas y difusión: Studio de envíos, escudo anti-ban y métricas.',
  },
]

export function EcosystemDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const openService = async (key: 'whatspower' | 'ultra') => {
    setLoadingKey(key)
    setError(null)
    try {
      // Cada clic pide un enlace FRESCO: los tokens viven 90 s y son de un solo uso.
      const res = await fetch('/api/auth/ecosystem/links')
      if (!res.ok) throw new Error('No se pudo preparar el acceso al ecosistema')
      const links = (await res.json()) as EcosystemLinksResponse
      const link = links[key]
      if (!link?.available || !link.url) {
        throw new Error('Servicio no disponible en este despliegue (configura ECOSYSTEM_SSO_SECRET y la URL del studio)')
      }
      window.open(link.url, '_blank', 'noopener')
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de acceso al ecosistema')
    } finally {
      setLoadingKey(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <Layers className="w-4 h-4" />
          </div>
          <DialogTitle className="text-base">Ecosistema ALBRA</DialogTitle>
        </div>
        <DialogDescription className="text-sm">
          Abre las demás capas del ecosistema con tu sesión actual (incluida la demo). El
          enlace es de un solo uso y caduca en 90 segundos.
        </DialogDescription>

        <div className="mt-4 space-y-3">
          {/* Capa 1: este CRM (sesión actual) */}
          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-500/5 dark:border-emerald-900 p-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <LayoutDashboard className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">CRM ALBRA <span className="text-[13px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Capa 1 · estás aquí</span></p>
              <p className="text-xs text-muted-foreground">Clientes, pipeline, finanzas, inbox y WhatsApp multi-organización.</p>
            </div>
          </div>

          {SERVICES.map((s) => {
            const Icon = s.icon
            const loading = loadingKey === s.key
            return (
              <div key={s.key} className="flex items-center gap-3 rounded-lg border p-3">
                <div className={cn('w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0', s.accent)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {s.title} <span className="text-[13px] uppercase tracking-wide text-muted-foreground">{s.tier}</span>
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{s.desc}</p>
                </div>
                <Button size="sm" variant="outline" disabled={loading} onClick={() => openService(s.key)}>
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                  <span className="ml-1.5">Abrir</span>
                </Button>
              </div>
            )
          })}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/5 border border-red-200 dark:border-red-900 rounded-md p-2">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
