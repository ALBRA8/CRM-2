import { describe, expect, it } from 'vitest'
import {
  verdictMeta, CHECK_STATUS_META, checkAction, hasDeterministicFix,
  deriveSetupSteps, shouldShowWizard, wizardProgress,
  type DoctorCheck,
} from '@/lib/health-view-model'

/**
 * F5/F6-T02 (plan definitivo) — lógica de la pantalla de Salud y el wizard
 * de puesta en marcha, PURA (regla 9). Criterios del plan:
 *  - una instalación sana NUNCA ve el wizard;
 *  - cada AVISO tiene una acción sugerida;
 *  - el botón Arreglar solo aparece con fix determinista disponible.
 */

function check(overrides: Partial<DoctorCheck> = {}): DoctorCheck {
  return { id: 'whatsapp', label: 'Daemon WhatsApp', status: 'ok', ...overrides }
}

describe('verdictMeta: veredicto global', () => {
  it('healthy / degraded / critical con clases distinguibles', () => {
    const healthy = verdictMeta('healthy')
    const degraded = verdictMeta('degraded')
    const critical = verdictMeta('critical')
    expect(healthy.badgeClass).toContain('emerald')
    expect(degraded.badgeClass).toContain('amber')
    expect(critical.badgeClass).toContain('red')
    expect(healthy.label).not.toBe(degraded.label)
  })

  it('veredicto nulo/undefined → estado sin diagnóstico sin romperse', () => {
    expect(verdictMeta(null).label).toBe('Sin diagnóstico')
    expect(verdictMeta(undefined).dotClass).toContain('slate')
  })
})

describe('CHECK_STATUS_META: estados de cada check', () => {
  it('ok/warn/fail con etiqueta y colores correctos', () => {
    expect(CHECK_STATUS_META.ok.label).toBe('OK')
    expect(CHECK_STATUS_META.warn.label).toBe('AVISO')
    expect(CHECK_STATUS_META.fail.label).toBe('ERROR')
    expect(CHECK_STATUS_META.ok.dotClass).toContain('emerald')
    expect(CHECK_STATUS_META.fail.dotClass).toContain('red')
  })
})

describe('checkAction: cada AVISO tiene acción', () => {
  it('checks OK no muestran acción (no ruido)', () => {
    expect(checkAction(check({ status: 'ok' }))).toBeNull()
    expect(checkAction(check({ id: 'ai', status: 'ok' }))).toBeNull()
  })

  it('whatsapp con aviso → acción conectar número', () => {
    const a = checkAction(check({ id: 'whatsapp', status: 'warn' }))
    expect(a?.view).toBe('wa-connections')
  })

  it('ai con aviso → acción configurar IA', () => {
    expect(checkAction(check({ id: 'ai', status: 'warn' }))?.view).toBe('settings')
  })

  it('automatizaciones con aviso → revisar automatizaciones', () => {
    expect(checkAction(check({ id: 'automations', status: 'warn' }))?.view).toBe('automations')
  })

  it('checks de servidor (db/schema/security) sin vista asociada', () => {
    expect(checkAction(check({ id: 'db', status: 'fail' }))).toBeNull()
    expect(checkAction(check({ id: 'schema', status: 'warn' }))).toBeNull()
    expect(checkAction(check({ id: 'security', status: 'warn' }))).toBeNull()
  })

  it('check desconocido con aviso tiene acción genérica de settings', () => {
    expect(checkAction(check({ id: 'cosa-extrana', status: 'warn' }))?.view).toBe('settings')
  })
})

describe('hasDeterministicFix: botón Arreglar solo cuando aplica', () => {
  it('automations con ?fix=1 en el detalle → true', () => {
    const c = check({ id: 'automations', status: 'warn', detail: '3 runs huérfanos (crash) — aplicar ?fix=1' })
    expect(hasDeterministicFix([c])).toBe(true)
  })

  it('automations ok o sin el marcador → false', () => {
    expect(hasDeterministicFix([check({ id: 'automations', status: 'ok' })])).toBe(false)
    expect(hasDeterministicFix([check({ id: 'automations', status: 'warn', detail: 'atrasadas' })])).toBe(false)
    expect(hasDeterministicFix([])).toBe(false)
  })
})

describe('wizard de puesta en marcha: 4 pasos reales', () => {
  const allDone = { orgExists: true, numberConnected: true, llmConfigured: true, firstSendDone: true }

  it('instalación completa → 4 pasos done y NO se muestra el wizard', () => {
    const steps = deriveSetupSteps(allDone)
    expect(steps).toHaveLength(4)
    expect(steps.every((s) => s.done)).toBe(true)
    expect(shouldShowWizard(steps)).toBe(false)
    expect(wizardProgress(steps)).toBe(4)
  })

  it('instalación nueva → wizard visible con 4 pendientes', () => {
    const steps = deriveSetupSteps({ orgExists: true, numberConnected: false, llmConfigured: false, firstSendDone: false })
    expect(steps.filter((s) => !s.done)).toHaveLength(3) // org siempre done
    expect(shouldShowWizard(steps)).toBe(true)
    expect(wizardProgress(steps)).toBe(1)
  })

  it('cada paso pendiente tiene vista y acción para completarlo', () => {
    const steps = deriveSetupSteps({ orgExists: true, numberConnected: false, llmConfigured: false, firstSendDone: false })
    for (const s of steps.filter((x) => !x.done)) {
      expect(s.view.length).toBeGreaterThan(0)
      expect(s.actionLabel.length).toBeGreaterThan(0)
    }
    expect(steps.find((s) => s.id === 'number')?.view).toBe('wa-connections')
    expect(steps.find((s) => s.id === 'first_send')?.view).toBe('inbox')
  })

  it('org siempre done (la sesión garantiza que la organización existe)', () => {
    const steps = deriveSetupSteps({ orgExists: true, numberConnected: false, llmConfigured: false, firstSendDone: false })
    expect(steps.find((s) => s.id === 'org')?.done).toBe(true)
  })
})
