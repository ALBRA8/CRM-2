import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/app-shell'

export const metadata: Metadata = { title: 'Salud · CRM ALBRA' }

/** /health — pantalla de Salud y puesta en marcha guiada (F5, owner/admin). */
export default function HealthRoute() {
  return <AppShell initialView="health" />
}
