import type { NextRequest } from 'next/server'
import sharp from 'sharp'
import { safeEquals } from '@/lib/integrations'
import { json } from '@/lib/api-helpers'
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BASE64_CHARS,
  MAX_IMAGE_PIXELS,
  VisionError,
  describeImageBase64,
  verifyImageSignature,
} from '@/lib/vision'

/**
 * POST /api/whatsapp/describe-image — ENDPOINT INTERNO (daemon Baileys → Next.js).
 *
 * Autenticación: header X-Internal-Secret === INTERNAL_API_SECRET (mismo patrón
 * que /api/whatsapp/transcribe). Sin sesión de usuario: solo procesos internos.
 *
 * Body: { imageBase64: string (base64 crudo), mime?: string, caption?: string, orgId: string }
 * Respuesta: { text } | 400/401/413/415/502 con { error } descriptivo.
 *
 * Endurecimiento (port de fix/whatsapp-production-media, integrado 2026-11-20):
 * cuando el emisor DECLARA un mime se valida contra la allowlist, la codificación
 * base64 es canónica, los magic bytes corresponden al formato declarado y sharp
 * verifica la integridad interna con techo de 40 MP — un JPEG renombrado a PNG,
 * un payload arbitrario o una bomba de descompresión se rechazan ANTES de gastar
 * tokens de visión o memoria de decodificación. Sin mime declarado se conserva el
 * comportamiento previo (compatibilidad con emisores internos antiguos).
 *
 * La descripción se guarda como WhatsAppMessage messageType='image' y alimenta
 * al agente IA como TEXTO: la imagen se analiza una sola vez (visión) y el
 * resto de la conversación con el LLM del agente es solo texto (tokens mínimos).
 */
export async function POST(req: NextRequest) {
  const provided = req.headers.get('x-internal-secret') || ''
  const expected = process.env.INTERNAL_API_SECRET || ''

  if (!safeEquals(provided, expected)) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { imageBase64?: string; mime?: string; caption?: string; orgId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido' }, { status: 400 })
  }

  const imageBase64 = (body.imageBase64 || '').replace(/\s/g, '')
  if (!imageBase64) {
    return json({ error: 'imageBase64 es requerido' }, { status: 400 })
  }
  if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    return json({ error: 'La imagen excede el tamaño máximo permitido (15 MB)' }, { status: 413 })
  }
  const declaredMime = typeof body.mime === 'string' ? body.mime.split(';')[0].toLowerCase() : ''
  if (declaredMime && !IMAGE_MIME_TYPES.has(declaredMime)) {
    return json({ error: 'Formato de imagen no soportado' }, { status: 415 })
  }
  const bytes = Buffer.from(imageBase64, 'base64')
  if (bytes.toString('base64') !== imageBase64) {
    return json({ error: 'Codificación de imagen inválida' }, { status: 400 })
  }
  // Validar contenido binario antes de gastar CPU o invocar al proveedor de visión.
  if (declaredMime) {
    if (!verifyImageSignature(bytes, declaredMime)) {
      return json({ error: 'El contenido binario no coincide con el formato declarado' }, { status: 415 })
    }
    try {
      const metadata = await sharp(bytes, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS }).metadata()
      const expectedFormat: Record<string, string> = {
        'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
      }
      if (metadata.format !== expectedFormat[declaredMime] || !metadata.width || !metadata.height) {
        return json({ error: 'Imagen corrupta o formato interno no válido' }, { status: 415 })
      }
    } catch {
      return json({ error: 'Imagen corrupta o demasiado compleja para procesar' }, { status: 415 })
    }
  }
  const orgId = (body.orgId || '').trim()
  if (!orgId) {
    return json({ error: 'orgId es requerido (aislamiento multi-tenant del LLM configurado)' }, { status: 400 })
  }

  try {
    const text = await describeImageBase64(orgId, imageBase64, {
      mime: body.mime,
      caption: body.caption,
    })
    return json({ text })
  } catch (err) {
    if (err instanceof VisionError) {
      return json({ error: err.message }, { status: err.status })
    }
    console.error('[describe-image] error inesperado', err)
    return json({ error: 'No se pudo analizar la imagen' }, { status: 502 })
  }
}
