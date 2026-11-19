import { describe, expect, it } from 'vitest'
import { codigosDeError, entradaPorCodigo, mensajeDeError, type ErrorEntry } from '@/lib/errores'

/**
 * U3 — invariantes del catálogo de errores accionables.
 *
 * Regla dura del plan: en la UI NUNCA se muestran archivos, rutas, comandos ni
 * SQL. Cada entrada debe tener título, solución y paso a paso en lenguaje del
 * usuario; el fallback (ERROR_DESCONOCIDO) siempre responde.
 */

const PROHIBIDOS: RegExp[] = [
  /\.tsx?/i,            // nombres de archivo TS
  /\.jsx?/i,
  /src\//i,
  /scripts\//i,
  /node_modules/i,
  /\bnpm\b|\bnpx\b|\bnode\b/i, // comandos
  /SQL\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b/i,
  /\/api\//i,           // rutas de endpoints internos
  /prisma|docker|worker\.mjs/i,
  /\{\{|\}\}/i,         // marcadores de plantilla sin reemplazar
]

function textos(e: ErrorEntry): string[] {
  return [e.titulo, e.solucion, e.paso]
}

describe('U3 · invariantes del catálogo', () => {
  const codigos = codigosDeError()

  it('cubre los 20 errores más frecuentes', () => {
    expect(codigos.length).toBeGreaterThanOrEqual(20)
  })

  it('códigos únicos y estables', () => {
    expect(new Set(codigos).size).toBe(codigos.length)
  })

  it.each(codigos)('%s tiene título, solución y paso a paso accionables', (codigo) => {
    const e = entradaPorCodigo(codigo)!
    expect(e.titulo.trim().length).toBeGreaterThanOrEqual(10)
    expect(e.solucion.trim().length).toBeGreaterThanOrEqual(15)
    expect(e.paso.trim().length).toBeGreaterThanOrEqual(15)
    // El paso a paso describe ACCIONES (imperativo): contiene un verbo de acción
    expect(e.paso).toMatch(/[vp]e|puls|revis|esper|env|confirma|complet|corrige|reduce|reint|contacta|us[ae]|elige|vigila|guarda|comprueba|anota|abre| busca|amplía|desconecta|conécta/i)
  })

  it('ningún texto nombra archivos, rutas, comandos ni SQL', () => {
    for (const codigo of codigos) {
      const e = entradaPorCodigo(codigo)!
      for (const t of textos(e)) {
        for (const prohibido of PROHIBIDOS) {
          expect(t, `${codigo} viola ${prohibido} en: "${t}"`).not.toMatch(prohibido)
        }
      }
    }
  })
})

describe('U3 · mensajeDeError nunca lanza y siempre responde', () => {
  it('entrada vacía o rara → ERROR_DESCONOCIDO', () => {
    expect(mensajeDeError(null).codigo).toBe('ERROR_DESCONOCIDO')
    expect(mensajeDeError(undefined).codigo).toBe('ERROR_DESCONOCIDO')
    expect(mensajeDeError('').codigo).toBe('ERROR_DESCONOCIDO')
    expect(mensajeDeError(42).codigo).toBe('ERROR_DESCONOCIDO')
    expect(mensajeDeError({}).codigo).toBe('ERROR_DESCONOCIDO')
  })

  it('código exacto del catálogo → esa entrada', () => {
    expect(mensajeDeError('SESION_EXPIRADA').titulo).toContain('sesión')
  })

  it('mensaje técnico con código Meta embebido → entrada correcta', () => {
    expect(mensajeDeError('META_ERROR_131047: re-engagement window').codigo).toBe('META_REENGAJE_24H')
    expect(mensajeDeError('META_ERROR_131056').codigo).toBe('META_RATE_LIMIT')
    expect(mensajeDeError('META_HTTP_429').codigo).toBe('META_RATE_LIMIT')
    expect(mensajeDeError('META_ERROR_132000 subcode').codigo).toBe('META_PLANTILLA_NO_APROBADA')
    expect(mensajeDeError('INVALID_PROVIDER_INPUT').codigo).toBe('META_PARAMETRO_INVALIDO')
  })

  it('excepción real (Error) se traduce y preserva el detalle', () => {
    const r = mensajeDeError(new Error('Evidencia requerida: ID del proveedor o nota de lo verificado'))
    expect(r.codigo).toBe('DATOS_INCOMPLETOS')
    expect(r.detalle).toContain('Evidencia requerida')
  })

  it('respuestas { error } de la API se traducen', () => {
    expect(mensajeDeError({ error: 'Solo un administrador puede conciliar envíos' }).codigo).toBe('SIN_PERMISOS')
    expect(mensajeDeError({ error: 'La intención no está en estado unknown' }).codigo).toBe('ENVIO_INCERTO')
  })

  it('401/402/404/429/5xx en el texto mapean al error de usuario correcto', () => {
    expect(mensajeDeError('HTTP 401 Unauthorized').codigo).toBe('SESION_EXPIRADA')
    expect(mensajeDeError('plan_limit').codigo).toBe('LIMITE_PLAN_ALCANZADO')
    expect(mensajeDeError('Conexión no encontrada').codigo).toBe('NO_ENCONTRADO')
    expect(mensajeDeError('fetch failed').codigo).toBe('CONEXION_CAIDA')
  })

  it('el detalle técnico NUNCA queda en título ni solución (solo en detalle)', () => {
    const r = mensajeDeError('prisma:query SELECT * FROM x')
    expect(r.detalle).toContain('prisma')
    expect(r.titulo).not.toMatch(/prisma|SELECT/i)
    expect(r.solucion).not.toMatch(/prisma|SELECT/i)
  })
})

describe('U3 · entradaPorCodigo', () => {
  it('devuelve null para códigos inexistentes', () => {
    expect(entradaPorCodigo('NO-EXISTE')).toBeNull()
    expect(entradaPorCodigo('')).toBeNull()
  })
})
