/**
 * F2 — pruebas unitarias de los helpers puros de la UI de conexiones
 * WhatsApp multi-número (src/lib/wa-connections-ui.ts).
 *
 * El componente React consume exactamente estas funciones; cubrir aquí
 * validación de formulario, doble confirmación de desconexión, badges de
 * estado y el parseo del evento Embedded Signup equivale a cubrir el flujo
 * conectar/desconectar sin DOM (misma filosofía de la suite).
 */
import { describe, it, expect } from 'vitest'
import {
  connectionStatusBadge, eventTypeLabel, connectionSourceLabel, planUsageText,
  planLimitReached, validateManualForm, canAttemptDisconnect, DISCONNECT_CONFIRM_WORD,
  formatConnectionDate, tokenExpiringSoon, parseEmbeddedSignupMessage,
  embeddedSignupOutcome, embeddedSignupSdkUrl,
} from '@/lib/wa-connections-ui'

describe('F2 · connectionStatusBadge', () => {
  it('cada estado del modelo tiene etiqueta y color', () => {
    expect(connectionStatusBadge('connected').label).toBe('Conectado')
    expect(connectionStatusBadge('pending').label).toBe('Pendiente')
    expect(connectionStatusBadge('disconnected').label).toBe('Desconectado')
    expect(connectionStatusBadge('revoked').label).toBe('Token revocado')
    expect(connectionStatusBadge('error').label).toBe('Error')
  })

  it('estados conectado/revocado se distinguen por color', () => {
    expect(connectionStatusBadge('connected').classes).toContain('emerald')
    expect(connectionStatusBadge('revoked').classes).toContain('red')
  })

  it('null o estado desconocido no rompen la UI', () => {
    expect(connectionStatusBadge(null).label).toBe('Desconocido')
    expect(connectionStatusBadge('estado-inventado').label).toBe('Desconocido')
  })
})

describe('F2 · eventTypeLabel y connectionSourceLabel', () => {
  it('tipos de evento conocidos se traducen', () => {
    expect(eventTypeLabel('verified')).toBe('Verificado contra Meta')
    expect(eventTypeLabel('token_rotated')).toBe('Token rotado')
    expect(eventTypeLabel('plan_limit_blocked')).toBe('Bloqueado por límite del plan')
  })

  it('tipo desconocido devuelve el valor crudo, nunca undefined', () => {
    expect(eventTypeLabel('otro')).toBe('otro')
    expect(eventTypeLabel(null)).toBe('Evento')
  })

  it('fuentes de conexión se traducen', () => {
    expect(connectionSourceLabel('embedded_signup')).toBe('Embedded Signup de Meta')
    expect(connectionSourceLabel('manual')).toBe('Registro manual')
    expect(connectionSourceLabel(undefined)).toBe('Desconocida')
  })
})

describe('F2 · uso del plan', () => {
  it('el texto refleja activas y límite', () => {
    expect(planUsageText(2, 5, 'pilot')).toBe('Plan pilot: 2 de 5 conexiones activas')
    expect(planUsageText(1, 3, 'starter')).toBe('Plan starter: 1 de 3 conexiones activas')
    expect(planUsageText(1, 1, 'basic')).toBe('Plan basic: 1 de 1 conexión activa')
  })

  it('plan ilimitado no muestra límite', () => {
    expect(planUsageText(7, 0, 'pro')).toContain('sin límite')
    expect(planUsageText(1, 0, 'pro')).toContain('1 conexión activa')
  })

  it('planLimitReached bloquea solo con límite positivo alcanzado', () => {
    expect(planLimitReached(5, 5)).toBe(true)
    expect(planLimitReached(6, 5)).toBe(true)
    expect(planLimitReached(4, 5)).toBe(false)
    expect(planLimitReached(99, 0)).toBe(false) // ilimitado
  })
})

describe('F2 · validación del formulario manual', () => {
  it('exige phoneNumberId y accessToken', () => {
    const errors = validateManualForm({ phoneNumberId: '  ', accessToken: '' })
    expect(errors.phoneNumberId).toBeTruthy()
    expect(errors.accessToken).toBeTruthy()
  })

  it('un token recortado se detecta antes de llamar a la API', () => {
    const errors = validateManualForm({ phoneNumberId: '123', accessToken: 'EAAGcorto' })
    expect(errors.accessToken).toBeTruthy()
  })

  it('un token de longitud razonable pasa', () => {
    const errors = validateManualForm({ phoneNumberId: '123', accessToken: 'x'.repeat(40) })
    expect(errors).toEqual({})
  })
})

describe('F2 · doble confirmación de desconexión', () => {
  it('el botón solo se habilita con la palabra exacta', () => {
    expect(DISCONNECT_CONFIRM_WORD).toBe('DESCONECTAR')
    expect(canAttemptDisconnect('DESCONECTAR')).toBe(true)
    expect(canAttemptDisconnect('  DESCONECTAR  ')).toBe(true) // recorte tolerado
  })

  it('cualquier otra entrada deja el botón deshabilitado', () => {
    expect(canAttemptDisconnect('')).toBe(false)
    expect(canAttemptDisconnect('desconectar')).toBe(false) // mayúsculas importan
    expect(canAttemptDisconnect('si')).toBe(false)
  })
})

describe('F2 · fechas y expiración de token', () => {
  it('formatConnectionDate tolera vacío e inválido', () => {
    expect(formatConnectionDate(null)).toBe('—')
    expect(formatConnectionDate('no-es-fecha')).toBe('—')
    expect(formatConnectionDate('2026-01-15T10:30:00Z')).not.toBe('—')
  })

  it('tokenExpiringSoon avisa solo en la ventana de 7 días', () => {
    const now = new Date('2026-11-20T12:00:00Z')
    expect(tokenExpiringSoon('2026-11-23T12:00:00Z', now)).toBe(true) // 3 días
    expect(tokenExpiringSoon('2027-11-20T12:00:00Z', now)).toBe(false) // 1 año
    expect(tokenExpiringSoon('2026-11-19T12:00:00Z', now)).toBe(false) // ya venció
    expect(tokenExpiringSoon(null, now)).toBe(false)
  })
})

describe('F2 · parseo del evento Embedded Signup', () => {
  const payloadValido = {
    type: 'WA_EMBEDDED_SIGNUP',
    data: { session: { exchange_response_code: 'AQBx...', phone_number_id: '1234567890', waba_id: '9876543210' } },
  }

  it('extrae code, phoneNumberId y wabaId del evento de Meta', () => {
    const p = parseEmbeddedSignupMessage(payloadValido)
    expect(p).toEqual({ code: 'AQBx...', phoneNumberId: '1234567890', wabaId: '9876543210' })
  })

  it('ignora mensajes que no son de WhatsApp Embedded Signup', () => {
    expect(parseEmbeddedSignupMessage({ type: 'other.event' })).toBeNull()
    expect(parseEmbeddedSignupMessage(null)).toBeNull()
    expect(parseEmbeddedSignupMessage('texto')).toBeNull()
  })

  it('un evento sin code o phoneNumberId no dispara el POST', () => {
    expect(parseEmbeddedSignupMessage({ type: 'WA_EMBEDDED_SIGNUP', data: { session: {} } })).toBeNull()
    expect(parseEmbeddedSignupMessage({ type: 'WA_EMBEDDED_SIGNUP', data: { session: { exchange_response_code: 'x' } } })).toBeNull()
  })

  it('wabaId es opcional y llega vacío si Meta no lo envió', () => {
    const p = parseEmbeddedSignupMessage({
      type: 'WA_EMBEDDED_SIGNUP',
      data: { session: { exchange_response_code: 'c1', phone_number_id: 'p1' } },
    })
    expect(p?.wabaId).toBe('')
  })

  it('el resultado del flujo se resume para el operador', () => {
    expect(embeddedSignupOutcome({ type: 'WA_EMBEDDED_SIGNUP', status: 'COMPLETED' })).toBe('Conexión completada en Meta')
    expect(embeddedSignupOutcome({ type: 'WA_EMBEDDED_SIGNUP', status: 'CANCELLED' })).toBe('Conexión cancelada por el usuario')
    expect(embeddedSignupOutcome({ type: 'WA_EMBEDDED_SIGNUP', message: 'Falta permiso' })).toBe('Falta permiso')
    expect(embeddedSignupOutcome({ type: 'other' })).toBeNull()
  })
})

describe('F2 · URL del SDK de Meta', () => {
  it('usa la versión de Graph configurada', () => {
    expect(embeddedSignupSdkUrl('v21.0')).toContain('version=v21.0')
    expect(embeddedSignupSdkUrl()).toContain('connect.facebook.net')
  })
})
