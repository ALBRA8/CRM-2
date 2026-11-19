/**
 * (U3) errores.ts — catálogo central de errores ACCIONABLES.
 *
 * Problema: los errores de la UI hablaban en términos técnicos (archivos,
 * comandos, códigos HTTP) y no decían al usuario qué hacer.
 *
 * Contrato del catálogo (patrón del plan F4-T03):
 *  - `code`: identificador estable de la entrada.
 *  - `title`: qué pasó, en lenguaje del negocio (sin archivos ni comandos).
 *  - `solution`: qué hacer, en lenguaje del negocio.
 *  - `steps`: paso a paso opcional.
 *  - `support`: cuándo pedir soporte en vez de intentar arreglarlo.
 *  - `metaCodes`: códigos de error reales de Meta Cloud API que clasifican
 *    a esta entrada (canal WhatsApp Cloud).
 *  - `match`: patrones (minúsculas) para clasificar mensajes técnicos que
 *    ya circulan en la app sin tocar sus textos originales.
 *
 * INVARIANTE (testeado): NINGÚN texto del catálogo nombra archivos,
 * extensiones ni comandos. Los detalles técnicos se quedan en el registro
 * del servidor; al usuario se le dice qué hacer, no cómo está hecho.
 */

export interface ErrorEntry {
  code: string
  title: string
  solution: string
  steps?: string[]
  /** Mostrar aviso de soporte junto a la solución. */
  support?: boolean
  metaCodes?: string[]
  /** Patrones en minúsculas contra el mensaje técnico. */
  match?: string[]
}

export const ERRORES: ErrorEntry[] = [
  // ---------- Canal WhatsApp (Baileys / Cloud) ----------
  {
    code: 'whatsapp_no_conectado',
    title: 'Tu número de WhatsApp no está conectado',
    solution: 'Conecta el número desde Ajustes antes de enviar mensajes.',
    steps: [
      'Abre Ajustes → Canales → Números WA',
      'Pulsa «Conectar» y escanea el código con tu WhatsApp',
    ],
    match: ['whatsapp not connected', 'not linked', 'session not found', 'no session'],
  },
  {
    code: 'whatsapp_sesion_expirada',
    title: 'La sesión de WhatsApp se cerró',
    solution: 'Reconecta el número escaneando un nuevo código.',
    steps: ['Ajustes → Canales → Números WA', 'Desconecta y vuelve a conectar escaneando el QR'],
    match: ['session expired', 'logged out', 'stream errored', 'connection closed'],
  },
  {
    code: 'whatsapp_otra_organizacion',
    title: 'Ese número está vinculado a otra organización',
    solution: 'Cada organización usa sus propios números. Pide ayuda al administrador de la plataforma.',
    support: true,
    match: ['otra organización', 'linked to another', 'already linked'],
  },
  {
    code: 'qr_expirado',
    title: 'El código de conexión venció',
    solution: 'Genera un código nuevo y escanéalo: dura unos minutos.',
    steps: ['Pulsa «Actualizar código» o vuelve a abrir la pantalla de conexión'],
    match: ['qr expired', 'qr timed out', 'code expired'],
  },
  {
    code: 'servicio_whatsapp_no_responde',
    title: 'El servicio de WhatsApp no responde',
    solution: 'Espera un minuto y reintenta. Si sigue igual, avisa al operador del sistema.',
    support: true,
    match: ['daemon', 'econnrefused', 'fetch failed', 'no alcanzable'],
  },
  {
    code: 'envio_fuera_de_ventana',
    title: 'Pasaron más de 24 horas desde el último mensaje del cliente',
    solution: 'Para escribirle de nuevo necesitas una plantilla aprobada.',
    steps: ['Usa una plantilla de WhatsApp o espera a que el cliente escriba primero'],
    metaCodes: ['131047'],
    match: ['131047', 're-engagement', '24 h'],
  },
  {
    code: 'mensaje_rechazado_por_politica',
    title: 'WhatsApp no entregó el mensaje',
    solution: 'Suele deberse a la calidad del número o al contenido. Revisa tus plantillas y la reputación del número; si persiste, contacta soporte.',
    support: true,
    metaCodes: ['131049'],
    match: ['131049'],
  },
  {
    code: 'plantilla_parametros',
    title: 'La plantilla necesita datos que faltan o sobran',
    solution: 'Revisa los campos de la plantilla al crear el mensaje.',
    metaCodes: ['133016'],
    match: ['133016', 'param count'],
  },
  {
    code: 'numero_invalido',
    title: 'El número de teléfono no es válido',
    solution: 'Corrige el número (con código de país, sin espacios) y reintenta.',
    steps: ['Ejemplo para Colombia: 57 + móvil', 'Quita espacios, guiones y ceros iniciales'],
    metaCodes: ['131030'],
    match: ['131030', 'invalid phone', 'invalid whatsapp id', 'not in whatsapp', 'invalid number', 'teléfono inválido', 'número inválido'],
  },
  {
    code: 'envio_incierto',
    title: 'No sabemos si el mensaje llegó',
    solution: 'Revísalo en Ajustes → Envíos: confirma con tu lista del proveedor y decide ahí si reenviar.',
    steps: ['Ajustes → Envíos → busca el mensaje en estado incierto', 'Confirma con el proveedor y aplica la conciliación'],
    match: ['uncertain', 'unknown status', 'delivery uncertain'],
  },
  {
    code: 'envio_duplicado',
    title: 'Ese mensaje ya estaba en camino',
    solution: 'No hace falta reenviarlo: el sistema evita duplicados.',
    match: ['duplicate', 'clientrequestid', 'already queued', 'idempot'],
  },
  // ---------- Canales configurables ----------
  {
    code: 'canal_sin_configurar',
    title: 'Ese canal todavía no está configurado',
    solution: 'Añade las credenciales del canal en Ajustes para empezar a recibir mensajes.',
    steps: ['Ajustes → Canales → pestaña del canal'],
    match: ['telegram', 'instagram', 'messenger', 'tiktok', 'not configured', 'sin configurar'],
  },
  // ---------- Sesión y permisos ----------
  {
    code: 'sesion_expirada',
    title: 'Tu sesión terminó',
    solution: 'Inicia sesión de nuevo para continuar.',
    match: ['401', 'unauthorized', 'token', 'sesión expirada', 'no autenticado'],
  },
  {
    code: 'permisos_insuficientes',
    title: 'Tu rol no permite esta acción',
    solution: 'Pide al dueño o administrador de la organización el acceso necesario.',
    match: ['403', 'forbidden', 'permiso', 'permissions'],
  },
  // ---------- Esquema (antes de Datos: es más específico que 'invalid') ----------
  {
    code: 'esquema_desactualizado',
    title: 'El sistema necesita una actualización pendiente',
    solution: 'Pide al operador del servidor que aplique la actualización del sistema.',
    support: true,
    match: ['schema', 'column', 'prisma', 'table'],
  },
  // ---------- Datos ----------
  {
    code: 'campos_faltantes',
    title: 'Faltan datos obligatorios',
    solution: 'Completa los campos marcados y vuelve a intentar.',
    match: ['400', 'required', 'missing', 'obligatorio', 'requerido', 'inválida', 'invalid'],
  },
  {
    code: 'registro_duplicado',
    title: 'Ese registro ya existe',
    solution: 'Busca el registro existente y ábrelo en lugar de crear uno nuevo.',
    match: ['unique', 'duplicate key', 'ya existe', 'p2002'],
  },
  {
    code: 'registro_no_encontrado',
    title: 'No encontramos ese registro',
    solution: 'Puede haberse eliminado o pertenecer a otra organización. Actualiza la lista.',
    match: ['404', 'not found', 'no encontrado'],
  },
  // ---------- Infraestructura ----------
  {
    code: 'limite_alcanzado',
    title: 'Demasiadas solicitudes seguidas',
    solution: 'Espera unos segundos y reintenta: el sistema se protege de saturaciones.',
    match: ['429', 'rate limit', 'too many'],
  },
  {
    code: 'conexion_internet',
    title: 'Problema de conexión',
    solution: 'Revisa tu conexión a internet y reintenta.',
    match: ['network', 'fetch failed', 'econn', 'timeout', 'abort', 'conexión'],
  },
  {
    code: 'error_interno',
    title: 'Algo salió mal en el sistema',
    solution: 'Reintenta en unos momentos. Si vuelve a pasar, contacta soporte indicando la hora exacta del error.',
    support: true,
    match: ['500', 'internal', 'error interno'],
  },
]

/** Entrada genérica cuando nada clasifica: nunca muestra datos técnicos. */
export const ERROR_GENERICO: ErrorEntry = {
  code: 'no_clasificado',
  title: 'No se pudo completar la acción',
  solution: 'Reintenta. Si vuelve a ocurrir, contacta soporte indicando la hora exacta.',
  support: true,
}

export function errorForCode(code: string | null | undefined): ErrorEntry | null {
  if (!code) return null
  return ERRORES.find((e) => e.code === code.toLowerCase()) ?? null
}

/** Clasifica un error real (mensaje técnico y/o código de proveedor). */
export function errorForMessage(message: string | null | undefined): ErrorEntry | null {
  if (!message) return null
  const m = message.toLowerCase()
  // Los códigos Meta tienen prioridad (más específicos).
  const metaHit = ERRORES.find((e) => e.metaCodes?.some((c) => m.includes(c)))
  if (metaHit) return metaHit
  const textHit = ERRORES.find((e) => e.match?.some((p) => m.includes(p)))
  return textHit ?? null
}

export function errorForMetaCode(metaCode: string | null | undefined): ErrorEntry | null {
  if (!metaCode) return null
  return ERRORES.find((e) => e.metaCodes?.includes(metaCode)) ?? null
}

export interface ExplainInput {
  /** Mensaje técnico que llega del fetch/throw (se clasifica, no se muestra). */
  message?: string | null
  /** Código interno estable (ver ERRORES). */
  code?: string | null
  /** Código de error del proveedor (p. ej. Meta Cloud API). */
  metaCode?: string | null
}

/**
 * Convierte cualquier error en una entrada accionable.
 * Orden de clasificación: code estable → metaCode → mensaje → genérico.
 * El mensaje técnico original JAMÁS aparece en la salida.
 */
export function explainError(input: ExplainInput): ErrorEntry {
  return (
    errorForCode(input.code)
    ?? errorForMetaCode(input.metaCode)
    ?? errorForMessage(input.message)
    ?? ERROR_GENERICO
  )
}
