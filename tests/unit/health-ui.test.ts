/**
 * (F5) health-ui.test.ts — modelo puro de la pantalla de Salud y del wizard.
 *
 * Cubre:
 *  - metadatos de estado y veredicto (incluye estados no contemplados),
 *  - acción sugerida por check (enlaces a Ajustes/Bandeja/Automatizaciones,
 *    notas para el operador, fix de huérfanos apuntando a /health?fix=1),
 *  - wizard de 4 pasos validado contra el doctor REAL (nunca por clic):
 *    instalación vacía, instalación completa, respuestas viejas sin el
 *    check nuevo (no marca hecho), número con warning y estado distinto
 *    de 'connected',
 *  - progreso y completitud (instalación sana nunca ve el wizard),
 *  - conteo de runs huérfanos para el fix determinista.
 */
import { describe, it, expect } from 'vitest'
import {
  findCheck,
  orphanRuns,
  statusMeta,
  suggestedAction,
  verdictMeta,
  wizardComplete,
  wizardProgress,
  wizardSteps,
  type DoctorCheck,
  type DoctorResponse,
} from '@/lib/health-ui'

function check(overrides: Partial<DoctorCheck> & { id: string }): DoctorCheck {
  return { label: overrides.id, status: 'ok', ...overrides } as DoctorCheck
}

function doctor(checks: DoctorCheck[], overrides: Partial<DoctorResponse> = {}): DoctorResponse {
  return {
    verdict: 'healthy',
    organizationId: 'org-1',
    version: '1.0.0',
    generatedAt: '2026-11-20T10:00:00.000Z',
    checks,
    ...overrides,
  }
}

const FULL_OK = [
  check({ id: 'db', label: 'Base de datos' }),
  check({ id: 'schema', label: 'Esquema' }),
  check({ id: 'security', label: 'Secretos' }),
  check({ id: 'whatsapp', label: 'Daemon', data: { connection: 'connected', orgLinked: true } }),
  check({ id: 'ai', label: 'Proveedor IA', detail: 'baseUrl configurado' }),
  check({ id: 'memory', label: 'Memoria', data: { hechos: 3 } }),
  check({ id: 'automations', label: 'Automatizaciones', data: { huerfanas: 0 } }),
  check({ id: 'test-send', label: 'Primer envío', data: { salidos: 2 } }),
  check({ id: 'integrations', label: 'Integraciones', data: {} }),
]

describe('statusMeta / verdictMeta', () => {
  it('mapea los tres estados con etiqueta y colores', () => {
    expect(statusMeta('ok').label).toBe('OK')
    expect(statusMeta('warn').label).toBe('Atención')
    expect(statusMeta('fail').label).toBe('Error')
  })

  it('mapea los tres veredictos', () => {
    expect(verdictMeta('healthy').label).toBe('Sistema sano')
    expect(verdictMeta('degraded').label).toBe('Operativo con avisos')
    expect(verdictMeta('critical').label).toBe('Fallo crítico')
  })
})

describe('suggestedAction', () => {
  it('whatsapp → enlaza a la pestaña de conexiones', () => {
    const a = suggestedAction(check({ id: 'whatsapp', status: 'warn', detail: 'No alcanzable' }))!
    expect(a.kind).toBe('link')
    expect(a.href).toBe('/settings?tab=conexiones')
    expect(a.label).toBe('Conectar un número')
  })

  it('whatsapp ok → "Administrar números"', () => {
    expect(suggestedAction(check({ id: 'whatsapp', data: {} }))!.label).toBe('Administrar números')
  })

  it('ai → pestaña del agente IA; test-send → bandeja; integrations → ajustes', () => {
    expect(suggestedAction(check({ id: 'ai', status: 'warn' }))!.href).toBe('/settings?tab=llm')
    expect(suggestedAction(check({ id: 'test-send', status: 'warn' }))!.href).toBe('/inbox')
    expect(suggestedAction(check({ id: 'integrations' }))!.href).toBe('/settings?tab=telegram')
  })

  it('automations con huérfanos → reparación en /health?fix=1; sin huérfanos → módulo', () => {
    const withOrphans = suggestedAction(check({ id: 'automations', data: { huerfanas: 3 } }))!
    expect(withOrphans.href).toBe('/health?fix=1')
    const clean = suggestedAction(check({ id: 'automations', data: { huerfanas: 0 } }))!
    expect(clean.href).toBe('/automations')
  })

  it('checks de plataforma → nota al operador, sin enlace', () => {
    for (const id of ['db', 'schema', 'security', 'memory']) {
      const a = suggestedAction(check({ id, status: 'warn' }))!
      expect(a.kind).toBe('note')
      // Invariante U3 adelantado: los textos no nombran archivos ni comandos.
      expect(a.label).not.toMatch(/\.(ts|md|sh|mjs|json|env)\b|npx|npm|prisma db push|\/api\//)
    }
  })

  it('check desconocido sin acción', () => {
    expect(suggestedAction(check({ id: 'desconocido' }))).toBeNull()
  })
})

describe('wizardSteps', () => {
  it('instalación vacía: solo el paso organización queda hecho', () => {
    const steps = wizardSteps(doctor([check({ id: 'db' })]))
    expect(steps.map((s) => s.done)).toEqual([true, false, false, false])
    expect(wizardProgress(steps)).toBe(25)
    expect(wizardComplete(steps)).toBe(false)
  })

  it('instalación completa: los 4 pasos hechos y wizard completo', () => {
    const steps = wizardSteps(doctor(FULL_OK))
    expect(steps.map((s) => s.done)).toEqual([true, true, true, true])
    expect(wizardProgress(steps)).toBe(100)
    expect(wizardComplete(steps)).toBe(true)
  })

  it('número conectado exige check ok y connection === connected', () => {
    const warn = wizardSteps(doctor([
      check({ id: 'whatsapp', status: 'warn', detail: 'No alcanzable', data: { connection: 'disconnected' } }),
    ]))
    expect(warn.find((s) => s.id === 'numero')!.done).toBe(false)

    const linkedOther = wizardSteps(doctor([
      check({ id: 'whatsapp', status: 'fail', detail: 'Otra organización', data: { connection: 'connected' } }),
    ]))
    expect(linkedOther.find((s) => s.id === 'numero')!.done).toBe(false)

    const connected = wizardSteps(doctor([
      check({ id: 'whatsapp', data: { connection: 'connected' } }),
    ]))
    expect(connected.find((s) => s.id === 'numero')!.done).toBe(true)
  })

  it('respuesta de un doctor viejo sin test-send: el paso NO se marca hecho', () => {
    const withoutSend = FULL_OK.filter((c) => c.id !== 'test-send')
    const steps = wizardSteps(doctor(withoutSend))
    expect(steps.find((s) => s.id === 'primerEnvio')!.done).toBe(false)
    expect(wizardComplete(steps)).toBe(false)
  })

  it('primer envío: un incierto (unknown) también prueba el camino', () => {
    const steps = wizardSteps(doctor([
      check({ id: 'test-send', status: 'ok', data: { salidos: 1 } }),
    ]))
    expect(steps.find((s) => s.id === 'primerEnvio')!.done).toBe(true)
    const cero = wizardSteps(doctor([
      check({ id: 'test-send', status: 'warn', detail: 'sin envíos', data: { salidos: 0 } }),
    ]))
    expect(cero.find((s) => s.id === 'primerEnvio')!.done).toBe(false)
  })

  it('los pasos pendientes llevan acción para completarse', () => {
    const steps = wizardSteps(doctor([]))
    const numero = steps.find((s) => s.id === 'numero')!
    expect(numero.action?.kind).toBe('link')
    expect(numero.action?.href).toBe('/settings?tab=conexiones')
    const organizacion = steps.find((s) => s.id === 'organizacion')!
    expect(organizacion.action).toBeUndefined()
  })
})

describe('orphanRuns / findCheck', () => {
  it('cuenta huérfanos del check automations', () => {
    expect(orphanRuns([check({ id: 'automations', data: { huerfanas: 4 } })])).toBe(4)
    expect(orphanRuns([check({ id: 'automations' })])).toBe(0)
    expect(orphanRuns([])).toBe(0)
  })

  it('findCheck devuelve undefined si no existe', () => {
    expect(findCheck(doctor(FULL_OK), 'whatsapp')?.id).toBe('whatsapp')
    expect(findCheck(doctor([]), 'nope')).toBeUndefined()
  })
})
