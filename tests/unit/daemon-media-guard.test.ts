import { describe, expect, it } from 'vitest'
import {
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  assertStreamLimit,
  audioMediaKind,
  isAllowedImageMime,
  normalizeMime,
} from '../../src/whatsapp-daemon/media-guard.mjs'

/**
 * Guardas puras de media del daemon Baileys (port de fix/whatsapp-production-media).
 * El daemon descarga media de WhatsApp: sin techo duro de bytes un stream
 * gigante llenaría la memoria; sin allowlist de MIME se procesarían formatos
 * que la capa de visión no soporta.
 */
describe('media-guard (daemon Baileys)', () => {
  it('los techos coinciden con los límites declarados del CRM', () => {
    expect(MAX_AUDIO_BYTES).toBe(25 * 1024 * 1024)
    expect(MAX_IMAGE_BYTES).toBe(8 * 1024 * 1024)
  })

  it('assertStreamLimit acumula sin lanzar por debajo del techo', () => {
    expect(() => assertStreamLimit(0, MAX_IMAGE_BYTES, 'La imagen')).not.toThrow()
    expect(() => assertStreamLimit(MAX_IMAGE_BYTES, MAX_IMAGE_BYTES, 'La imagen')).not.toThrow()
  })

  it('assertStreamLimit lanza al superar el techo, con etiqueta y MiB', () => {
    expect(() => assertStreamLimit(MAX_IMAGE_BYTES + 1, MAX_IMAGE_BYTES, 'La imagen'))
      .toThrow(/excede 8 MiB/)
    expect(() => assertStreamLimit(MAX_AUDIO_BYTES + 1, MAX_AUDIO_BYTES, 'El audio'))
      .toThrow(/excede 25 MiB/)
  })

  it('normalizeMime recorta parámetros y normaliza mayúsculas', () => {
    expect(normalizeMime('Image/PNG; charset=utf-8')).toBe('image/png')
    expect(normalizeMime('audio/ogg')).toBe('audio/ogg')
    expect(normalizeMime('')).toBe('')
    expect(normalizeMime(undefined)).toBe('')
  })

  it('allowlist de imagen: solo jpeg/png/webp/gif', () => {
    expect(isAllowedImageMime('image/jpeg')).toBe(true)
    expect(isAllowedImageMime('image/png')).toBe(true)
    expect(isAllowedImageMime('image/webp')).toBe(true)
    expect(isAllowedImageMime('image/gif')).toBe(true)
    expect(isAllowedImageMime('image/bmp')).toBe(false)
    expect(isAllowedImageMime('application/pdf')).toBe(false)
    expect(isAllowedImageMime('')).toBe(false)
    expect(isAllowedImageMime('image/png; charset=utf-8')).toBe(true)
  })

  it('audioMediaKind: mimetype audio/* viaja como document, el resto como audio', () => {
    expect(audioMediaKind('audio/ogg')).toBe('document')
    expect(audioMediaKind('audio/mp4; codecs=mp4a')).toBe('document')
    expect(audioMediaKind('image/png')).toBe('audio')
    expect(audioMediaKind('')).toBe('audio')
    expect(audioMediaKind(undefined)).toBe('audio')
  })
})
