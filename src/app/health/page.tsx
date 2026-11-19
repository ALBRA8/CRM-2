import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/app-shell'

export const metadata: Metadata = { title: 'Salud del sistema · CRM ALBRA' }

/** /health — pantalla de Salud y puesta en marcha guiada (F5, solo admin). */
export default function HealthRoute() {
  return <AppShell initialView="health" />
}
