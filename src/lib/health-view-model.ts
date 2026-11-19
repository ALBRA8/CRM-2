/**
 * health-view-model.ts — lógica de presentación de la pantalla de SALUD y del
 * wizard de puesta en marcha (F5/F6-T02 del plan definitivo CRM-ALBRA v2.0).
 *
 * Regla 9: módulo PURO con pruebas. La página (/health) solo renderiza y
 * consume la API; el doctor (/api/doctor) NO cambia su contrato (reversión
 * limpia del plan). Las acciones por ítem son REALES: llevan a la vista SPA
 * que resuelve cada problema (conexiones, ajustes, automatizaciones…).
 *
 * Criterio de aceptación del plan:
 *  - una instalación sana NUNCA ve el wizard (shouldShowWizard);
 *  - cada AVISO tiene una acción sugerida (checkAction).
 */

export type HealthStatus = 'ok' | 'warn' | 'fail'
export type HealthVerdict = 'healthy' | 'degraded' | 'critical'

/** Check tal como lo devuelve GET /api/doctor (contrato sin cambios). */
export interface DoctorCheck {
  id: string
  label: string
  status: HealthStatus
  detail?: string
  data?: Record<string, unknown>
}

export interface DoctorResponse {
  version?: string
  generatedAt?: string
  verdict: HealthVerdict
  checks: DoctorCheck[]
}

export interface SetupStep {
  id: 'org' | 'number' | 'llm' | 'first_send'
  label: string
  description: string
  done: boolean
  /** Vista SPA para completar el paso (1 clic). */
  view: string
  /** Texto del botón de acción si el paso está pendiente. */
  actionLabel: string
}

/* ──── Veredicto global ──── */

export interface VerdictMeta {
  label: string
  description: string
  /** Clases Tailwind del badge y del punto. */
  badgeClass: string
  dotClass: string
}

export function verdictMeta(verdict: HealthVerdict | null | undefined): VerdictMeta {
  switch (verdict) {
    case 'healthy':
      return {
        label: 'Instalación sana',
        description: 'Todos los sistemas operan con normalidad.',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dotClass: 'bg-emerald-500',
      }
    case 'degraded':
      return {
        label: 'Funciona con avisos',
        description: 'El CRM opera, pero hay ítems que revisar antes de que se conviertan en fallos.',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
        dotClass: 'bg-amber-500',
      }
    case 'critical':
      return {
        label: 'Atención urgente',
        description: 'Hay un fallo activo que impide operar con normalidad.',
        badgeClass: 'bg-red-50 text-red-700 border-red-200',
        dotClass: 'bg-red-500',
      }
    default:
      return {
        label: 'Sin diagnóstico',
        description: 'Ejecuta el diagnóstico para conocer el estado.',
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
        dotClass: 'bg-slate-400',
      }
  }
}

export const CHECK_STATUS_META: Record<HealthStatus, { label: string; badgeClass: string; dotClass: string }> = {
  ok: { label: 'OK', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotClass: 'bg-emerald-500' },
  warn: { label: 'AVISO', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200', dotClass: 'bg-amber-500' },
  fail: { label: 'ERROR', badgeClass: 'bg-red-50 text-red-700 border-red-200', dotClass: 'bg-red-500' },
}

/* ──── Acción sugerida por ítem (cada AVISO tiene acción) ──── */

export interface CheckAction {
  label: string
  view: string
}

/**
 * Acción real para resolver cada check según su id y estado. Devuelve null
 * cuando el check está OK (no hace falta acción) o cuando el ítem solo es
 * resoluble por el operador en el servidor (sin vista asociada).
 */
export function checkAction(check: DoctorCheck): CheckAction | null {
  if (check.status === 'ok') return null
  switch (check.id) {
    case 'whatsapp':
      return { label: 'Conectar número', view: 'wa-connections' }
    case 'ai':
      return { label: 'Configurar agente IA', view: 'settings' }
    case 'automations':
      return { label: 'Revisar automatizaciones', view: 'automations' }
    case 'integrations':
      return { label: 'Configurar canales', view: 'settings' }
    case 'db':
    case 'schema':
    case 'security':
      // Operaciones de servidor (db push / secretos): sin vista de CRM asociada.
      return null
    case 'memory':
      return { label: 'Abrir bandeja para generar memoria', view: 'inbox' }
    default:
      return { label: 'Revisar en Configuración', view: 'settings' }
  }
}

/** ¿Hay algo que arreglar con el fix determinista del doctor (?fix=1)? */
export function hasDeterministicFix(checks: DoctorCheck[]): boolean {
  return checks.some((c) => c.id === 'automations' && c.status !== 'ok' && (c.detail ?? '').includes('?fix=1'))
}

/* ──── Wizard de puesta en marcha (4 pasos) ──── */

export interface SetupStateInput {
  /** requireAuth garantiza que la organización existe. */
  orgExists: boolean
  /** WhatsApp conectado (daemon ok o conexión Cloud/legacy en BD). */
  numberConnected: boolean
  /** Proveedor IA configurado (settings.llmBaseUrl). */
  llmConfigured: boolean
  /** Al menos un envío saliente real registrado (canal canónico o daemon). */
  firstSendDone: boolean
}

export function deriveSetupSteps(input: SetupStateInput): SetupStep[] {
  return [
    {
      id: 'org',
      label: 'Organización creada',
      description: 'Tu empresa está registrada en el CRM.',
      done: input.orgExists,
      view: 'settings',
      actionLabel: 'Revisar organización',
    },
    {
      id: 'number',
      label: 'Número de WhatsApp conectado',
      description: 'Conecta al menos un número para recibir y enviar mensajes.',
      done: input.numberConnected,
      view: 'wa-connections',
      actionLabel: 'Conectar número',
    },
    {
      id: 'llm',
      label: 'Agente IA configurado',
      description: 'Configura el proveedor IA para que el agente conteste solo.',
      done: input.llmConfigured,
      view: 'settings',
      actionLabel: 'Configurar IA',
    },
    {
      id: 'first_send',
      label: 'Primer envío de prueba',
      description: 'Envía tu primer mensaje desde la bandeja para validar el canal.',
      done: input.firstSendDone,
      view: 'inbox',
      actionLabel: 'Abrir bandeja',
    },
  ]
}

/**
 * Criterio de aceptación del plan: UNA INSTALACIÓN SANA NUNCA VE EL WIZARD.
 * Solo se muestra si hay al menos un paso pendiente (y siempre los 4 primeros
 * pasos del flujo de primer uso).
 */
export function shouldShowWizard(steps: SetupStep[]): boolean {
  return steps.some((s) => !s.done)
}

/** Progreso del wizard 0-4 para la barra. */
export function wizardProgress(steps: SetupStep[]): number {
  return steps.filter((s) => s.done).length
}
