import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/app-shell'

export const metadata: Metadata = { title: 'Conexiones WhatsApp · CRM ALBRA' }

/** /whatsapp/conexiones — panel multi-número (F2): Meta Cloud API por organización. */
export default function WaConnectionsRoute() {
  return <AppShell initialView="wa-connections" />
}
