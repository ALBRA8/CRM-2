/**
 * (U3) errores.test.ts — catálogo de errores accionables.
 *
 * INVARIANTE central del plan (F4-T03): NINGÚN texto visible del catálogo
 * nombra archivos, extensiones ni comandos. Además: el catálogo tiene al
 * menos los 20 errores más frecuentes con título/solución/paso a paso,
 * los códigos Meta reales clasifican a su entrada, la clasificación por
 * mensaje funciona sin exponer el texto técnico, y el genérico nunca
 * muestra detalles.
 */
import { describe, it, expect } from 'vitest'
import {
  ERRORES,
  ERROR_GENERICO,
  errorForCode,
  errorForMetaCode,
  errorForMessage,
  explainError,
} from '@/lib/errores'

/** Patrones que NO pueden aparecer en textos visibles (invariante U3). */
const PATRONES_PROHIBIDOS = [
  /\.(ts|tsx|js|mjs|json|md|sh|env|db|prisma)\b/i,   // extensiones de archivo
  /\bnpx\b|\bnpm\b|\bgit\b|\bcurl\b|\bdocker\b/i,     // comandos
  /\/api\/|\/src\/|\/scripts\/|\/docs\//i,             // rutas internas
  /prisma db push|migrate/i,                            // operaciones
  /HTTP \d|\bstatus \d{3}\b/i,                          // jerga HTTP
]

function textsOf(e: { title: string; solution: string; steps?: string[] }): string[] {
  return [e.title, e.solution, ...(e.steps ?? [])]
}

describe('catálogo', () => {
  it('tiene al menos 20 entradas con título y solución', () => {
    expect(ERRORES.length).toBeGreaterThanOrEqual(20)
    for (const e of ERRORES) {
      expect(e.title.length).toBeGreaterThan(5)
      expect(e.solution.length).toBeGreaterThan(10)
    }
  })

  it('códigos únicos y estables (slug kebab-case)', () => {
    const codes = ERRORES.map((e) => e.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const c of codes) expect(c).toMatch(/^[a-z0-9_]+$/)
  })

  it('INVARIANTE: ningún texto nombra archivos, comandos ni rutas', () => {
    for (const e of ERRORES) {
      for (const t of textsOf(e)) {
        for (const p of PATRONES_PROHIBIDOS) {
          expect(t, `«${t}» viola el patrón ${p} en ${e.code}`).not.toMatch(p)
        }
      }
    }
    for (const t of textsOf(ERROR_GENERICO)) {
      for (const p of PATRONES_PROHIBIDOS) {
        expect(t).not.toMatch(p)
      }
    }
  })

  it('los errores críticos incluyen paso a paso', () => {
    const conPasos = ERRORES.filter((e) => e.steps && e.steps.length > 0)
    expect(conPasos.length).toBeGreaterThanOrEqual(5)
    // Conectar WhatsApp, el más frecuente, tiene pasos.
    expect(errorForCode('whatsapp_no_conectado')!.steps).toHaveLength(2)
  })

  it('cuándo pedir soporte está marcado explícitamente', () => {
    const conSoporte = ERRORES.filter((e) => e.support)
    expect(conSoporte.length).toBeGreaterThanOrEqual(5)
  })
})

describe('clasificación por códigos Meta (canal)', () => {
  it('131047 → fuera de ventana 24 h; con solución de plantilla', () => {
    const e = errorForMetaCode('131047')!
    expect(e.code).toBe('envio_fuera_de_ventana')
    expect(e.solution.toLowerCase()).toContain('plantilla')
  })

  it('131049 → rechazo por política; 131030 → número inválido; 133016 → plantilla', () => {
    expect(errorForMetaCode('131049')!.code).toBe('mensaje_rechazado_por_politica')
    expect(errorForMetaCode('131030')!.code).toBe('numero_invalido')
    expect(errorForMetaCode('133016')!.code).toBe('plantilla_parametros')
  })

  it('código Meta desconocido → null (no inventa)', () => {
    expect(errorForMetaCode('999999')).toBeNull()
  })

  it('el código Meta dentro del mensaje técnico también clasifica', () => {
    expect(errorForMessage('Meta API error 131047: re-engagement')!.code).toBe('envio_fuera_de_ventana')
  })
})

describe('clasificación por mensaje técnico', () => {
  it('mapea los fallos frecuentes de la app sin mostrarlos al usuario', () => {
    const casos: Array<[string, string]> = [
      ['WhatsApp session not found for org', 'whatsapp_no_conectado'],
      ['Session expired; stream errored unexpectedly', 'whatsapp_sesion_expirada'],
      ['Daemon no alcanzable: ECONNREFUSED', 'servicio_whatsapp_no_responde'],
      ['401 Unauthorized: token invalido', 'sesion_expirada'],
      ['403 Forbidden: requirePermission falló', 'permisos_insuficientes'],
      ['404: client not found', 'registro_no_encontrado'],
      ['429 Too Many Requests', 'limite_alcanzado'],
      ['Unique constraint failed on the field: phone', 'registro_duplicado'],
      ['AbortError: request timed out after 30s', 'conexion_internet'],
      ['Invalid `prisma` column in table', 'esquema_desactualizado'],
    ]
    for (const [msg, expected] of casos) {
      expect(errorForMessage(msg)!.code, `mensaje: ${msg}`).toBe(expected)
    }
  })

  it('mensaje irreconocible → null (el genérico lo cubre)', () => {
    expect(errorForMessage('cosa rara que no clasifica')).toBeNull()
  })

  it('explainError NUNCA devuelve el mensaje técnico en la salida', () => {
    const tecnico = 'Error: ENOENT no such file /src/lib/channel-outbox.ts at line 42 (npx prisma db push)'
    const e = explainError({ message: tecnico })
    for (const t of textsOf(e)) {
      expect(t).not.toContain('ENOENT')
      expect(t).not.toContain('channel-outbox')
      expect(t).not.toContain('npx')
    }
  })

  it('explainError prioriza: code estable > metaCode > mensaje > genérico', () => {
    expect(explainError({ code: 'qr_expirado', message: '429 rate limit' }).code).toBe('qr_expirado')
    expect(explainError({ metaCode: '131047', message: 'timeout' }).code).toBe('envio_fuera_de_ventana')
    expect(explainError({ message: 'timeout' }).code).toBe('conexion_internet')
    expect(explainError({}).code).toBe(ERROR_GENERICO.code)
    expect(explainError({ message: null, code: null }).code).toBe(ERROR_GENERICO.code)
  })
})
