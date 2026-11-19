import { describe, expect, it } from 'vitest'
import {
  statusMeta, isActiveStatus, sortConnections, planUsageSummary,
  tokenExpiryMeta, connectionHealth, HEALTH_BORDER_CLASS,
  sourceLabel, eventMeta, formatMoment,
  manualFormDefaults, validateManualForm,
  recommendedAction, embeddedFlowMessage,
  type WaConnectionView,
} from '@/lib/wa-connections-view-model'

/**
 * F2 del plan definitivo — lógica de presentación del panel de conexiones
 * WhatsApp multi-número. Módulo PURO (regla 9): sin React, sin red, sin BD.
 */

const DAY = 86_400_000
const NOW = new Date('2026-11-20T12:00:00.000Z').getTime()

function conn(overrides: Partial<WaConnectionView> = {}): WaConnectionView {
  return {
    id: 'conn-1',
    phoneNumber: '+573001234567',
    displayName: 'ALBRA Ventas',
    status: 'connected',
    statusDetail: 'Token verificado contra Graph API',
    source: 'embedded_signup',
    phoneNumberId: '123456789012345',
    wabaId: '1029384756',
    tokenExpiresAt: null,
    lastVerifiedAt: '2026-11-19T10:00:00.000Z',
    lastErrorAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-19T10:00:00.000Z',
    ...overrides,
  }
}

describe('statusMeta: presentación por estado de conexión', () => {
  it('cubre los cuatro estados con etiqueta y clases', () => {
    expect(statusMeta('connected').label).toBe('Conectado')
    expect(statusMeta('pending').label).toBe('Pendiente')
    expect(statusMeta('disconnected').label).toBe('Desconectado')
    expect(statusMeta('revoked').label).toBe('Revocado')
    expect(statusMeta('connected').dotClass).toContain('emerald')
    expect(statusMeta('revoked').dotClass).toContain('red')
    expect(statusMeta('pending').badgeClass).toContain('amber')
  })

  it('estado desconocido o nulo cae a gris sin romperse', () => {
    expect(statusMeta('estado-extrano').label).toBe('estado-extrano')
    expect(statusMeta(null).label).toBe('Desconectado')
    expect(statusMeta(undefined).dotClass).toContain('slate')
  })
})

describe('isActiveStatus: coincide con la regla server-side del plan', () => {
  it('solo connected y pending ocupan cupo', () => {
    expect(isActiveStatus('connected')).toBe(true)
    expect(isActiveStatus('pending')).toBe(true)
    expect(isActiveStatus('disconnected')).toBe(false)
    expect(isActiveStatus('revoked')).toBe(false)
    expect(isActiveStatus(null)).toBe(false)
  })
})

describe('sortConnections: activas primero, luego recientes', () => {
  it('ordena connected > pending > históricos y por updatedAt desc', () => {
    const list = [
      conn({ id: 'a', status: 'disconnected', updatedAt: '2026-11-20T00:00:00.000Z' }),
      conn({ id: 'b', status: 'pending', updatedAt: '2026-11-18T00:00:00.000Z' }),
      conn({ id: 'c', status: 'connected', updatedAt: '2026-11-10T00:00:00.000Z' }),
      conn({ id: 'd', status: 'connected', updatedAt: '2026-11-19T00:00:00.000Z' }),
      conn({ id: 'e', status: 'revoked', updatedAt: '2026-11-20T01:00:00.000Z' }),
    ]
    const order = sortConnections(list).map((c) => c.id)
    expect(order).toEqual(['d', 'c', 'b', 'e', 'a'])
  })

  it('no muta el arreglo original (React-friendly)', () => {
    const list = [conn({ id: 'x', status: 'disconnected' }), conn({ id: 'y' })]
    const copy = [...list]
    sortConnections(list)
    expect(list).toEqual(copy)
  })
})

describe('planUsageSummary: texto y barra de progreso del plan', () => {
  it('plan con límite: porcentaje y aviso de límite alcanzado', () => {
    const s = planUsageSummary({ id: 'pilot', label: 'Piloto', maxConnections: 2, activeConnections: 2 })
    expect(s.text).toBe('2 de 2 número(s) · plan Piloto')
    expect(s.pct).toBe(100)
    expect(s.isAtLimit).toBe(true)
    expect(s.isUnlimited).toBe(false)
  })

  it('plan parcial: redondeo correcto', () => {
    const s = planUsageSummary({ id: 'pro', label: 'Pro', maxConnections: 3, activeConnections: 1 })
    expect(s.pct).toBe(33)
    expect(s.isAtLimit).toBe(false)
  })

  it('plan ilimitado (maxConnections negativo): sin límite', () => {
    const s = planUsageSummary({ id: 'enterprise', label: 'Enterprise', maxConnections: -1, activeConnections: 7 })
    expect(s.isUnlimited).toBe(true)
    expect(s.isAtLimit).toBe(false)
    expect(s.text).toContain('7 número(s)')
  })

  it('plan nulo: estado neutro sin romperse', () => {
    expect(planUsageSummary(null).pct).toBe(0)
    expect(planUsageSummary(undefined).isAtLimit).toBe(false)
  })
})

describe('tokenExpiryMeta: vigencia del token con ventana de aviso de 7 días', () => {
  it('sin fecha → ok', () => {
    expect(tokenExpiryMeta(null, NOW).tone).toBe('ok')
  })

  it('expira en más de 7 días → ok con días restantes', () => {
    const m = tokenExpiryMeta(new Date(NOW + 30 * DAY).toISOString(), NOW)
    expect(m.tone).toBe('ok')
    expect(m.label).toContain('30 días')
  })

  it('expira en 3 días → warn', () => {
    expect(tokenExpiryMeta(new Date(NOW + 3 * DAY).toISOString(), NOW).tone).toBe('warn')
  })

  it('expirado → bad', () => {
    expect(tokenExpiryMeta(new Date(NOW - DAY).toISOString(), NOW).tone).toBe('bad')
  })

  it('fecha inválida → warn (no NaN ni crash)', () => {
    const m = tokenExpiryMeta('no-es-fecha', NOW)
    expect(m.tone).toBe('warn')
  })
})

describe('connectionHealth: tono de salud de la tarjeta', () => {
  it('conectada sin problemas → ok', () => {
    expect(connectionHealth(conn(), NOW)).toBe('ok')
  })

  it('conectada con token expirado → bad', () => {
    const c = conn({ tokenExpiresAt: new Date(NOW - DAY).toISOString() })
    expect(connectionHealth(c, NOW)).toBe('bad')
  })

  it('conectada con token por vencer → warn', () => {
    const c = conn({ tokenExpiresAt: new Date(NOW + 2 * DAY).toISOString() })
    expect(connectionHealth(c, NOW)).toBe('warn')
  })

  it('conectada con error posterior a la actualización → bad', () => {
    const c = conn({
      lastErrorAt: '2026-11-20T13:00:00.000Z',
      updatedAt: '2026-11-19T10:00:00.000Z',
    })
    expect(connectionHealth(c, NOW)).toBe('bad')
  })

  it('error antiguo no ensucia el estado ok', () => {
    const c = conn({
      lastErrorAt: '2026-11-10T13:00:00.000Z',
      updatedAt: '2026-11-19T10:00:00.000Z',
    })
    expect(connectionHealth(c, NOW)).toBe('ok')
  })

  it('pending → warn, revoked → bad, disconnected → off', () => {
    expect(connectionHealth(conn({ status: 'pending' }), NOW)).toBe('warn')
    expect(connectionHealth(conn({ status: 'revoked' }), NOW)).toBe('bad')
    expect(connectionHealth(conn({ status: 'disconnected' }), NOW)).toBe('off')
  })
})

describe('HEALTH_BORDER_CLASS: clases de acento por tono', () => {
  it('cada tono tiene borde y son distintos', () => {
    const tones = ['ok', 'warn', 'bad', 'off'] as const
    const classes = tones.map((t) => HEALTH_BORDER_CLASS[t])
    expect(classes.every((c) => c.startsWith('border-l-'))).toBe(true)
    expect(new Set(classes).size).toBe(4)
  })
})

describe('sourceLabel y eventMeta: etiquetas legibles', () => {
  it('fuente oficial y manual con etiqueta clara', () => {
    expect(sourceLabel('embedded_signup')).toContain('Embedded Signup')
    expect(sourceLabel('manual')).toContain('manual')
    expect(sourceLabel(null)).toBe('Desconocida')
  })

  it('eventos con tono correcto por tipo', () => {
    expect(eventMeta('connected').tone).toBe('ok')
    expect(eventMeta('verified').tone).toBe('ok')
    expect(eventMeta('revoked').tone).toBe('bad')
    expect(eventMeta('plan_limit_blocked').tone).toBe('warn')
    expect(eventMeta('disconnected').tone).toBe('off')
    expect(eventMeta('otro').label).toBe('otro')
  })
})

describe('formatMoment: fecha corta en es sin romperse', () => {
  it('nulo/inválido → guion', () => {
    expect(formatMoment(null)).toBe('—')
    expect(formatMoment('')).toBe('—')
    expect(formatMoment('basura')).toBe('—')
  })

  it('fecha válida produce texto no vacío', () => {
    expect(formatMoment('2026-11-19T10:00:00.000Z')).not.toBe('—')
    expect(formatMoment('2026-11-19T10:00:00.000Z').length).toBeGreaterThan(3)
  })
})

describe('validateManualForm: misma regla mínima que createConnection', () => {
  it('acepta phoneNumberId de 6-20 dígitos y token >= 16', () => {
    const v = validateManualForm({
      ...manualFormDefaults(),
      phoneNumberId: '123456789012345',
      accessToken: 'EAAGtokenvalidodelongitudsuficiente',
    })
    expect(v.ok).toBe(true)
    expect(v.errors).toEqual({})
  })

  it('rechaza phoneNumberId no numérico o corto', () => {
    const v = validateManualForm({ ...manualFormDefaults(), phoneNumberId: 'abc', accessToken: 'x'.repeat(20) })
    expect(v.ok).toBe(false)
    expect(v.errors.phoneNumberId).toBeTruthy()
  })

  it('rechaza token demasiado corto', () => {
    const v = validateManualForm({ ...manualFormDefaults(), phoneNumberId: '123456', accessToken: 'corto' })
    expect(v.ok).toBe(false)
    expect(v.errors.accessToken).toBeTruthy()
  })

  it('acumula ambos errores cuando ambos campos son inválidos', () => {
    const v = validateManualForm(manualFormDefaults())
    expect(v.ok).toBe(false)
    expect(v.errors.phoneNumberId).toBeTruthy()
    expect(v.errors.accessToken).toBeTruthy()
  })
})

describe('recommendedAction y embeddedFlowMessage: guía de conexión', () => {
  it('embedded preferido si está disponible, manual para admin si no', () => {
    expect(recommendedAction(true, true)).toBe('embedded')
    expect(recommendedAction(true, false)).toBe('embedded')
    expect(recommendedAction(false, true)).toBe('manual')
    expect(recommendedAction(false, false)).toBe('none')
  })

  it('cada fase tiene mensaje y idle queda vacío', () => {
    const phases = ['idle', 'loading', 'sdk', 'awaiting', 'exchanging', 'done', 'error'] as const
    for (const p of phases) expect(typeof embeddedFlowMessage(p)).toBe('string')
    expect(embeddedFlowMessage('idle')).toBe('')
    expect(embeddedFlowMessage('error').length).toBeGreaterThan(0)
  })
})
