import { describe, expect, it } from 'vitest'
import { IMAGE_MIME_TYPES, MAX_IMAGE_PIXELS, verifyImageSignature } from '@/lib/vision'

/**
 * Firma binaria de la capa de visión (port de fix/whatsapp-production-media).
 * El MIME declarado por el emisor NO es confianza: un JPEG renombrado a PNG
 * (o un payload arbitrario) debe ser rechazado por magic bytes antes de
 * invocar al proveedor de visión.
 */
describe('verifyImageSignature (magic bytes de visión)', () => {
  const PNG_HEAD = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0])

  it('acepta un PNG real por su cabecera', () => {
    const png = Buffer.concat([PNG_HEAD, Buffer.from('resto-del-archivo')])
    expect(verifyImageSignature(png, 'image/png')).toBe(true)
  })

  it('acepta JPEG (FF D8 FF), GIF87a/89a y WebP RIFF', () => {
    expect(verifyImageSignature(JPEG_HEAD, 'image/jpeg')).toBe(true)
    expect(verifyImageSignature(Buffer.from('GIF89a' + 'x'.repeat(10)), 'image/gif')).toBe(true)
    expect(verifyImageSignature(Buffer.from('GIF87a' + 'x'.repeat(10)), 'image/gif')).toBe(true)
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from('xxxx'), Buffer.from('WEBP'), Buffer.from('yy')])
    expect(verifyImageSignature(webp, 'image/webp')).toBe(true)
  })

  it('rechaza bytes arbitrarios declarados como imagen', () => {
    const garbage = Buffer.from('imagen-de-prueba')
    expect(verifyImageSignature(garbage, 'image/png')).toBe(false)
    expect(verifyImageSignature(garbage, 'image/jpeg')).toBe(false)
    expect(verifyImageSignature(garbage, 'image/webp')).toBe(false)
    expect(verifyImageSignature(garbage, 'image/gif')).toBe(false)
  })

  it('rechaza el formato equivocado aunque sea una imagen válida', () => {
    expect(verifyImageSignature(Buffer.concat([PNG_HEAD, Buffer.alloc(4)]), 'image/jpeg')).toBe(false)
    expect(verifyImageSignature(JPEG_HEAD, 'image/png')).toBe(false)
  })

  it('rechaza formatos fuera de la allowlist y buffers truncados', () => {
    expect(verifyImageSignature(Buffer.from('BM...'), 'image/bmp')).toBe(false)
    expect(verifyImageSignature(Buffer.alloc(0), 'image/png')).toBe(false)
    expect(verifyImageSignature(Buffer.from([137, 80]), 'image/png')).toBe(false)
  })

  it('la allowlist es exactamente jpeg/png/webp/gif y el techo son 40 MP', () => {
    expect([...IMAGE_MIME_TYPES].sort()).toEqual(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])
    expect(MAX_IMAGE_PIXELS).toBe(40_000_000)
  })
})
