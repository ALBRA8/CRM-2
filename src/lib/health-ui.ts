/**
 * (F5) health-ui.ts — modelo puro de la pantalla de Salud y del wizard de
 * puesta en marcha. Sin React ni red: la página le pasa la respuesta de
 * /api/doctor y este módulo calcula metadatos de presentación, la acción
 * sugerida por cada check y el estado del wizard de 4 pasos.
 *
 * Criterios (plan F6-T02):
 *  - Estados visibles: OK / AVISO / ERROR con acción sugerida por ítem.
 *  - Wizard de 4 pasos que se marca SOLO al validar de verdad contra el
 *    doctor (nunca por clic del usuario): organización, número conectado,
 *    LLM configurado y primer envío de canal.
 *  - Una instalación completa nunca ve el wizard (steps.done → complete).
 *  - Los textos de acción no nombran archivos ni comandos (invariante U3).
 */

export interface DoctorCheck {
  id: string
  label: string
  status: 'ok' | 'warn' | 'fail'
  detail?: string
  data?: Record<string, unknown>
}

export interface DoctorResponse {
  version?: string
  generatedAt?: string
  verdict: 'healthy' | 'degraded' | 'critical'
  organizationId?: string
  checks: DoctorCheck[]
  fixed?: Record<string, number>
}

/** Acción sugerida: enlace navegable o nota para el operador. */
export interface SuggestedAction {
  kind: 'link' | 'note'
  label: string
  /** Ruta interna cuando kind === 'link'. */
  href?: string
}

export interface WizardStep {
  id: 'organizacion' | 'numero' | 'llm' | 'primerEnvio'
  title: string
  description: string
  done: boolean
  /** Acción para completar el paso si no está hecho. */
  action?: SuggestedAction
}

export function statusMeta(status: DoctorCheck['status']): {
  label: string
  dot: string
  bg: string
  text: string
  border: string
} {
  switch (status) {
    case 'ok':
      return { label: 'OK', dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' }
    case 'warn':
      return { label: 'Atención', dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' }
    case 'fail':
      return { label: 'Error', dot: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' }
  }
}

export function verdictMeta(verdict: DoctorResponse['verdict']): {
  label: string
  description: string
  bg: string
  text: string
  border: string
  icon: 'ok' | 'warn' | 'fail'
} {
  switch (verdict) {
    case 'healthy':
      return { label: 'Sistema sano', description: 'Todos los componentes operan con normalidad.', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: 'ok' }
    case 'degraded':
      return { label: 'Operativo con avisos', description: 'El sistema funciona, pero hay puntos que conviene atender.', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: 'warn' }
    case 'critical':
      return { label: 'Fallo crítico', description: 'Hay un componente caído: atiéndelo cuanto antes.', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: 'fail' }
  }
}

/** Acción sugerida por check. Sin archivos ni comandos en los textos. */
export function suggestedAction(check: DoctorCheck): SuggestedAction | null {
  switch (check.id) {
    case 'whatsapp':
      return {
        kind: 'link',
        label: check.status === 'ok' ? 'Administrar números' : 'Conectar un número',
        href: '/settings?tab=conexiones',
      }
    case 'ai':
      return { kind: 'link', label: 'Configurar el agente IA', href: '/settings?tab=llm' }
    case 'automations':
      if (check.data && Number(check.data['huerfanas'] ?? 0) > 0) {
        return { kind: 'link', label: 'Reparar ejecuciones atascadas', href: '/health?fix=1' }
      }
      return { kind: 'link', label: 'Abrir automatizaciones', href: '/automations' }
    case 'integrations':
      return { kind: 'link', label: 'Configurar integraciones', href: '/settings?tab=telegram' }
    case 'test-send':
      return { kind: 'link', label: 'Enviar un mensaje de prueba', href: '/inbox' }
    case 'db':
      return { kind: 'note', label: 'Componente de plataforma: contacta al operador del servidor' }
    case 'schema':
      return { kind: 'note', label: 'El operador del servidor debe actualizar el esquema de la base de datos' }
    case 'security':
      return { kind: 'note', label: 'Completa los secretos de configuración en el servidor (mínimo 24 caracteres)' }
    case 'memory':
      return { kind: 'note', label: 'Informativo: la memoria del agente crece con el uso' }
    default:
      return null
  }
}

export function findCheck(response: DoctorResponse, id: string): DoctorCheck | undefined {
  return response.checks.find((c) => c.id === id)
}

/**
 * Wizard de puesta en marcha: cada paso se valida contra el doctor REAL.
 * Si la respuesta no trae un check (doctor viejo), el paso no se marca hecho.
 */
export function wizardSteps(response: DoctorResponse): WizardStep[] {
  const wa = findCheck(response, 'whatsapp')
  const ai = findCheck(response, 'ai')
  const send = findCheck(response, 'test-send')

  const numberDone = !!wa
    && wa.status === 'ok'
    && String(wa.data?.['connection'] ?? '') === 'connected'
  const numberAction: SuggestedAction = {
    kind: 'link',
    label: 'Conectar un número',
    href: '/settings?tab=conexiones',
  }
  const llmDone = !!ai && ai.status === 'ok'
  const sendDone = !!send && send.status === 'ok'

  return [
    {
      id: 'organizacion',
      title: 'Organización creada',
      description: 'Tu espacio de trabajo está listo.',
      done: !!response.organizationId,
    },
    {
      id: 'numero',
      title: 'Número conectado',
      description: 'Conecta tu primer número de WhatsApp para conversar con clientes.',
      done: numberDone,
      action: numberAction,
    },
    {
      id: 'llm',
      title: 'Agente IA configurado',
      description: 'Configura el proveedor de inteligencia artificial que atiende conversaciones.',
      done: llmDone,
      action: { kind: 'link', label: 'Configurar el agente IA', href: '/settings?tab=llm' },
    },
    {
      id: 'primerEnvio',
      title: 'Primer envío de prueba',
      description: 'Envía tu primer mensaje desde la bandeja y confirma que sale de la cola.',
      done: sendDone,
      action: { kind: 'link', label: 'Abrir la bandeja', href: '/inbox' },
    },
  ]
}

/** Porcentaje completado (0–100) del wizard. */
export function wizardProgress(steps: readonly WizardStep[]): number {
  if (steps.length === 0) return 100
  return Math.round((steps.filter((s) => s.done).length / steps.length) * 100)
}

/** El wizard solo se muestra mientras quede algún paso pendiente. */
export function wizardComplete(steps: readonly WizardStep[]): boolean {
  return steps.length > 0 && steps.every((s) => s.done)
}

/** ¿Ofrece el doctor el fix determinista (runs huérfanos)? */
export function orphanRuns(checks: readonly DoctorCheck[]): number {
  const auto = checks.find((c) => c.id === 'automations')
  return auto?.data ? Number(auto.data['huerfanas'] ?? 0) : 0
}
