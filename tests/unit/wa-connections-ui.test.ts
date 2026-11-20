import { describe, expect, it } from 'vitest'
import {
  connectionDisplayName,
  connectionEventPresentation,
  connectionStatusPresentation,
  daemonStatusPresentation,
  formatEventDate,
  planProgress,
  verdictAllowsOperate,
  verdictAllowsView,
  verdictLabel,
} from '@/lib/wa-connections-ui'

/**
 * F3-T02 (F2) — lógica de presentación de la pantalla de conexiones
 * WhatsApp multi-número. Módulo puro: sin BD, sin red, sin React.
 */
describe('wa-connections-ui: estados de conexión Cloud API', () => {
  it('connected → activo, etiqueta Conectado y verde', () => {
    const p = connectionStatusPresentation('connected')
    expect(p.active).toBe(true)
    expect(p.label).toBe('Conectado')
    expect(p.dotClass).toContain('bg-emerald-500')
    expect(p.badgeClass).toContain('text-emerald-700')
  })

  it('pending → activo (verificable) pero etiqueta pendiente', () => {
    const p = connectionStatusPresentation('pending')
    expect(p.active).toBe(true)
    expect(p.label).toContain('Pendiente')
  })

  it('revoked/error → inactivo con rojo', () => {
    expect(connectionStatusPresentation('revoked').active).toBe(false)
    expect(connectionStatusPresentation('error').dotClass).toContain('bg-red-500')
    expect(connectionStatusPresentation('revoked').dotClass).toContain('bg-red-500')
  })

  it('estado desconocido → presentación neutra sin romper la UI', () => {
    const p = connectionStatusPresentation('estado-raro')
    expect(p.active).toBe(false)
    expect(p.label).toBe('estado-raro')
    expect(p.dotClass).toContain('bg-slate-400')
  })
})

describe('wa-connections-ui: estados del daemon Baileys', () => {
  it('waiting_qr y qr_expired → ámbar, no activo', () => {
    expect(daemonStatusPresentation('waiting_qr').label).toContain('QR listo')
    expect(daemonStatusPresentation('qr_expired').label).toContain('QR expirado')
    expect(daemonStatusPresentation('waiting_qr').dotClass).toContain('bg-amber-500')
    expect(daemonStatusPresentation('qr_expired').active).toBe(false)
  })

  it('connected → verde y activo; disconnected → gris', () => {
    expect(daemonStatusPresentation('connected').active).toBe(true)
    expect(daemonStatusPresentation('disconnected').active).toBe(false)
  })

  it('estado desconocido del daemon no rompe la UI', () => {
    expect(daemonStatusPresentation('').label).toBe('Desconocido')
    expect(daemonStatusPresentation('otro').dotClass).toContain('bg-slate-400')
  })
})

describe('wa-connections-ui: veredicto de propiedad de sesión', () => {
  it('etiquetas legibles para los 4 veredictos', () => {
    expect(verdictLabel('SAME_ORG')).toContain('esta organización')
    expect(verdictLabel('UNLINKED')).toContain('Sin sesión')
    expect(verdictLabel('OTHER_ORG')).toContain('otra organización')
    expect(verdictLabel('UNKNOWN')).toContain('fail-closed')
  })

  it('view permite SAME_ORG y UNLINKED; operate SOLO SAME_ORG', () => {
    expect(verdictAllowsView('SAME_ORG')).toBe(true)
    expect(verdictAllowsView('UNLINKED')).toBe(true)
    expect(verdictAllowsView('OTHER_ORG')).toBe(false)
    expect(verdictAllowsView('UNKNOWN')).toBe(false)
    expect(verdictAllowsOperate('SAME_ORG')).toBe(true)
    expect(verdictAllowsOperate('UNLINKED')).toBe(false)
    expect(verdictAllowsOperate('OTHER_ORG')).toBe(false)
    expect(verdictAllowsOperate('UNKNOWN')).toBe(false)
  })
})

describe('wa-connections-ui: progreso del plan de conexiones', () => {
  it('0 de 5 → 0 %, no en tope', () => {
    const p = planProgress(0, 5)
    expect(p.percent).toBe(0)
    expect(p.atLimit).toBe(false)
    expect(p.label).toBe('0 de 5 números activos')
  })

  it('tope alcanzado → 100 % y atLimit', () => {
    const p = planProgress(2, 2)
    expect(p.percent).toBe(100)
    expect(p.atLimit).toBe(true)
  })

  it('límite nulo o inválido → sin tope, cuenta segura', () => {
    expect(planProgress(3, null).atLimit).toBe(false)
    expect(planProgress(3, 0).atLimit).toBe(false)
    expect(planProgress(3, undefined).label).toBe('3 activos')
    // Entradas hostiles no producen NaN
    expect(planProgress(-5, 4).percent).toBe(0)
    expect(Number.isFinite(planProgress(NaN, 4).percent)).toBe(true)
  })
})

describe('wa-connections-ui: presentación de eventos', () => {
  it('tipos canónicos con color por severidad', () => {
    expect(connectionEventPresentation('connected').dotClass).toContain('bg-emerald-500')
    expect(connectionEventPresentation('revoked').dotClass).toContain('bg-red-500')
    expect(connectionEventPresentation('plan_limit_blocked').dotClass).toContain('bg-amber-500')
    expect(connectionEventPresentation('token_rotated').dotClass).toContain('bg-blue-500')
  })

  it('tipo desconocido y vacío no rompen la UI', () => {
    expect(connectionEventPresentation('otro').label).toBe('otro')
    expect(connectionEventPresentation('').label).toBe('Evento')
  })
})

describe('wa-connections-ui: etiqueta de número y fechas', () => {
  it('prefiere teléfono y añade nombre visible si existe', () => {
    expect(connectionDisplayName({ phoneNumber: '+573001234567' })).toBe('+573001234567')
    expect(connectionDisplayName({ phoneNumber: '+573001234567', displayName: 'Ventas' })).toBe('+573001234567 · Ventas')
  })

  it('sin teléfono usa nombre; sin ambos usa el phoneNumberId', () => {
    expect(connectionDisplayName({ displayName: 'Soporte' })).toBe('Soporte')
    expect(connectionDisplayName({ phoneNumberId: '123' })).toBe('ID 123')
    expect(connectionDisplayName({})).toBe('Número sin identificar')
  })

  it('formatEventDate devuelve cadena para fecha válida y vacía para basura', () => {
    expect(formatEventDate(new Date('2026-11-20T10:00:00Z'))).not.toBe('')
    expect(formatEventDate('no-es-fecha')).toBe('')
    expect(formatEventDate(null)).toBe('')
    expect(formatEventDate(undefined)).toBe('')
  })
})
