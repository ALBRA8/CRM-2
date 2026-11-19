import { describe, expect, it } from 'vitest'
import {
  CATALOGO_ERRORES, CATALOGO_SIZE, resolveError, matchesApiMessage,
  type ErrorEntry,
} from '@/lib/errores'

/**
 * U3/F4-T03 (plan definitivo) — INVARIANTES del catálogo de errores
 * accionables (patrón lib/errores.test.ts de la referencia, estudiado no
 * copiado):
 *
 *  1. cada entrada tiene código único, título, solución y >= 1 paso;
 *  2. NINGÚN texto del catálogo nombra archivos, rutas, comandos, SQL ni
 *     máquinas (errores para el USUARIO, no para el desarrollador);
 *  3. resolveError SIEMPRE devuelve una entrada en claro (fail-safe);
 *  4. cobertura: los 20 errores más frecuentes (criterio de aceptación).
 */

const ENTRIES: ErrorEntry[] = Object.values(CATALOGO_ERRORES)

/** Patrones PROHIBIDOS en textos de usuario (invariante del plan). */
const FORBIDDEN_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\.(ts|tsx|js|mjs|cjs|json|env|md|sh|db|prisma)\b/, why: 'extensión de archivo' },
  { re: /\b(src|prisma|scripts|tests|db)\//, why: 'ruta de repositorio' },
  { re: /\/api\//, why: 'ruta de API interna' },
  { re: /\b(npm|npx|node|docker|git|prisma|curl|ssh|scp)\s/, why: 'comando de terminal' },
  { re: /\b(SELECT|INSERT INTO|DELETE FROM|DROP TABLE|UPDATE.*SET)\b/i, why: 'SQL' },
  { re: /(localhost|127\.0\.0\.1|:3000|:3002)/, why: 'host/puerto interno' },
  { re: /\b(JWT|HMAC|AES[- ]?GCM|HMAC-SHA256)\b/, why: 'jerga criptográfica' },
  { re: /\b(outbox|middleware|webhook\s+handler|worker\s+pull)\b/i, why: 'jerga interna de arquitectura' },
  { re: /\b[0-9a-f]{32,}\b/, why: 'secreto/identificador largo' },
]

/** Campos de texto que el usuario puede leer (no incluye code). */
function userTexts(entry: ErrorEntry): string[] {
  return [
    entry.titulo,
    entry.solucion,
    ...(entry.explicacion ? [entry.explicacion] : []),
    ...entry.pasos,
    ...(entry.accion ? [entry.accion.label] : []),
  ]
}

describe('invariante 1: estructura completa de cada entrada', () => {
  it('todas las entradas tienen título, solución y al menos un paso', () => {
    for (const entry of ENTRIES) {
      expect(entry.titulo.trim().length, `sin título: ${entry.code}`).toBeGreaterThan(0)
      expect(entry.solucion.trim().length, `sin solución: ${entry.code}`).toBeGreaterThan(0)
      expect(entry.pasos.length, `sin pasos: ${entry.code}`).toBeGreaterThan(0)
      for (const paso of entry.pasos) expect(paso.trim().length, `paso vacío: ${entry.code}`).toBeGreaterThan(0)
    }
  })

  it('los códigos son únicos (no dos entradas con el mismo code)', () => {
    const codes = Object.keys(CATALOGO_ERRORES)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('las acciones apuntan a vistas que EXISTEN en la navegación del CRM', () => {
    const viewsValidas = new Set(['inbox', 'wa-connections', 'settings', 'automations', 'outbox', 'health', 'quotes', 'whatsapp'])
    for (const entry of ENTRIES) {
      if (entry.accion) expect(viewsValidas.has(entry.accion.view), `vista inválida en ${entry.code}`).toBe(true)
    }
  })

  it('cobertura mínima: al menos 20 entradas (los 20 errores más frecuentes)', () => {
    expect(CATALOGO_SIZE).toBeGreaterThanOrEqual(20)
  })
})

describe('invariante 2: NINGÚN texto de usuario nombra archivos/comandos/SQL', () => {
  it('los textos de TODAS las entradas pasan el invariante', () => {
    const violaciones: string[] = []
    for (const entry of ENTRIES) {
      for (const text of userTexts(entry)) {
        for (const { re, why } of FORBIDDEN_PATTERNS) {
          if (re.test(text)) violaciones.push(`[${entry.code}] ${why}: "${text}"`)
        }
      }
    }
    expect(violaciones).toEqual([])
  })

  it('el fallback genérico tampoco menciona archivos ni comandos', () => {
    const generic = resolveError('CODIGO-DESCONOCIDO-XYZ')
    for (const text of userTexts(generic)) {
      for (const { re, why } of FORBIDDEN_PATTERNS) {
        expect(re.test(text), `${why} en genérico: "${text}"`).toBe(false)
      }
    }
  })
})

describe('invariante 3: resolveError siempre devuelve algo accionable', () => {
  it('resuelve por código exacto', () => {
    expect(resolveError('plan_limit').titulo).toContain('límite')
    expect(resolveError('DELIVERY_UNCERTAIN').accion?.view).toBe('outbox')
    expect(resolveError('daemon_offline').titulo).toContain('WhatsApp')
  })

  it('resuelve prefijos variables del proveedor (META_HTTP_400, META_ERROR_131026)', () => {
    expect(resolveError('META_HTTP_400').titulo).toContain('Meta')
    expect(resolveError('META_ERROR_131026').titulo).toContain('Meta')
  })

  it('acepta un Error, un objeto con code y un mensaje suelto', () => {
    expect(resolveError(new Error('plan_limit')).titulo).toContain('límite')
    expect(resolveError({ code: 'qr_expired' }).titulo).toContain('QR')
    expect(resolveError().titulo).toContain('salió mal')
    expect(resolveError(null).titulo).toContain('salió mal')
    expect(resolveError('código-raro-que-no-existe').code).toBe('generic')
  })

  it('código desconocido NUNCA devuelve el mensaje crudo del desarrollador', () => {
    const resolved = resolveError('ECONNREFUSED 127.0.0.1:3002 en src/lib/x.ts')
    expect(resolved.code).toBe('generic')
    expect(JSON.stringify(userTexts(resolved))).not.toContain('ECONNREFUSED')
  })
})

describe('matchesApiMessage: enriquecimiento con los mensajes de la API', () => {
  it('reconoce las frases clave de las respuestas de API existentes', () => {
    expect(matchesApiMessage('Tu plan (Piloto) permite 1 número(s) conectado(s). Libera un número o mejora de plan.')?.code).toBe('plan_limit')
    expect(matchesApiMessage('Este número de WhatsApp ya está conectado a otra cuenta')?.code).toBe('duplicate')
    expect(matchesApiMessage('Solo un administrador puede conectar números de WhatsApp')?.code).toBe('forbidden_admin')
  })

  it('texto desconocido → null (sin falsos positivos)', () => {
    expect(matchesApiMessage('')).toBeNull()
    expect(matchesApiMessage('Algo totalmente distinto')).toBeNull()
  })
})
