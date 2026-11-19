import { describe, expect, it, beforeAll } from 'vitest'
import { GET as inboxGET } from '@/app/api/inbox/route'
import { db } from '@/lib/db'
import { FIX, jsonBody, req, tokenA, tokenB } from '../helpers'

/**
 * F3 — filtros por canal, cuenta y búsqueda en la bandeja (integración).
 *
 * Semilla org-a:
 *  - 2 conexiones canónicas WhatsApp conectadas ("Número Ventas", "Número Soporte"),
 *    cada una con su conversación (multi-número legítimo: mismo teléfono NO se repite).
 *  - 1 conversación legacy del daemon para el MISMO teléfono de Ventas (el dedup
 *    M7 la oculta; el filtro F3 nunca debe resucitarla).
 *  - 1 conversación Telegram por timeline.
 *
 * Escenarios: allowlist de canal (400 en inválido), filtro por cuenta devuelve
 * SOLO esa cuenta, búsqueda por nombre y por teléfono normalizado, combinados,
 * aislamiento multi-tenant y lista de cuentas para el selector.
 */

let ventasConvId = ''
let soporteConvId = ''

beforeAll(async () => {
  const ventas = await db.channelConnection.create({
    data: {
      organizationId: FIX.orgA.id,
      channel: 'whatsapp',
      provider: 'meta-cloud',
      providerAccountKey: 'meta:whatsapp:111-f3',
      externalAccountId: '111',
      displayName: 'Número Ventas',
      status: 'connected',
      credentialsEnc: 'test-blob-f3-ventas',
    },
  })
  const soporte = await db.channelConnection.create({
    data: {
      organizationId: FIX.orgA.id,
      channel: 'whatsapp',
      provider: 'meta-cloud',
      providerAccountKey: 'meta:whatsapp:222-f3',
      externalAccountId: '222',
      displayName: 'Número Soporte',
      status: 'connected',
      credentialsEnc: 'test-blob-f3-soporte',
    },
  })
  const cv = await db.channelConversation.create({
    data: {
      organizationId: FIX.orgA.id,
      connectionId: ventas.id,
      channel: 'whatsapp',
      externalContactKey: '+573001110000',
      contactName: 'Laura Ventas',
      lastMessage: '¿Precio del plan anual?',
      lastMessageAt: new Date('2026-11-20T10:00:00Z'),
      unreadCount: 2,
    },
  })
  ventasConvId = cv.id
  const cs = await db.channelConversation.create({
    data: {
      organizationId: FIX.orgA.id,
      connectionId: soporte.id,
      channel: 'whatsapp',
      externalContactKey: '+573002220000',
      contactName: 'Pedro Soporte',
      lastMessage: 'No entra mi correo',
      lastMessageAt: new Date('2026-11-20T11:00:00Z'),
      unreadCount: 1,
    },
  })
  soporteConvId = cs.id

  // Legacy del daemon: mismo teléfono que la canónica de Ventas (M7 la oculta).
  await db.whatsAppConversation.create({
    data: {
      organizationId: FIX.orgA.id,
      contactPhone: '573001110000',
      contactName: 'Laura (daemon)',
      lastMessage: 'mensaje por el daemon',
      lastMessageAt: new Date('2026-11-20T09:00:00Z'),
      lastMessageFrom: 'in',
      unreadCount: 3,
      status: 'active',
    },
  })

  // Telegram por timeline (canal distinto, cuenta canónica no aplicable).
  await db.timelineEvent.create({
    data: {
      organizationId: FIX.orgA.id,
      clientId: FIX.clientA1.id,
      type: 'telegram',
      title: 'tg in',
      description: 'Consulta por telegram',
      metadata: JSON.stringify({ chatId: '555009', direction: 'in' }),
      source: 'integration',
      createdAt: new Date('2026-11-20T12:00:00Z'),
    },
  })
})

describe('GET /api/inbox — filtros F3', () => {
  it('sin filtros: un contacto una vez (M7) + cuentas para el selector', async () => {
    const res = await inboxGET(req('/inbox', { token: tokenA() }))
    expect(res.status).toBe(200)
    const body = await jsonBody(res)
    const convs = body.conversations as { key: string; contactHandle: string; channel: string }[]
    const phones = convs.filter((c) => c.channel === 'whatsapp').map((c) => c.contactHandle)
    // La canónica de Ventas y la legacy del daemon comparten teléfono: UNA sola fila.
    expect(phones.filter((p) => p.replace(/\D/g, '') === '573001110000')).toHaveLength(1)
    // Cuentas para el selector (únicas, ordenadas).
    expect(body.accounts).toEqual(['Número Soporte', 'Número Ventas'])
  })

  it('filtro por canal: solo whatsapp', async () => {
    const res = await inboxGET(req('/inbox?channel=whatsapp', { token: tokenA() }))
    const body = await jsonBody(res)
    const convs = body.conversations as { channel: string }[]
    expect(convs.length).toBeGreaterThan(0)
    expect(convs.every((c) => c.channel === 'whatsapp')).toBe(true)
  })

  it('canal fuera de la allowlist → 400 descriptivo', async () => {
    const res = await inboxGET(req('/inbox?channel=pigeon', { token: tokenA() }))
    expect(res.status).toBe(400)
    const body = await jsonBody(res)
    expect(String(body.error)).toContain('Canal inválido')
  })

  it('filtro por cuenta: devuelve SOLO esa cuenta', async () => {
    const res = await inboxGET(req('/inbox?connection=N%C3%BAmero%20Ventas', { token: tokenA() }))
    const body = await jsonBody(res)
    const convs = body.conversations as { connectionName?: string | null; key: string }[]
    expect(convs.length).toBeGreaterThan(0)
    expect(convs.every((c) => c.connectionName === 'Número Ventas')).toBe(true)
    expect(convs.some((c) => c.key === `cc:${ventasConvId}`)).toBe(true)
    expect(convs.some((c) => c.key === `cc:${soporteConvId}`)).toBe(false)
  })

  it('búsqueda por nombre encuentra a la persona correcta', async () => {
    const res = await inboxGET(req('/inbox?q=laura', { token: tokenA() }))
    const body = await jsonBody(res)
    const convs = body.conversations as { contactName: string }[]
    expect(convs).toHaveLength(1)
    expect(convs[0].contactName).toContain('Laura')
  })

  it('búsqueda por teléfono normalizado (sin +, con espacios) encuentra el contacto', async () => {
    for (const q of ['3001110000', '%2B573001110000', '57%20300%20111']) {
      const res = await inboxGET(req(`/inbox?q=${q}`, { token: tokenA() }))
      const body = await jsonBody(res)
      const convs = body.conversations as { contactHandle: string }[]
      expect(convs, `q=${q}`).toHaveLength(1)
      expect(convs[0].contactHandle.replace(/\D/g, '')).toBe('573001110000')
    }
  })

  it('filtros combinados canal+cuenta+búsqueda', async () => {
    const res = await inboxGET(req('/inbox?channel=whatsapp&connection=N%C3%BAmero%20Soporte&q=correo', { token: tokenA() }))
    const body = await jsonBody(res)
    const convs = body.conversations as { key: string }[]
    expect(convs).toHaveLength(1)
    expect(convs[0].key).toBe(`cc:${soporteConvId}`)
  })

  it('búsqueda sin coincidencias devuelve lista vacía (200)', async () => {
    const res = await inboxGET(req('/inbox?q=zzz-nadie', { token: tokenA() }))
    expect(res.status).toBe(200)
    const body = await jsonBody(res)
    expect(body.conversations).toEqual([])
  })

  it('aislamiento: org-b no ve las cuentas ni conversaciones de org-a', async () => {
    const res = await inboxGET(req('/inbox', { token: tokenB() }))
    const body = await jsonBody(res)
    expect(body.accounts).toEqual([])
    const convs = body.conversations as { contactName?: string }[]
    expect(convs.every((c) => !(c.contactName || '').includes('Ventas'))).toBe(true)
  })
})
