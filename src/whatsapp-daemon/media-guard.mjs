/**
 * Guardas puras de media del daemon Baileys (port de fix/whatsapp-production-media,
 * integrado 2026-11-20). Extraídas a un módulo sin estado para poder probarlas
 * con Vitest sin levantar el daemon real: el daemon solo descarga y valida;
 * la transcripción/análisis viven en el servidor Next.
 */

/** Techo de audio decodificado aceptado (coincide con MAX_AUDIO_BYTES del CRM). */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024

/** Techo de imagen descargada de WhatsApp (las fotos reales son << 8 MB). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** Formatos de imagen que el daemon acepta descargar y analizar. */
export const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/**
 * Acumulador con techo duro de bytes: aborta el stream en cuanto el total
 * supera el máximo, en lugar de cargar en memoria un archivo gigante.
 */
export function assertStreamLimit(totalBytes, maxBytes, label) {
  if (totalBytes > maxBytes) {
    throw new Error(`${label} excede ${Math.round(maxBytes / (1024 * 1024))} MiB`)
  }
}

/** MIME declarado normalizado (sin parámetros ';charset=…'), minúsculas. */
export function normalizeMime(rawMime) {
  return String(rawMime || '').split(';')[0].trim().toLowerCase()
}

/** ¿Puede el daemon intentar analizar esta imagen según su MIME declarado? */
export function isAllowedImageMime(rawMime) {
  return IMAGE_MIME_TYPES.has(normalizeMime(rawMime))
}

/**
 * Baileys descarga audioMessage/pttMessage como 'audio'; un documento cuyo
 * mimetype es audio/* viaja como 'document'. Todo lo demás no es audio.
 */
export function audioMediaKind(rawMime) {
  const mime = normalizeMime(rawMime)
  return mime && mime.startsWith('audio/') ? 'document' : 'audio'
}
