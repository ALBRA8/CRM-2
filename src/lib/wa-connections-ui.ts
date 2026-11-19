/**
 * F2 — Helpers PUROS de la UI de conexiones WhatsApp multi-número.
 *
 * Sin React, sin DOM: los consume `src/components/settings/connections-tab.tsx`
 * y los testea `tests/unit/wa-connections-ui.test.ts` en entorno node.
 * La lógica de conexión/desconexión/verificación queda así fuera del JSX y
 * cubierta por pruebas unitarias (misma filosofía que el resto del repo).
 */

/** Estado de una conexión (modelo WhatsAppConnection.status). */
export type WaConnectionStatus = 'pending' | 'connected' | 'disconnected' | 'revoked' | 'error'

export interface StatusBadge {
  label: string
  /** Clases tailwind del Badge (border/text/bg) coherentes con el resto de la app. */
  classes: string
}

/**
 * Mapa estado → etiqueta + color. El estado real del veredicto de sesión
 * manda: `connected` solo si el token sigue vigente (verify lo confirma).
 */
export function connectionStatusBadge(status: string | null | undefined): StatusBadge {
  switch (status) {
    case 'connected':
      return { label: 'Conectado', classes: 'border-emerald-200 text-emerald-700 bg-emerald-50' }
    case 'pending':
      return { label: 'Pendiente', classes: 'border-amber-200 text-amber-700 bg-amber-50' }
    case 'revoked':
      return { label: 'Token revocado', classes: 'border-red-200 text-red-700 bg-red-50' }
    case 'error':
      return { label: 'Error', classes: 'border-red-200 text-red-700 bg-red-50' }
    case 'disconnected':
      return { label: 'Desconectado', classes: 'border-slate-200 text-slate-500 bg-slate-50' }
    default:
      return { label: 'Desconocido', classes: 'border-slate-200 text-slate-500 bg-slate-50' }
  }
}

/** Tipo de evento de conexión → etiqueta legible en el registro de eventos. */
export function eventTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case 'connected':
      return 'Conectado'
    case 'disconnected':
      return 'Desconectado'
    case 'revoked':
      return 'Token revocado'
    case 'token_rotated':
      return 'Token rotado'
    case 'verified':
      return 'Verificado contra Meta'
    case 'error':
      return 'Error'
    case 'plan_limit_blocked':
      return 'Bloqueado por límite del plan'
    default:
      return type || 'Evento'
  }
}

/** Etiqueta de la fuente de conexión (source del modelo). */
export function connectionSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case 'embedded_signup':
      return 'Embedded Signup de Meta'
    case 'manual':
      return 'Registro manual'
    default:
      return source || 'Desconocida'
  }
}

/**
 * Texto del uso del plan para la cabecera de la pestaña.
 * maxConnections <= 0 significa ilimitado.
 */
export function planUsageText(active: number, max: number, label: string): string {
  // El sustantivo concuerda con el LÍMITE ("1 de 3 conexiones activas");
  // en plan ilimitado concuerda con las activas.
  const noun = max === 1 ? 'conexión activa' : 'conexiones activas'
  if (max <= 0) {
    const freeNoun = active === 1 ? 'conexión activa' : 'conexiones activas'
    return `Plan ${label}: ${active} ${freeNoun} (sin límite)`
  }
  return `Plan ${label}: ${active} de ${max} ${noun}`
}

/**
 * ¿Debe la UI mostrar aviso de que el plan está agotado?
 * Bloquea el formulario de conexión nueva (la API respondería 402).
 */
export function planLimitReached(active: number, max: number): boolean {
  return max > 0 && active >= max
}

export interface ManualFormErrors {
  [key: string]: string | undefined
  phoneNumberId?: string
  accessToken?: string
}

/**
 * Validación del formulario de conexión manual (Cloud API).
 * La API exige phoneNumberId y accessToken; aquí se anticipan los errores
 * para no disparar un POST que sabemos que va a fallar.
 */
export function validateManualForm(input: { phoneNumberId: string; accessToken: string }): ManualFormErrors {
  const errors: ManualFormErrors = {}
  if (!input.phoneNumberId.trim()) errors.phoneNumberId = 'El Phone Number ID es obligatorio'
  if (!input.accessToken.trim()) errors.accessToken = 'El token de acceso es obligatorio'
  else if (input.accessToken.trim().length < 32) {
    errors.accessToken = 'El token de Meta es más corto de lo esperado (revisa que copiaste el token completo)'
  }
  return errors
}

/**
 * Puerta de la confirmación doble de desconexión: el botón solo se habilita
 * cuando el operador teclea exactamente la palabra exigida.
 */
export const DISCONNECT_CONFIRM_WORD = 'DESCONECTAR'

export function canAttemptDisconnect(confirmText: string): boolean {
  return confirmText.trim() === DISCONNECT_CONFIRM_WORD
}

/** Fecha corta local (es) para tarjetas y registro; tolera valores vacíos. */
export function formatConnectionDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * ¿El token está por vencer en menos de 7 días? (aviso preventivo de rotación).
 */
export function tokenExpiringSoon(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  return d.getTime() - now.getTime() > 0 && d.getTime() - now.getTime() < sevenDays
}

/** Payload del evento WA_EMBEDDED_SIGNUP que Meta emite vía window message. */
export interface EmbeddedSignupMessage {
  type?: string
  data?: { session?: { exchange_response_code?: string; phone_number_id?: string; waba_id?: string } }
  status?: string
  message?: string
}

export interface EmbeddedSignupPayload {
  code: string
  phoneNumberId: string
  wabaId: string
}

/**
 * Extrae el payload del mensaje `WA_EMBEDDED_SIGNUP` del SDK de Meta.
 * Solo acepta eventos con ese type exacto y con el código del canje; cualquier
 * otra cosa (mensajes del navegador, otras apps) se ignora con null.
 */
export function parseEmbeddedSignupMessage(msg: unknown): EmbeddedSignupPayload | null {
  if (!msg || typeof msg !== 'object') return null
  const m = msg as EmbeddedSignupMessage
  if (m.type !== 'WA_EMBEDDED_SIGNUP') return null
  const code = m.data?.session?.exchange_response_code
  const phoneNumberId = m.data?.session?.phone_number_id
  if (!code || !phoneNumberId) return null
  return { code, phoneNumberId, wabaId: m.data?.session?.waba_id ?? '' }
}

/** Resumen legible del estado final que reporta el evento de Meta. */
export function embeddedSignupOutcome(msg: unknown): string | null {
  if (!msg || typeof msg !== 'object') return null
  const m = msg as EmbeddedSignupMessage
  if (m.type !== 'WA_EMBEDDED_SIGNUP') return null
  if (m.status === 'COMPLETED') return 'Conexión completada en Meta'
  if (m.status === 'CANCELLED') return 'Conexión cancelada por el usuario'
  return m.message || m.status || null
}

/** URL del SDK de Meta para la versión de Graph configurada. */
export function embeddedSignupSdkUrl(graphVersion = 'v21.0'): string {
  return `https://connect.facebook.net/es_ES/sdk.js#xfbml=1&version=${graphVersion}`
}
