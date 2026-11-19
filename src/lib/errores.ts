/**
 * errores.ts — CATÁLOGO CENTRAL DE ERRORES ACCIONABLES (U3/F4-T03 del plan
 * definitivo CRM-ALBRA v2.0).
 *
 * Problema: los errores de la UI hablaban en términos técnicos (archivos,
 * comandos, códigos HTTP) y no decían al usuario qué hacer.
 *
 * Contrato del catálogo (invariante, verificado en pruebas):
 *  - cada entrada tiene código único, título en lenguaje de usuario, solución
 *    y AL MENOS un paso concreto;
 *  - NINGÚN texto del catálogo nombra archivos, rutas, comandos, SQL ni
 *    máquinas: ante un fallo el usuario ve qué pasó y qué hacer (y cuándo
 *    pedir soporte);
 *  - incluye los códigos sanitizados del despachador de canales (Meta) para
 *    que los estados unknown/failed de la outbox se expliquen en claro;
 *  - `resolveError` SIEMPRE devuelve una entrada: código desconocido cae al
 *    genérico (fail-safe de UX), nunca un mensaje de desarrollador.
 *
 * El catálogo es ADITIVO (reversión limpia): adoptar entradas nuevas en más
 * pantallas es un reemplazo progresivo sin tocar este módulo.
 */

export type ErrorView = 'inbox' | 'wa-connections' | 'settings' | 'automations' | 'outbox' | 'health' | 'quotes' | 'whatsapp'

export interface ErrorEntry {
  /** Código técnico estable (para mapear respuestas de API y logs). */
  code: string
  /** Título en lenguaje de usuario (qué pasó, sin jerga). */
  titulo: string
  /** Qué significa en términos de negocio (opcional, una frase). */
  explicacion?: string
  /** Solución en una frase: qué hacer para resolverlo. */
  solucion: string
  /** Pasos concretos, uno por elemento, en orden. */
  pasos: string[]
  /** Acción directa (1 clic) si existe una vista que resuelve el problema. */
  accion?: { label: string; view: ErrorView }
  /** true si tras seguir los pasos el usuario debe contactar a soporte. */
  requiereSoporte?: boolean
}

/* ──── Conexiones WhatsApp ──── */

const plan_limit: ErrorEntry = {
  code: 'plan_limit',
  titulo: 'Alcanzaste el límite de números de tu plan',
  explicacion: 'Cada plan permite un número máximo de WhatsApp conectados a la vez.',
  solucion: 'Libera un número desconectando uno que no uses o mejora de plan.',
  pasos: [
    'Abre Conexiones de WhatsApp.',
    'Desconecta un número que ya no uses (el token se destruye y libera el cupo).',
    'Vuelve a intentar conectar el número nuevo.',
  ],
  accion: { label: 'Gestionar números', view: 'wa-connections' },
}

const duplicate: ErrorEntry = {
  code: 'duplicate',
  titulo: 'Ese número ya está conectado en otra cuenta',
  explicacion: 'Un número de WhatsApp solo puede estar conectado a una organización del CRM.',
  solucion: 'Desconéctalo primero de la otra cuenta y luego conéctalo aquí.',
  pasos: [
    'Identifica con quién administra la otra cuenta donde el número está conectado.',
    'Desconecta el número desde esa otra cuenta.',
    'Repite la conexión desde aquí.',
  ],
  accion: { label: 'Ver mis números', view: 'wa-connections' },
}

const invalid_token: ErrorEntry = {
  code: 'invalid_token',
  titulo: 'Meta rechazó el token de acceso',
  explicacion: 'El token que se intentó registrar no es válido para ese número, o expiró.',
  solucion: 'Genera un token nuevo en WhatsApp Manager y vuelve a registrar el número.',
  pasos: [
    'Abre WhatsApp Manager y entra a Configuración de la API.',
    'Genera un token de acceso vigente.',
    'Conecta el número de nuevo con el token nuevo.',
  ],
  accion: { label: 'Conectar número', view: 'wa-connections' },
}

const revoked: ErrorEntry = {
  code: 'revoked',
  titulo: 'WhatsApp revocó la autorización del número',
  explicacion: 'Meta retiró el permiso del número: puede haber caducado o se revocó desde Meta Business.',
  solucion: 'Reconecta el número para generar una autorización nueva.',
  pasos: [
    'Abre Conexiones de WhatsApp.',
    'Conecta el número de nuevo (flujo oficial de Meta o token nuevo).',
  ],
  accion: { label: 'Reconectar número', view: 'wa-connections' },
}

const wa_no_connection: ErrorEntry = {
  code: 'wa_no_connection',
  titulo: 'Tu organización no tiene números de WhatsApp conectados',
  solucion: 'Conecta el primer número para empezar a recibir y enviar mensajes.',
  pasos: [
    'Abre Conexiones de WhatsApp.',
    'Conecta un número con el flujo oficial de Meta.',
  ],
  accion: { label: 'Conectar el primer número', view: 'wa-connections' },
}

/* ──── Bandeja y envíos ──── */

const delivery_uncertain: ErrorEntry = {
  code: 'DELIVERY_UNCERTAIN',
  titulo: 'No sabemos si el mensaje llegó (resultado incierto)',
  explicacion: 'La conexión se cortó después de enviar y el proveedor no confirmó la entrega.',
  solucion: 'Comprueba el estado en WhatsApp Manager y concilia el envío con esa evidencia.',
  pasos: [
    'Abre Reconciliación en el menú (solo administradores).',
    'Verifica en WhatsApp Manager si el mensaje fue entregado.',
    'Resuelve el caso marcando si llegó o no, con la evidencia: queda auditado.',
  ],
  accion: { label: 'Resolver en Reconciliación', view: 'outbox' },
}

const worker_interrupted: ErrorEntry = {
  code: 'WORKER_INTERRUPTED',
  titulo: 'Un envío quedó sin resolver por un corte del sistema',
  explicacion: 'El servidor se detuvo mientras procesaba el envío.',
  solucion: 'Concilia el caso en Reconciliación con la evidencia del proveedor.',
  pasos: [
    'Abre Reconciliación en el menú.',
    'Resuelve el envío incierto con la evidencia de WhatsApp Manager.',
  ],
  accion: { label: 'Ir a Reconciliación', view: 'outbox' },
}

const invalid_provider_input: ErrorEntry = {
  code: 'INVALID_PROVIDER_INPUT',
  titulo: 'El mensaje no se pudo entregar por datos inválidos',
  explicacion: 'El teléfono o el contenido del mensaje no son válidos para el proveedor.',
  solucion: 'Corrige el número del contacto (con código de país) y el contenido, y vuelve a enviar.',
  pasos: [
    'Abre la ficha del cliente y verifica el teléfono (código de país incluido).',
    'Vuelve a enviar el mensaje desde la bandeja.',
  ],
  accion: { label: 'Abrir bandeja', view: 'inbox' },
}

const meta_http: ErrorEntry = {
  code: 'META_HTTP',
  titulo: 'WhatsApp (Meta) no respondió correctamente',
  explicacion: 'El proveedor devolvió un error temporal o de servicio.',
  solucion: 'Reintenta en unos minutos; si persiste, revisa la Salud del sistema.',
  pasos: [
    'Espera unos minutos y vuelve a intentar el envío.',
    'Abre Salud del sistema para confirmar que todo está en orden.',
  ],
  accion: { label: 'Ver Salud del sistema', view: 'health' },
}

const meta_error: ErrorEntry = {
  code: 'META_ERROR',
  titulo: 'WhatsApp (Meta) rechazó el mensaje',
  explicacion: 'El número de destino, la plantilla o la ventana de 24 horas no lo permiten.',
  solucion: 'Verifica el número del contacto y si la conversación tiene ventana abierta.',
  pasos: [
    'Confirma el teléfono del contacto con código de país.',
    'Si es una conversación nueva de plantilla, envía una plantilla aprobada por Meta.',
    'Reintenta el envío desde la bandeja.',
  ],
  accion: { label: 'Abrir bandeja', view: 'inbox' },
}

const no_llm: ErrorEntry = {
  code: 'no_llm',
  titulo: 'El agente IA no está configurado',
  explicacion: 'Sin el proveedor de inteligencia artificial, el agente no puede contestar.',
  solucion: 'Configura el proveedor IA y el modelo en Ajustes.',
  pasos: [
    'Abre Configuración.',
    'En la sección del agente IA, define el proveedor y el modelo.',
    'Guarda y envía un mensaje de prueba por WhatsApp.',
  ],
  accion: { label: 'Configurar agente IA', view: 'settings' },
}

/* ──── Sesión, permisos y sesión de WhatsApp legacy ──── */

const unauthorized: ErrorEntry = {
  code: 'unauthorized',
  titulo: 'Tu sesión expiró o no tienes permisos para esto',
  solucion: 'Vuelve a iniciar sesión; si el problema continúa, pide el permiso a un administrador.',
  pasos: [
    'Cierra sesión y vuelve a entrar con tu usuario.',
    'Si necesitas permisos de administrador, pídelo al administrador de tu organización.',
  ],
}

const forbidden_admin: ErrorEntry = {
  code: 'forbidden_admin',
  titulo: 'Solo un administrador puede hacer esto',
  explicacion: 'Conectar o desconectar números, conciliar envíos y ver la Salud son operaciones administrativas.',
  solucion: 'Pide al administrador de tu organización que realice la acción.',
  pasos: [
    'Identifica quién es el administrador u owner de tu organización.',
    'Solicítale la acción concreta (conectar número, conciliar envío, etc.).',
  ],
}

const qr_expired: ErrorEntry = {
  code: 'qr_expired',
  titulo: 'El código QR expiró',
  explicacion: 'WhatsApp renueva los códigos periódicamente por seguridad.',
  solucion: 'Genera un QR nuevo y escanéalo inmediatamente.',
  pasos: [
    'Abre la conexión por QR de nuevo.',
    'Escanea el código fresco con la cámara de WhatsApp.',
  ],
  accion: { label: 'Reintentar conexión', view: 'whatsapp' },
}

const daemon_offline: ErrorEntry = {
  code: 'daemon_offline',
  titulo: 'El servicio de WhatsApp no está disponible ahora',
  explicacion: 'El componente que conecta WhatsApp con el CRM está detenido o inalcanzable.',
  solucion: 'Espera unos minutos; si continúa, contacta a soporte (requiere intervenir el servidor).',
  pasos: [
    'Verifica la Salud del sistema para confirmar el estado.',
    'Si el problema continúa, contacta a soporte indicando la hora del intento.',
  ],
  accion: { label: 'Ver Salud del sistema', view: 'health' },
  requiereSoporte: true,
}

/* ──── Datos y operación ──── */

const not_found: ErrorEntry = {
  code: 'not_found',
  titulo: 'No encontramos ese elemento',
  explicacion: 'El registro fue eliminado o pertenece a otra cuenta.',
  solucion: 'Actualiza la lista y busca de nuevo; si acaba de borrarlo, no se puede recuperar desde aquí.',
  pasos: [
    'Refresca la pantalla o vuelve a entrar al módulo.',
    'Busca el elemento en la lista actualizada.',
  ],
}

const rate_limited: ErrorEntry = {
  code: 'rate_limited',
  titulo: 'Demasiadas acciones en poco tiempo',
  explicacion: 'El CRM protege las cuentas limitando acciones repetidas muy rápidas.',
  solucion: 'Espera un minuto y vuelve a intentarlo.',
  pasos: ['Espera un minuto sin repetir la acción.', 'Vuelve a intentarlo con calma.'],
}

const smtp_not_configured: ErrorEntry = {
  code: 'smtp_not_configured',
  titulo: 'El envío de correo no está configurado',
  explicacion: 'Sin servidor de correo, las notificaciones y correos automáticos no salen.',
  solucion: 'Configura el servidor de correo de tu organización en Ajustes.',
  pasos: [
    'Abre Configuración.',
    'Completa los datos del servidor de correo (host, puerto y credenciales).',
    'Envía un correo de prueba para confirmar.',
  ],
  accion: { label: 'Configurar correo', view: 'settings' },
}

const channel_not_supported: ErrorEntry = {
  code: 'channel_not_supported',
  titulo: 'Ese canal todavía no permite responder desde la bandeja',
  explicacion: 'La conversación existe, pero el canal aún no tiene envío habilitado en esta versión.',
  solucion: 'Responde al contacto por el canal original; el envío saliente llegará al resto de canales.',
  pasos: [
    'Identifica el canal de la conversación (WhatsApp, Telegram, Instagram, Messenger, TikTok).',
    'Contesta desde la app del canal si es de los aún sin envío.',
    'Los mensajes entrantes seguirán llegando a la bandeja.',
  ],
  accion: { label: 'Abrir bandeja', view: 'inbox' },
}

const generic: ErrorEntry = {
  code: 'generic',
  titulo: 'Algo salió mal',
  explicacion: 'Ocurrió un error inesperado al procesar tu solicitud.',
  solucion: 'Reintenta la acción; si vuelve a fallar, abre la Salud del sistema y contacta a soporte.',
  pasos: [
    'Reintenta la acción una vez.',
    'Abre Salud del sistema para ver si hay avisos activos.',
    'Si el problema continúa, contacta a soporte con la hora exacta del error.',
  ],
  accion: { label: 'Ver Salud del sistema', view: 'health' },
  requiereSoporte: true,
}

/* ──── Catálogo y resolución ──── */

/** Los 20 errores más frecuentes del CRM (criterio de aceptación del plan). */
export const CATALOGO_ERRORES: Record<string, ErrorEntry> = {
  plan_limit,
  duplicate,
  invalid_token,
  revoked,
  wa_no_connection,
  DELIVERY_UNCERTAIN: delivery_uncertain,
  WORKER_INTERRUPTED: worker_interrupted,
  INVALID_PROVIDER_INPUT: invalid_provider_input,
  META_HTTP: meta_http,
  META_ERROR: meta_error,
  no_llm,
  unauthorized,
  forbidden_admin,
  qr_expired,
  daemon_offline,
  not_found,
  rate_limited,
  smtp_not_configured,
  channel_not_supported,
  generic,
}

export const CATALOGO_SIZE = Object.keys(CATALOGO_ERRORES).length

/** Palabras clave de los códigos con prefijo variable del proveedor (Meta). */
const PREFIXED: Array<{ prefix: string; entry: ErrorEntry }> = [
  { prefix: 'META_HTTP_', entry: { ...meta_http, code: 'META_HTTP_*' } },
  { prefix: 'META_ERROR_', entry: { ...meta_error, code: 'META_ERROR_*' } },
]

/**
 * Resuelve SIEMPRE una entrada del catálogo (fail-safe de UX):
 *  1. código exacto del catálogo;
 *  2. prefijos conocidos del proveedor (META_HTTP_400, META_ERROR_131026…);
 *  3. genérico orientado a usuario (jamás un mensaje de desarrollador).
 * Acepta un código suelto, un objeto Error o el texto de error de la API.
 */
export function resolveError(input?: unknown): ErrorEntry {
  const raw = typeof input === 'string'
    ? input
    : input instanceof Error
      ? input.message
      : typeof input === 'object' && input !== null && 'code' in input
        ? String((input as { code: unknown }).code)
        : ''
  const code = raw.trim()
  if (Object.prototype.hasOwnProperty.call(CATALOGO_ERRORES, code)) return CATALOGO_ERRORES[code]
  const prefixed = PREFIXED.find((p) => code.startsWith(p.prefix))
  if (prefixed) return prefixed.entry
  return CATALOGO_ERRORES.generic
}

/**
 * ¿El texto de la API coincide con este catálogo? Útil cuando el mensaje del
 * servidor ES la solución (los textos de la API ya están escritos para el
 * usuario): se muestra tal cual y se enriquece con la entrada si hay match.
 */
export function matchesApiMessage(message: string): ErrorEntry | null {
  const m = (message || '').trim()
  if (!m) return null
  for (const entry of Object.values(CATALOGO_ERRORES)) {
    if (entry.solucion === m || entry.titulo === m) return entry
  }
  // Coincidencia por frase clave de las soluciones más distintivas
  if (m.includes('número(s) conectado(s)') || m.includes('Libera un número')) return CATALOGO_ERRORES.plan_limit
  if (m.includes('ya está conectado')) return CATALOGO_ERRORES.duplicate
  if (m.includes('administrador')) return CATALOGO_ERRORES.forbidden_admin
  return null
}
