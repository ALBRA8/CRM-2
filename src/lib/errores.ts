/**
 * U3 — Catálogo central de errores ACCIONABLES (plan definitivo, fase 4).
 *
 * Invariantes (testeadas en tests/unit/errores.test.ts):
 *  1. Todo texto habla en lenguaje del USUARIO: jamás nombra archivos, rutas,
 *     comandos ni SQL. Ante un fallo el usuario ve QUÉ pasó, QUÉ hacer y el
 *     paso a paso; cuándo pedir soporte queda dicho en la solución.
 *  2. El catálogo cubre los 20 errores más frecuentes del CRM (incluidos los
 *     códigos de Meta que clasifican los adaptadores: META_ERROR_<n>,
 *     META_HTTP_<status>, INVALID_PROVIDER_INPUT) y un fallback seguro.
 *  3. `mensajeDeError()` NUNCA lanza: ante entrada rara devuelve el fallback
 *     con el detalle técnico preservado para soporte.
 */

export interface ErrorEntry {
  /** Código estable del catálogo (no lo ve el usuario; sirve para mapear). */
  codigo: string
  /** Título en lenguaje del usuario (qué pasó). */
  titulo: string
  /** Solución clara (qué hacer). */
  solucion: string
  /** Paso a paso concreto (cómo hacerlo). */
  paso: string
}

const CATALOGO: Record<string, ErrorEntry> = {
  SESION_EXPIRADA: {
    codigo: 'SESION_EXPIRADA',
    titulo: 'Tu sesión finalizó',
    solucion: 'Vuelve a iniciar sesión para continuar. Tu trabajo guardado está a salvo.',
    paso: 'Cierra este aviso, pulsa "Entrar" en la pantalla principal e inicia sesión con tu correo y contraseña. Si no recuerdas la contraseña, usa "Recuperar acceso".',
  },
  SIN_PERMISOS: {
    codigo: 'SIN_PERMISOS',
    titulo: 'Esta acción necesita permisos de administrador',
    solucion: 'Pide a un administrador de tu empresa que realice esta acción o te ascienda a administrador.',
    paso: 'Ve a Ajustes → Equipo y comparte con tu administrador qué querías hacer; él podrá hacerlo o darte el permiso necesario.',
  },
  NO_ENCONTRADO: {
    codigo: 'NO_ENCONTRADO',
    titulo: 'No encontramos lo que buscabas',
    solucion: 'El registro pudo eliminarse o pertenece a otra empresa. Actualiza la lista e inténtalo de nuevo.',
    paso: 'Pulsa "Actualizar" en la pantalla donde estabas. Si el elemento sigue sin aparecer, confirma que estás en la empresa correcta (selector de organización).',
  },
  CONEXION_CAIDA: {
    codigo: 'CONEXION_CAIDA',
    titulo: 'No pudimos comunicarnos con el servidor',
    solucion: 'Suele ser momentáneo. Revisa tu conexión a internet y vuelve a intentarlo en unos segundos.',
    paso: '1) Comprueba tu wifi o datos móviles. 2) Pulsa "Actualizar". 3) Si persiste más de 5 minutos, contacta a soporte indicando la hora exacta del fallo.',
  },
  LIMITE_PLAN_ALCANZADO: {
    codigo: 'LIMITE_PLAN_ALCANZADO',
    titulo: 'Alcanzaste el límite de números de tu plan',
    solucion: 'Amplía tu plan o desconecta un número para poder conectar otro.',
    paso: 'Ve a Ajustes → Conexiones: verás cuántas conexiones usas de las disponibles en tu plan. Para ampliar, contacta a soporte o a tu punto de venta.',
  },
  NUMERO_DUPLICADO: {
    codigo: 'NUMERO_DUPLICADO',
    titulo: 'Ese número ya está conectado',
    solucion: 'Cada número de WhatsApp se conecta una sola vez por empresa. Revisa la lista de conexiones.',
    paso: 'Ve a Ajustes → Conexiones y busca el número por su identificador. Si aparece conectado y no deberías tenerlo, un administrador puede desconectarlo con el botón "Desconectar".',
  },
  TOKEN_INVALIDO: {
    codigo: 'TOKEN_INVALIDO',
    titulo: 'WhatsApp rechazó el acceso de este número',
    solucion: 'El permiso del número expiró o fue revocado en Meta. Reconecta el número para restaurar el servicio.',
    paso: 'Ve a Ajustes → Conexiones, pulsa "Verificar" para confirmarlo y luego "Desconectar" + conectar de nuevo con un token vigente del panel de WhatsApp Business.',
  },
  TOKEN_NO_CONFIGURADO: {
    codigo: 'TOKEN_NO_CONFIGURADO',
    titulo: 'Este número quedó sin credencial activa',
    solucion: 'La conexión existe pero no tiene permiso guardado: hay que conectarla de nuevo.',
    paso: 'Ve a Ajustes → Conexiones, desconecta el número afectado y conéctalo otra vez (manual o con el flujo oficial de Meta).',
  },
  META_REENGAJE_24H: {
    codigo: 'META_REENGAJE_24H',
    titulo: 'Pasaron más de 24 h sin respuesta del cliente',
    solucion: 'WhatsApp solo permite mensajes libres dentro de 24 h. Usa una plantilla aprobada para reabrir la conversación.',
    paso: '1) En la bandeja, elige la conversación. 2) Envía una plantilla aprobada (por ejemplo, una de seguimiento). 3) Cuando el cliente responda, la ventana de 24 h se reabre automáticamente.',
  },
  META_RATE_LIMIT: {
    codigo: 'META_RATE_LIMIT',
    titulo: 'WhatsApp está limitando el envío por volumen',
    solucion: 'Hay demasiados mensajes por segundo. Espera unos minutos y reenvía; no dupliques el mensaje varias veces.',
    paso: '1) Espera 5-10 minutos. 2) Reenvía desde la bandeja. 3) Si te ocurre a diario, pide a soporte una revisión de la calidad y el nivel de tu número.',
  },
  META_PARAMETRO_INVALIDO: {
    codigo: 'META_PARAMETRO_INVALIDO',
    titulo: 'WhatsApp rechazó el mensaje por un dato inválido',
    solucion: 'Revisa el número de teléfono y el contenido: algún dato está incompleto o mal escrito.',
    paso: '1) Abre la ficha del cliente y corrige el teléfono (con código de país, sin espacios). 2) Revisa que el mensaje no esté vacío. 3) Reenvía.',
  },
  META_NUMERO_INVALIDO: {
    codigo: 'META_NUMERO_INVALIDO',
    titulo: 'Ese teléfono no puede recibir WhatsApp',
    solucion: 'El número no existe en WhatsApp o no pertenece a la persona. Confírmalo con el cliente.',
    paso: '1) Verifica el teléfono en la ficha del cliente (código de país incluido). 2) Confirma con el cliente que ese número tiene WhatsApp activo. 3) Corrige y reenvía.',
  },
  META_PLANTILLA_NO_APROBADA: {
    codigo: 'META_PLANTILLA_NO_APROBADA',
    titulo: 'La plantilla usada no está aprobada por WhatsApp',
    solucion: 'Solo se pueden iniciar conversaciones con plantillas aprobadas. Aprobala en Meta o usa otra.',
    paso: '1) Ve al panel de WhatsApp Business → Plantillas. 2) Crea o corrige la plantilla y envíala a aprobación. 3) Mientras tanto, espera a que el cliente escriba primero.',
  },
  META_CUENTA_RESTINGIDA: {
    codigo: 'META_CUENTA_RESTINGIDA',
    titulo: 'La cuenta de WhatsApp Business tiene restricciones',
    solucion: 'Meta limitó la cuenta del número. Revisa el panel de calidad de WhatsApp Business.',
    paso: '1) Entra al panel de WhatsApp Business con la cuenta dueña del número. 2) Revisa la sección de calidad y alertas. 3) Sigue los pasos que Meta indica y contacta a soporte si está bloqueada.',
  },
  ENVIO_EN_COLA: {
    codigo: 'ENVIO_EN_COLA',
    titulo: 'Tu mensaje quedó en cola de envío',
    solucion: 'El sistema lo guardó y lo enviará en cuanto el canal esté disponible. No es necesario reenviarlo.',
    paso: 'Vigila el estado del mensaje en el hilo: pasará de "en cola" a "enviado". Si sigue "en cola" más de 30 minutos, usa Ajustes → Envíos para revisar.',
  },
  ENVIO_INCERTO: {
    codigo: 'ENVIO_INCERTO',
    titulo: 'No pudimos confirmar si el mensaje llegó',
    solucion: 'El proveedor no confirmó la entrega. Verifica en el panel del proveedor y concilia el envío con evidencia.',
    paso: 'Ve a Ajustes → Envíos, busca el mensaje marcado como UNCERTAIN, verifica en el panel de Meta/TikTok y pulsa "Conciliar" indicando el ID del mensaje o qué verificaste.',
  },
  CANAL_NO_CONFIGURADO: {
    codigo: 'CANAL_NO_CONFIGURADO',
    titulo: 'Este canal todavía no está conectado',
    solucion: 'Conecta primero el canal (WhatsApp, Telegram, Instagram o Facebook) desde Ajustes.',
    paso: 'Ve a Ajustes y elige la pestaña del canal que falta. Cada canal indica qué datos necesita; guárdalos y vuelve a intentar el envío.',
  },
  ARCHIVO_GRANDE: {
    codigo: 'ARCHIVO_GRANDE',
    titulo: 'El archivo es demasiado grande',
    solucion: 'Usa un archivo más liviano (o cómprimelo) y vuelve a intentarlo.',
    paso: '1) Reduce el peso del archivo (imágenes: guarda como JPG; PDFs: comprime). 2) Vuelve a subirlo. Si necesitas enviar archivos muy pesados, contacta a soporte para revisar alternativas.',
  },
  DATOS_INCOMPLETOS: {
    codigo: 'DATOS_INCOMPLETOS',
    titulo: 'Faltan datos obligatorios en el formulario',
    solucion: 'Completa los campos marcados en rojo y vuelve a guardar.',
    paso: 'Revisa el formulario: los campos con mensaje en rojo indican qué falta o qué formato se espera (por ejemplo, teléfono con código de país).',
  },
  ERROR_DESCONOCIDO: {
    codigo: 'ERROR_DESCONOCIDO',
    titulo: 'Algo salió mal',
    solucion: 'Reintenta la acción en unos segundos. Si vuelve a fallar, contacta a soporte con el detalle.',
    paso: '1) Pulsa "Actualizar" e inténtalo otra vez. 2) Si falla dos veces seguidas, anota la hora y lo que estabas haciendo. 3) Contacta a soporte con esa información; el detalle técnico queda en el aviso.',
  },
}

/** Códigos del catálogo en orden de definición. */
export function codigosDeError(): string[] {
  return Object.keys(CATALOGO)
}

/** Busca una entrada por código exacto (o null si no existe). */
export function entradaPorCodigo(codigo: string): ErrorEntry | null {
  return CATALOGO[codigo] ?? null
}

/**
 * Patrones de mensaje técnico → entrada del catálogo. El orden importa:
 * primero los más específicos.
 */
const PATRONES: Array<{ patron: RegExp; codigo: string }> = [
  { patron: /sesi[óo]n revocada|vuelve a iniciar sesi[óo]n|token.*expir|expired token/i, codigo: 'SESION_EXPIRADA' },
  { patron: /401|no autorizado|unauthorized/i, codigo: 'SESION_EXPIRADA' },
  { patron: /403|permiso|solo un administrador/i, codigo: 'SIN_PERMISOS' },
  { patron: /404|no encontrad/i, codigo: 'NO_ENCONTRADO' },
  { patron: /402|l[íi]mite.*plan|plan_limit/i, codigo: 'LIMITE_PLAN_ALCANZADO' },
  { patron: /duplicate|ya est[áa] conectad|409/i, codigo: 'NUMERO_DUPLICADO' },
  { patron: /token revocado|revoked|token rechazado/i, codigo: 'TOKEN_INVALIDO' },
  { patron: /sin material de token|sin token vigente/i, codigo: 'TOKEN_NO_CONFIGURADO' },
  { patron: /META_ERROR_131047|24 ?h|re-engagement|reengaje/i, codigo: 'META_REENGAJE_24H' },
  { patron: /META_ERROR_131056|META_HTTP_429|rate.?limit|80007/i, codigo: 'META_RATE_LIMIT' },
  { patron: /META_ERROR_131030|META_ERROR_131026|META_ERROR_131021|no.*whatsapp|recipient/i, codigo: 'META_NUMERO_INVALIDO' },
  { patron: /META_ERROR_132|plantilla|template/i, codigo: 'META_PLANTILLA_NO_APROBADA' },
  { patron: /META_ERROR_136|META_ERROR_137|restringid|bloquead|suspend/i, codigo: 'META_CUENTA_RESTINGIDA' },
  { patron: /INVALID_PROVIDER_INPUT|META_ERROR_100|META_HTTP_400|par[áa]metro/i, codigo: 'META_PARAMETRO_INVALIDO' },
  { patron: /unknown|uncertain|UNCERTAIN|DELIVERY_UNCERTAIN/i, codigo: 'ENVIO_INCERTO' },
  { patron: /en cola|queued|outbox/i, codigo: 'ENVIO_EN_COLA' },
  { patron: /canal.*no.*(configurado|disponible)|canal no/i, codigo: 'CANAL_NO_CONFIGURADO' },
  { patron: /demasiado grande|413|too large|tama[ñn]o/i, codigo: 'ARCHIVO_GRANDE' },
  { patron: /campos requeridos|obligator|faltan|requerid/i, codigo: 'DATOS_INCOMPLETOS' },
  { patron: /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|502|503|504|Error de conexi[óo]n/i, codigo: 'CONEXION_CAIDA' },
]

/**
 * Traduce CUALQUIER error (código, mensaje técnico, excepción) a una entrada
 * del catálogo. Nunca lanza: ante entrada vacía o rara devuelve
 * ERROR_DESCONOCIDO con el detalle original preservado.
 */
export function mensajeDeError(input: unknown): ErrorEntry & { detalle: string | null } {
  let text = ''
  if (typeof input === 'string') text = input
  else if (input instanceof Error) text = input.message
  else if (input && typeof input === 'object') {
    const maybe = input as { error?: unknown; message?: unknown; errorCode?: unknown }
    text = [maybe.error, maybe.message, maybe.errorCode].find((v) => typeof v === 'string' && v) as string || ''
  }
  const detail = text.trim() || null
  // 1) Código exacto del catálogo
  if (text && CATALOGO[text.trim()]) return { ...CATALOGO[text.trim()], detalle: detail }
  // 2) Patrones de mensaje técnico (incluidos META_ERROR_<n> y META_HTTP_<n>)
  for (const p of PATRONES) {
    if (p.patron.test(text)) return { ...CATALOGO[p.codigo], detalle: detail }
  }
  return { ...CATALOGO.ERROR_DESCONOCIDO, detalle: detail }
}
