import { getLLMConfig } from './ai'

/**
 * Capa de VISIÓN (imagen → descripción de producto) del CRM ALBRA. SOLO servidor.
 *
 * Mismo patrón dual-path que src/lib/ai.ts:
 *   1) LLM configurado por la organización (OpenAI/Groq/compatible con visión,
 *      protocolo OpenAI: POST {baseUrl}/chat/completions con content[] multimodal).
 *   2) Fallback al SDK nativo del entorno (z-ai-web-dev-sdk → createVision).
 *
 * EFICIENCIA DE TOKENS (decisión de diseño):
 *   La imagen se analiza UNA sola vez con un prompt fijo y techo de salida
 *   (max_tokens); la descripción resultante viaja por el resto de la
 *   conversación como TEXTO (~60 palabras). El agente conversacional NUNCA
 *   vuelve a procesar la imagen — el canal caro (visión) se paga una vez por
 *   foto y todo lo demás queda en el canal barato (texto).
 */

export class VisionError extends Error {
  /** Código HTTP sugerido para el endpoint que la propague. */
  status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = 'VisionError'
    this.status = status
  }
}

/** Límite de imagen decodificado (las fotos de WhatsApp son << 5 MB). */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024

/** Longitud máxima del string base64 (4 chars por cada 3 bytes). */
export const MAX_IMAGE_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4

/** Formatos de imagen aceptados por la capa de visión (port de fix/whatsapp-production-media). */
export const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/** Techo de píxeles decodificables: bloquea bombas de descompresión (DoS de memoria). */
export const MAX_IMAGE_PIXELS = 40_000_000

/**
 * Verifica que los bytes reales comiencen con la firma binaria (magic bytes)
 * del formato declarado. El MIME declarado por el emisor NO es confianza:
 * un JPEG renombrado a PNG (o un payload arbitrario) se rechaza aquí.
 */
export function verifyImageSignature(bytes: Buffer, mime: string): boolean {
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mime === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (mime === 'image/gif') return bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))
  if (mime === 'image/webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  return false
}

/** Techo de salida del modelo de visión: descripciones compactas y baratas. */
const MAX_OUTPUT_TOKENS = 300

/**
 * Prompt fijo de descripción comercial. Compacto a propósito: pide un párrafo
 * breve con los atributos que el agente necesita para recomendar del catálogo
 * (tipo, color, material, estilo, talla/marca si son visibles, cantidad, texto).
 */
const DESCRIBE_PROMPT =
  'Analiza la imagen para un asesor comercial. Responde en español, en UN párrafo de máximo 60 palabras, sin preámbulos ni listas: ' +
  'qué se ve (producto o escena), color, material aparente, estilo, talla o marca solo si es visible, cantidad y estado. ' +
  'Si hay texto visible (etiqueta, letrero), transcríbelo tal cual. Si no es un producto, descríbela brevemente igual.'

/** URL de datos para el content[] multimodal (protocolo OpenAI y SDK). */
function toDataUrl(cleanBase64: string, mime?: string): string {
  const m = mime && mime.startsWith('image/') ? mime : 'image/jpeg'
  return `data:${m};base64,${cleanBase64}`
}

/**
 * Describe una imagen (base64 crudo) y devuelve texto en español.
 * Fail-closed: lanza VisionError ante entrada inválida o servicio no
 * disponible. Nunca devuelve texto vacío.
 *
 * @param orgId  organización dueña (resuelve el LLM configurado)
 * @param base64 imagen cruda en base64 (sin prefijo data:)
 * @param opts   mime declarado y caption del mensaje (opcional, ayuda al modelo)
 */
export async function describeImageBase64(
  orgId: string,
  base64: string,
  opts: { mime?: string; caption?: string } = {}
): Promise<string> {
  if (!orgId) throw new VisionError('orgId es requerido', 400)

  const clean = (base64 || '').replace(/\s/g, '')
  if (!clean) throw new VisionError('Imagen vacía: falta imageBase64', 400)
  if (clean.length > MAX_IMAGE_BASE64_CHARS) {
    throw new VisionError('La imagen excede el tamaño máximo permitido (15 MB)', 413)
  }

  const dataUrl = toDataUrl(clean, opts.mime)
  const userText = opts.caption
    ? `${DESCRIBE_PROMPT}\n\nEl cliente la acompañó con esta nota: "${opts.caption.slice(0, 200)}"`
    : DESCRIBE_PROMPT
  const content = [
    { type: 'text' as const, text: userText },
    { type: 'image_url' as const, image_url: { url: dataUrl } },
  ]

  // 1) LLM de la organización (si hay baseUrl + apiKey configurados)
  const cfg = await getLLMConfig(orgId)
  if (cfg.apiKey && cfg.baseUrl) {
    try {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content }],
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(60_000),
      })
      if (res.ok) {
        const data = await res.json()
        const text = (data?.choices?.[0]?.message?.content || '').trim()
        if (text) return text
        console.error('[vision] LLM externo devolvió descripción vacía')
      } else {
        // Típico si el modelo configurado no soporta visión: probar SDK fallback
        console.error('[vision] LLM externo rechazó la imagen', res.status, (await res.text().catch(() => '')).slice(0, 200))
      }
    } catch (err) {
      console.error('[vision] LLM externo falló para imagen, pruebo SDK del entorno', err)
    }
  }

  // 2) Fallback: SDK nativo del entorno (visión GLM). Fuera del sandbox el SDK
  //    no existe y falla tipado — igual que src/lib/ai.ts.
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk')
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.createVision({
      messages: [{ role: 'user', content }],
      // El README oficial del SDK omite `model`: el runtime lo reenvía tal cual
      // y el endpoint de visión aplica su modelo por defecto. El d.ts lo exige,
      // así que casteamos (verificado en dist/index.js createChatCompletionVision).
    } as Parameters<typeof zai.chat.completions.createVision>[0])
    const text = (completion?.choices?.[0]?.message?.content || '').trim()
    if (!text) {
      throw new VisionError('La descripción de imagen llegó vacía (imagen sin contenido reconocible)')
    }
    return text
  } catch (err) {
    if (err instanceof VisionError) throw err
    console.error('[vision] error describiendo imagen', err)
    throw new VisionError('No se pudo analizar la imagen (servicio de visión no disponible)')
  }
}
