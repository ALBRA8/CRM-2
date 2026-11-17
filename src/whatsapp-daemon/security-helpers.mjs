/**
 * security-helpers.mjs — (reparación 2026-11-17, FASE 1.C) primitivas de
 * seguridad del daemon de WhatsApp, extraídas para poder probarse de forma
 * unitaria sin arrancar Baileys ni abrir puertos.
 *
 *  1. safeSecretEqual: comparación del secreto compartido EN TIEMPO CONSTANTE.
 *     Se compara el SHA-256 de ambos valores (buffers de longitud FIJA de 32
 *     bytes) para no filtrar ni la longitud ni el contenido por tiempo de
 *     comparación.
 *  2. normalizeOrigin + isOriginAllowed: validación EXACTA del origen.
 *     Antes se usaba `origin.startsWith(permitido)` — un atacante con
 *     `http://localhost:3000.attacker.com` (o un referer similar) saltaba la
 *     verificación por prefijo. Ahora se parsea con `new URL(raw).origin` y se
 *     compara contra la lista permitida de forma EXACTA.
 */

import { createHash, timingSafeEqual } from 'node:crypto'

/** Comparación timing-safe de secretos de longitud arbitraria (vía SHA-256 fijo). */
export function safeSecretEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false
  if (provided.length === 0 || expected.length === 0) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/**
 * Normaliza un header de origen/referer a su `origin` exacto.
 * Devuelve '' si el valor está ausente y **null** si es malformado (no es una
 * URL válida): un origen ilegible debe RECHAZARSE, no pasarse por alto.
 */
export function normalizeOrigin(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return ''
  try {
    return new URL(raw.trim()).origin
  } catch {
    return null
  }
}

/** El origen (ya normalizado) debe coincidir EXACTAMENTE con uno permitido. */
export function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return false
  return allowedOrigins.includes(origin)
}
