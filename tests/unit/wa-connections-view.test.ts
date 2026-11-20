import { describe, expect, it } from 'vitest'
import {
  buildConnectionsPanelView,
  panelActionableError,
  shouldPollPanel,
  uiStatusFromBaileys,
  uiStatusFromCloud,
  CHANNEL_STATUS_LABELS,
  type CloudConnectionRow,
} from '@/lib/wa-connections-view'

/**
 * F2 — modelo de vista del panel de Conexiones WhatsApp multi-número.
 *
 * El módulo es puro: decide qué ve el operador (estados, acciones, plan) a
 * partir de datos crudos. La autoridad REAL sigue en el servidor (RBAC del
 * proxy + gates); aquí se testea que la presentación sea fiel al veredicto y
 * nunca lo fingido gane al real (fail-closed en UNKNOWN).
 */

function cloudRow(overrides: Partial<CloudConnectionRow> = {}): CloudConnectionRow {
  return {
    id: 'conn-1',
    phoneNumberId: '1234567890',
    phoneNumber: '+52 55 1234 5678',
    displayName: 'Ventas ALBRA',
    status: 'connected',
    statusDetail: 'Conectada manualmente por el administrador',
    source: 'manual',
    lastVerifiedAt: '2026-11-20T10:00:00.000Z',
    lastErrorAt: null,
    createdAt: '2026-11-20T09:00:00.000Z',
    ...overrides,
  }
}

const PLAN_OK = { plan: 'growth', label: 'Growth (hasta 5 números)', maxConnections: 5, activeConnections: 1 }

describe('uiStatusFromCloud — traducción de estados Cloud API', () => {
  it('mapea los estados conocidos al catálogo de UI', () => {
    expect(uiStatusFromCloud('connected')).toBe('connected')
    expect(uiStatusFromCloud('pending')).toBe('waiting_qr')
    expect(uiStatusFromCloud('disconnected')).toBe('disconnected')
    expect(uiStatusFromCloud('revoked')).toBe('revoked')
    expect(uiStatusFromCloud('error')).toBe('error')
  })

  it('los estados desconocidos NO se inventan: caen a unknown', () => {
    expect(uiStatusFromCloud('algo-nuevo')).toBe('unknown')
    expect(uiStatusFromCloud(null)).toBe('unknown')
    expect(uiStatusFromCloud(undefined)).toBe('unknown')
  })
})

describe('uiStatusFromBaileys — veredicto real de sesión, fail-closed', () => {
  it('SAME_ORG traduce el status interno del daemon', () => {
    expect(uiStatusFromBaileys('SAME_ORG', { status: 'connected', phone: '+52 1 55 0000 0000' })).toBe('connected')
    expect(uiStatusFromBaileys('SAME_ORG', { status: 'waiting_qr' })).toBe('waiting_qr')
    expect(uiStatusFromBaileys('SAME_ORG', { status: 'qr_expired' })).toBe('waiting_qr')
    expect(uiStatusFromBaileys('SAME_ORG', { status: 'connecting' })).toBe('connecting')
    expect(uiStatusFromBaileys('SAME_ORG', { status: 'disconnected' })).toBe('disconnected')
  })

  it('SAME_ORG con status no reconocido → unknown (sin fingir)', () => {
    expect(uiStatusFromBaileys('SAME_ORG', { status: 'estrango' })).toBe('unknown')
    expect(uiStatusFromBaileys('SAME_ORG', null)).toBe('unknown')
  })

  it('UNLINKED: el daemon VERIFICÓ que no hay sesión → disconnected (no unknown)', () => {
    expect(uiStatusFromBaileys('UNLINKED', null)).toBe('disconnected')
  })

  it('OTHER_ORG y UNKNOWN → unknown: la duda nunca se resuelve a favor del llamador', () => {
    expect(uiStatusFromBaileys('OTHER_ORG', { status: 'connected' })).toBe('unknown')
    expect(uiStatusFromBaileys('UNKNOWN', { status: 'connected' })).toBe('unknown')
    expect(uiStatusFromBaileys('UNKNOWN', null)).toBe('unknown')
  })
})

describe('buildConnectionsPanelView — tarjetas, acciones y plan', () => {
  it('incluye SIEMPRE la tarjeta Baileys + las conexiones Cloud de la org', () => {
    const view = buildConnectionsPanelView({
      cloudConnections: [cloudRow(), cloudRow({ id: 'conn-2', status: 'pending' })],
      plan: PLAN_OK,
      baileysVerdict: 'SAME_ORG',
      baileysSession: { status: 'connected', phone: '+52 1 55 9999 8888', lastUpdate: '2026-11-20T10:30:00.000Z' },
      isAdmin: true,
    })
    expect(view.cards).toHaveLength(3)
    expect(view.cards[0].kind).toBe('baileys')
    expect(view.cards[0].status).toBe('connected')
    expect(view.cards[0].subtitle).toBe('+52 1 55 9999 8888')
    expect(view.cards[1].id).toBe('conn-1')
    expect(view.cards[2].status).toBe('waiting_qr')
  })

  it('acciones de administrador: desconectar solo en estados operables, verificar solo conectada Cloud', () => {
    const view = buildConnectionsPanelView({
      cloudConnections: [cloudRow(), cloudRow({ id: 'conn-x', status: 'revoked' })],
      plan: PLAN_OK,
      baileysVerdict: 'SAME_ORG',
      baileysSession: { status: 'connected' },
      isAdmin: true,
    })
    const baileys = view.cards[0]
    const connected = view.cards[1]
    const revoked = view.cards[2]
    expect(baileys.canDisconnect).toBe(true)
    expect(view.baileys.canConnect).toBe(false) // ya conectado: conectar no aplica
    expect(connected.canDisconnect).toBe(true)
    expect(connected.canVerify).toBe(true)
    // revocada: solo queda el histórico (reconectar crea NUEVA conexión)
    expect(revoked.canDisconnect).toBe(false)
    expect(revoked.canVerify).toBe(false)
  })

  it('sin rol admin las acciones sensibles desaparecen de la UI (el servidor igual lo niega)', () => {
    const view = buildConnectionsPanelView({
      cloudConnections: [cloudRow()],
      plan: PLAN_OK,
      baileysVerdict: 'SAME_ORG',
      baileysSession: { status: 'connected' },
      isAdmin: false,
    })
    expect(view.cards.every((c) => !c.canDisconnect && !c.canVerify)).toBe(true)
    expect(view.baileys.canConnect).toBe(false)
    expect(view.baileys.canDisconnect).toBe(false)
  })

  it('daemon caído (UNKNOWN): fail-closed — "Sin verificar", disponible false, sin teléfono fingido', () => {
    const view = buildConnectionsPanelView({
      cloudConnections: [],
      plan: PLAN_OK,
      baileysVerdict: 'UNKNOWN',
      baileysSession: null,
      isAdmin: true,
    })
    expect(view.baileys.available).toBe(false)
    expect(view.baileys.status).toBe('unknown')
    expect(view.baileys.phone).toBeNull()
    expect(view.cards[0].statusLabel).toBe(CHANNEL_STATUS_LABELS.unknown)
    expect(view.cards[0].detail).toMatch(/No se pudo verificar/)
  })

  it('UNLINKED muestra desconectado y habilita conectar por QR', () => {
    const view = buildConnectionsPanelView({
      cloudConnections: [],
      plan: PLAN_OK,
      baileysVerdict: 'UNLINKED',
      baileysSession: null,
      isAdmin: true,
    })
    expect(view.baileys.status).toBe('disconnected')
    expect(view.baileys.canConnect).toBe(true)
  })

  it('plan completo: canAddCloud false y motivo accionable con el límite real', () => {
    const view = buildConnectionsPanelView({
      cloudConnections: [cloudRow()],
      plan: { plan: 'pilot', label: 'Pilot (1 número)', maxConnections: 1, activeConnections: 1 },
      baileysVerdict: 'UNLINKED',
      baileysSession: null,
      isAdmin: true,
    })
    expect(view.canAddCloud).toBe(false)
    expect(view.addBlockReason).toMatch(/Pilot \(1 número\)/)
    expect(view.addBlockReason).toMatch(/1 número/)
  })

  it('plan con cupo libre: sin motivo de bloqueo', () => {
    const view = buildConnectionsPanelView({
      cloudConnections: [cloudRow()],
      plan: { plan: 'growth', label: 'Growth (hasta 5 números)', maxConnections: 5, activeConnections: 2 },
      baileysVerdict: 'UNLINKED',
      baileysSession: null,
      isAdmin: true,
    })
    expect(view.canAddCloud).toBe(true)
    expect(view.addBlockReason).toBeNull()
  })

  it('teléfono "desconocido" no se muestra como subtítulo (usa phoneNumberId)', () => {
    const view = buildConnectionsPanelView({
      cloudConnections: [cloudRow({ phoneNumber: 'desconocido' })],
      plan: PLAN_OK,
      baileysVerdict: 'UNLINKED',
      baileysSession: null,
      isAdmin: true,
    })
    expect(view.cards[1].subtitle).toBe('phoneNumberId 1234567890')
  })
})

describe('shouldPollPanel — sondeo solo cuando algo espera conexión', () => {
  it('true con QR en espera o conexión Cloud pendiente', () => {
    const waitingQr = buildConnectionsPanelView({
      cloudConnections: [], plan: PLAN_OK, baileysVerdict: 'SAME_ORG',
      baileysSession: { status: 'waiting_qr' }, isAdmin: true,
    })
    expect(shouldPollPanel(waitingQr)).toBe(true)
    const pendingCloud = buildConnectionsPanelView({
      cloudConnections: [cloudRow({ status: 'pending' })], plan: PLAN_OK,
      baileysVerdict: 'UNLINKED', baileysSession: null, isAdmin: true,
    })
    expect(shouldPollPanel(pendingCloud)).toBe(true)
  })

  it('false cuando todo está estable (conectado/desconectado)', () => {
    const stable = buildConnectionsPanelView({
      cloudConnections: [cloudRow()], plan: PLAN_OK,
      baileysVerdict: 'SAME_ORG', baileysSession: { status: 'connected' }, isAdmin: true,
    })
    expect(shouldPollPanel(stable)).toBe(false)
    const idle = buildConnectionsPanelView({
      cloudConnections: [], plan: PLAN_OK, baileysVerdict: 'UNLINKED', baileysSession: null, isAdmin: true,
    })
    expect(shouldPollPanel(idle)).toBe(false)
  })
})

describe('panelActionableError — catálogo de errores accionables', () => {
  it('traduce los códigos de la API a QUÉ hacer', () => {
    expect(panelActionableError('plan_limit', '')).toMatch(/desconecta un número|mejora de plan/)
    expect(panelActionableError('duplicate', '')).toMatch(/ya está conectado/)
    expect(panelActionableError('invalid_token', '')).toMatch(/Meta/)
    expect(panelActionableError('daemon_down', '')).toMatch(/puerto 3002/)
  })

  it('código desconocido cae al fallback (nunca texto vacío)', () => {
    expect(panelActionableError('zzz', 'Fallo inesperado')).toBe('Fallo inesperado')
    expect(panelActionableError(null, 'Fallo inesperado')).toBe('Fallo inesperado')
  })
})
