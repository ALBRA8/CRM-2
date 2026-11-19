import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/app-shell'

export const metadata: Metadata = { title: 'Reconciliación outbox · CRM ALBRA' }

/** /outbox — reconciliación operable de envíos UNCERTAIN (M8, solo admin). */
export default function OutboxReconciliationRoute() {
  return <AppShell initialView="outbox" />
}
