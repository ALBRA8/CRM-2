/**
 * (F2) wa-connections-ui.test.ts — modelo puro de la UI de conexiones.
 *
 * Cubre lo que exige el plan para F2 sin levantar React ni DOM:
 *  - mapeo de estado → metadatos de UI (incluye estados desconocidos),
 *  - gating de acciones por rol (admin/no-admin) y por estado,
 *  - cupo del plan (canAdd, ratio, mensajes),
 *  - máquina de confirmación doble de desconexión (incluye anti-click-doble
 *    y re-arma sobre otra conexión),
 *  - traducción de eventos de auditoría a etiquetas,
 *  - badge de sesión daemon a partir del VEREDICTO P0.1 con payloads stub
 *    del daemon multi-org (incluye respuesta ambigua → UNKNOWN).
 *  - helpers de formato (maskPhone, shortDate, tokenExpiryWarning).
 */
import { describe, it, expect } from 'vitest'
import {
  connectionEventUi,
  connectionUiState,
  daemonSessionBadge,
  disconnectButtonLabel,
  disconnectConfirmReducer,
  maskPhone,
  planQuotaSummary,
  shortDate,
  sourceLabel,
  tokenExpiryWarning,
  waStatusMeta,
  occupiesQuota,
} from '@/lib/wa-connections-ui'
import { mapStatusToVerdict } from '@/lib/whatsapp-session-verdict'

describe('F2 · waStatusMeta', () => {
  it('mapea los 5 estados del esquema a etiquetas y tonos', () => {
    expect(waStatusMeta('connected').label).toBe('Conectado')
    expect(waStatusMeta('connected').tone).toBe('success')
    expect(waStatusMeta('pending').tone).toBe('warning')
    expect(waStatusMeta('disconnected').tone).toBe('neutral')
    expect(waStatusMeta('revoked').tone).toBe('destructive')
    expect(waStatusMeta('error').tone).toBe('destructive')
  })

  it('fail-closed ante estado desconocido o vacío', () => {
    expect(waStatusMeta('weird-state').label).toBe('Desconocido')
    expect(waStatusMeta(null).label).toBe('Desconocido')
    expect(waStatusMeta(undefined).tone).toBe('neutral')
  })

  it('solo connected y pending ocupan cupo (igual que ACTIVE_STATUSES del servidor)', () => {
    expect(occupiesQuota('connected')).toBe(true)
    expect(occupiesQuota('pending')).toBe(true)
    expect(occupiesQuota('disconnected')).toBe(false)
    expect(occupiesQuota('revoked')).toBe(false)
    expect(occupiesQuota('error')).toBe(false)
  })
})

describe('F2 · connectionUiState (gating de acciones por rol y estado)', () => {
  it('admin con conexión conectada: puede verificar, desconectar y ver eventos', () => {
    const s = connectionUiState({ status: 'connected' }, true)
    expect(s.canVerify).toBe(true)
    expect(s.canDisconnect).toBe(true)
    expect(s.canViewEvents).toBe(true)
    expect(s.canReconnect).toBe(false)
  })

  it('no-admin NUNCA ve acciones de escritura (la autoridad es el servidor)', () => {
    const s = connectionUiState({ status: 'connected' }, false)
    expect(s.canVerify).toBe(false)
    expect(s.canDisconnect).toBe(false)
    expect(s.canReconnect).toBe(false)
    expect(s.canViewEvents).toBe(true) // el historial es lectura
  })

  it('admin NO puede desconectar algo ya desconectado o revocado (idempotente)', () => {
    expect(connectionUiState({ status: 'disconnected' }, true).canDisconnect).toBe(false)
    expect(connectionUiState({ status: 'revoked' }, true).canDisconnect).toBe(false)
  })

  it('admin NO puede verificar sin material de token (desconectada destruyó el token)', () => {
    expect(connectionUiState({ status: 'disconnected' }, true).canVerify).toBe(false)
    expect(connectionUiState({ status: 'revoked' }, true).canVerify).toBe(false)
    expect(connectionUiState({ status: 'pending' }, true).canVerify).toBe(true)
    expect(connectionUiState({ status: 'error' }, true).canVerify).toBe(true)
  })

  it('reconectar (alta) solo se ofrece en conexiones que no ocupan cupo', () => {
    expect(connectionUiState({ status: 'disconnected' }, true).canReconnect).toBe(true)
    expect(connectionUiState({ status: 'revoked' }, true).canReconnect).toBe(true)
    expect(connectionUiState({ status: 'connected' }, true).canReconnect).toBe(false)
  })
})

describe('F2 · planQuotaSummary', () => {
  it('cupo libre con 2 de 5', () => {
    const q = planQuotaSummary({ maxConnections: 5, activeConnections: 2 })
    expect(q.canAdd).toBe(true)
    expect(q.ratio).toBeCloseTo(0.4)
    expect(q.message).toContain('puedes conectar 3 más')
  })

  it('cupo agotado bloquea el alta', () => {
    const q = planQuotaSummary({ maxConnections: 1, activeConnections: 1 })
    expect(q.canAdd).toBe(false)
    expect(q.ratio).toBe(1)
    expect(q.message).toContain('Cupo agotado')
  })

  it('defensivo ante datos del servidor inválidos (fail-closed al mínimo)', () => {
    expect(planQuotaSummary({ maxConnections: NaN, activeConnections: 0 }).limit).toBe(1)
    expect(planQuotaSummary({ maxConnections: 2, activeConnections: -5 }).used).toBe(0)
    // activos > límite: ratio clampeado a 1 y sin alta
    const q = planQuotaSummary({ maxConnections: 1, activeConnections: 9 })
    expect(q.canAdd).toBe(false)
    expect(q.ratio).toBe(1)
  })
})

describe('F2 · desconexión con confirmación doble', () => {
  it('idle → ARM → armed, y el botón pide confirmación', () => {
    let s = disconnectConfirmReducer({ phase: 'idle' }, { type: 'ARM', connectionId: 'c1' })
    expect(s.phase).toBe('armed')
    expect(disconnectButtonLabel(s, 'c1')).toBe('¿Confirmar desconexión?')
  })

  it('CONFIRM sobre la conexión armada → working (se llama a la API)', () => {
    const armed = disconnectConfirmReducer({ phase: 'idle' }, { type: 'ARM', connectionId: 'c1' })
    const working = disconnectConfirmReducer(armed, { type: 'CONFIRM', connectionId: 'c1' })
    expect(working.phase).toBe('working')
    expect(disconnectButtonLabel(working, 'c1')).toBe('Desconectando…')
  })

  it('anti-click-doble: CONFIRM sin arma previa NO llega a working', () => {
    const s = disconnectConfirmReducer({ phase: 'idle' }, { type: 'CONFIRM', connectionId: 'c1' })
    expect(s.phase).toBe('idle')
  })

  it('anti-mixup: CONFIRM sobre OTRA conexión no dispara la API', () => {
    const armedC1 = disconnectConfirmReducer({ phase: 'idle' }, { type: 'ARM', connectionId: 'c1' })
    const s = disconnectConfirmReducer(armedC1, { type: 'CONFIRM', connectionId: 'c2' })
    expect(s.phase).toBe('armed')
    expect((s as { connectionId: string }).connectionId).toBe('c1')
  })

  it('ARM sobre otra conexión re-arma la nueva (una sola a la vez)', () => {
    const armedC1 = disconnectConfirmReducer({ phase: 'idle' }, { type: 'ARM', connectionId: 'c1' })
    const s = disconnectConfirmReducer(armedC1, { type: 'ARM', connectionId: 'c2' })
    expect(s).toEqual({ phase: 'armed', connectionId: 'c2' })
    expect(disconnectButtonLabel(s, 'c1')).toBe('Desconectar')
  })

  it('CANCEL vuelve a idle; DONE tras working también', () => {
    const armed = disconnectConfirmReducer({ phase: 'idle' }, { type: 'ARM', connectionId: 'c1' })
    expect(disconnectConfirmReducer(armed, { type: 'CANCEL' }).phase).toBe('idle')
    const working = disconnectConfirmReducer(armed, { type: 'CONFIRM', connectionId: 'c1' })
    expect(disconnectConfirmReducer(working, { type: 'DONE' }).phase).toBe('idle')
  })
})

describe('F2 · connectionEventUi', () => {
  it('traduce los tipos que emite wa-connections.ts', () => {
    expect(connectionEventUi('connected')).toMatchObject({ label: 'Conectado', tone: 'success' })
    expect(connectionEventUi('verified')).toMatchObject({ label: 'Token verificado', tone: 'success' })
    expect(connectionEventUi('disconnected')).toMatchObject({ label: 'Desconectado', tone: 'neutral' })
    expect(connectionEventUi('revoked')).toMatchObject({ label: 'Revocado', tone: 'destructive' })
    expect(connectionEventUi('plan_limit_blocked')).toMatchObject({ label: 'Cupo bloqueado', tone: 'warning' })
  })

  it('tipo desconocido: no explota y muestra el tipo crudo', () => {
    expect(connectionEventUi('futuro_tipo').label).toBe('futuro_tipo')
    expect(connectionEventUi('').label).toBe('Evento')
  })
})

describe('F2 · badge de sesión daemon con payloads STUB (veredicto P0.1)', () => {
  const ORG = 'org-A'

  it('daemon multi-org con sesión conectada de mi org → QR conectado', () => {
    const status = { sessions: [{ orgId: ORG, status: 'connected', phone: '+57300' }] }
    const v = mapStatusToVerdict(status, ORG)
    expect(v).toBe('SAME_ORG')
    expect(daemonSessionBadge(v, { status: 'connected', phone: '+57300' })).toMatchObject({
      tone: 'success', label: 'QR conectado',
    })
  })

  it('daemon multi-org con mi org esperando QR → badge ámbar', () => {
    const status = { sessions: [{ orgId: ORG, status: 'waiting_qr' }] }
    const v = mapStatusToVerdict(status, ORG)
    expect(daemonSessionBadge(v, { status: 'waiting_qr' }).tone).toBe('warning')
    expect(daemonSessionBadge(v, { status: 'waiting_qr' }).label).toBe('Esperando QR')
  })

  it('daemon multi-org SIN mi org → UNLINKED, badge neutro sin sesión', () => {
    const status = { sessions: [{ orgId: 'org-B', status: 'connected' }] }
    const v = mapStatusToVerdict(status, ORG)
    expect(v).toBe('UNLINKED')
    expect(daemonSessionBadge(v).tone).toBe('neutral')
  })

  it('respuesta AMBIGUA del daemon → UNKNOWN y badge sin detalles (fail-closed)', () => {
    // sin orgLinked boolean ni sessions[] válida: el veredicto es UNKNOWN
    // (payload crudo arbitrario, como puede llegar de un daemon viejo)
    const v = mapStatusToVerdict({ foo: 'bar' } as unknown as Parameters<typeof mapStatusToVerdict>[0], ORG)
    expect(v).toBe('UNKNOWN')
    const badge = daemonSessionBadge(v)
    expect(badge.label).toContain('desconocido')
    // no expone ninguna organización
    expect(badge.description).not.toContain('org-B')
  })

  it('daemon legacy con sesión de OTRA org → destructivo sin revelar cuál', () => {
    const v = mapStatusToVerdict({ orgLinked: true, linkedOrgId: 'org-B' }, ORG)
    expect(v).toBe('OTHER_ORG')
    const badge = daemonSessionBadge(v)
    expect(badge.tone).toBe('destructive')
    expect(badge.label).toBe('Sesión de otra organización')
  })
})

describe('F2 · formato', () => {
  it('maskPhone deja visibles solo los últimos 4 dígitos', () => {
    expect(maskPhone('+573001234567')).toBe('**** 4567')
    expect(maskPhone('12345')).toBe('**** 2345')
    expect(maskPhone('1234')).toBe('****1234')
    expect(maskPhone(null)).toBe('—')
    expect(maskPhone('')).toBe('—')
  })

  it('shortDate devuelve — para null/inválido', () => {
    expect(shortDate(null)).toBe('—')
    expect(shortDate('no-es-fecha')).toBe('—')
    expect(shortDate(new Date('2026-11-19T10:00:00Z').toISOString())).not.toBe('—')
  })

  it('tokenExpiryWarning avisa < 7 días y expirado', () => {
    const now = Date.now()
    expect(tokenExpiryWarning(new Date(now + 3 * 24 * 3600 * 1000).toISOString())).toContain('3 día')
    expect(tokenExpiryWarning(new Date(now - 1000).toISOString())).toContain('expiró')
    expect(tokenExpiryWarning(new Date(now + 30 * 24 * 3600 * 1000).toISOString())).toBeNull()
    expect(tokenExpiryWarning(null)).toBeNull()
  })

  it('sourceLabel traduce fuentes de alta', () => {
    expect(sourceLabel('embedded_signup')).toBe('Embedded Signup')
    expect(sourceLabel('manual')).toBe('Manual')
    expect(sourceLabel(null)).toBe('—')
  })
})
