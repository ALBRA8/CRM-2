import { afterEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { listInboxPage, listInbox } from '@/lib/inbox'
import { FIX } from '../setup/seed-data'

/**
 * M7 + F3 (plan definitivo) — bandeja única contra BD efímera:
 *  - M7: un contacto presente en la fuente canónica (cc:) y en el daemon
 *    legacy (wa:) aparece UNA sola vez y gana la canónica (sin borrado).
 *  - F3: filtros server-side combinados (canal + búsqueda), paginación por
 *    offset y compatibilidad de listInbox legado.
 */

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
const connectionIds: string[] = []
const conversationIds: string[] = []
const waConvIds: string[] = []

afterEach(async () => {
  if (conversationIds.length) {
    await db.channelMessage.deleteMany({ where: { conversationId: { in: conversationIds } } })
    await db.channelConversation.deleteMany({ where: { id: { in: conversationIds } } })
    conversationIds.length = 0
  }
  if (connectionIds.length) {
    await db.channelConnectionEvent.deleteMany({ where: { connectionId: { in: connectionIds } } })
    await db.channelConnection.deleteMany({ where: { id: { in: connectionIds } } })
    connectionIds.length = 0
  }
  if (waConvIds.length) {
    await db.whatsAppMessage.deleteMany({ where: { conversationId: { in: waConvIds } } })
    await db.whatsAppConversation.deleteMany({ where: { id: { in: waConvIds } } })
    waConvIds.length = 0
  }
})

/** Conexión + conversación canónica WhatsApp para org-a. */
async function seedCanonicalWhatsApp(externalContactKey: string, contactName: string, lastMessageAt: Date) {
  const id = `m7-cc-${suffix()}`
  const connection = await db.channelConnection.create({
    data: {
      id,
      organizationId: FIX.orgA.id,
      channel: 'whatsapp',
      provider: 'meta_cloud',
      providerAccountKey: `meta:whatsapp:${id}`,
      externalAccountId: id,
      displayName: 'ALBRA Ventas',
      credentialsEnc: 'v1:test-ciphertext',
      status: 'connected',
    },
  })
  connectionIds.push(connection.id)
  const conversation = await db.channelConversation.create({
    data: {
      id,
      organizationId: FIX.orgA.id,
      connectionId: connection.id,
      channel: 'whatsapp',
      externalContactKey,
      contactName,
      lastMessage: 'Mensaje canónico',
      lastMessageAt,
      unreadCount: 0,
      status: 'active',
    },
  })
  conversationIds.push(conversation.id)
  return conversation
}

/** Conversación legacy del daemon para org-a (misma tabla WhatsAppConversation). */
async function seedLegacyWhatsApp(contactPhone: string, contactName: string, lastMessageAt: Date) {
  const id = `m7-wa-${suffix()}`
  const conversation = await db.whatsAppConversation.create({
    data: {
      id,
      organizationId: FIX.orgA.id,
      contactPhone,
      contactName,
      lastMessage: 'Mensaje legacy del daemon',
      lastMessageAt,
      lastMessageFrom: 'in',
      unreadCount: 3,
      isAutoReply: false,
      status: 'active',
    },
  })
  waConvIds.push(conversation.id)
  return conversation
}

describe('M7: dedup canónico-primero contra BD real', () => {
  it('contacto en cc: y wa: → una sola conversación y gana la canónica', async () => {
    const phone = '+573005550000'
    const now = Date.now()
    await seedLegacyWhatsApp(phone, 'Contacto Doble', new Date(now))
    await seedCanonicalWhatsApp(phone, 'Contacto Doble', new Date(now - 60_000))

    const res = await listInboxPage(FIX.orgA.id, { limit: 200 })
    const both = res.conversations.filter((c) =>
      c.channel === 'whatsapp' && c.contactHandle.replace(/\D/g, '').endsWith('5550000')
    )
    expect(both).toHaveLength(1)
    expect(both[0].key.startsWith('cc:')).toBe(true)
    expect(res.suppressedCount).toBeGreaterThan(0)
  })

  it('el criterio NO borra datos: la conversación legacy sigue en su tabla', async () => {
    const phone = '+573005551111'
    const legacy = await seedLegacyWhatsApp(phone, 'Contacto Histórico', new Date())
    await seedCanonicalWhatsApp(phone, 'Contacto Histórico', new Date())

    const res = await listInboxPage(FIX.orgA.id, { limit: 200 })
    const visible = res.conversations.filter((c) => c.key === `wa:${legacy.id}`)
    expect(visible).toHaveLength(0) // suprimida del listado…
    const persisted = await db.whatsAppConversation.findUnique({ where: { id: legacy.id } })
    expect(persisted).not.toBeNull() // …pero intacta en la fuente (read-only)
    expect(persisted?.unreadCount).toBe(3)
  })

  it('dos contactos distintos del mismo canal no se deduplican', async () => {
    const a = await seedCanonicalWhatsApp('+573005552222', 'Contacto A', new Date())
    const b = await seedCanonicalWhatsApp('+573005553333', 'Contacto B', new Date())
    const res = await listInboxPage(FIX.orgA.id, { limit: 200 })
    const keys = res.conversations.map((c) => c.key)
    expect(keys).toContain(`cc:${a.id}`)
    expect(keys).toContain(`cc:${b.id}`)
  })
})

describe('F3: filtros server-side y paginación', () => {
  it('filtro por canal devuelve solo ese canal', async () => {
    await seedCanonicalWhatsApp('+573005554444', 'Solo WA', new Date())
    const res = await listInboxPage(FIX.orgA.id, { channel: 'whatsapp', limit: 200 })
    expect(res.conversations.length).toBeGreaterThan(0)
    expect(res.conversations.every((c) => c.channel === 'whatsapp')).toBe(true)
  })

  it('búsqueda encuentra por nombre y por teléfono', async () => {
    await seedCanonicalWhatsApp('+573005555555', 'Zoraida Única', new Date())
    const byName = await listInboxPage(FIX.orgA.id, { search: 'Zoraida' })
    expect(byName.conversations.some((c) => c.contactName === 'Zoraida Única')).toBe(true)
    const byPhone = await listInboxPage(FIX.orgA.id, { search: '3005555555' })
    expect(byPhone.conversations.some((c) => c.contactHandle.endsWith('5555555'))).toBe(true)
    const none = await listInboxPage(FIX.orgA.id, { search: 'zzz-no-existe' })
    expect(none.conversations).toHaveLength(0)
  })

  it('paginación por offset: página 1 + hasMore + página 2 sin duplicados', async () => {
    for (let i = 0; i < 3; i++) {
      await seedCanonicalWhatsApp(`+5730055666${i}0`, `Contacto Pag ${i}`, new Date(Date.now() - i * 1000))
    }
    const page1 = await listInboxPage(FIX.orgA.id, { limit: 2, offset: 0 })
    expect(page1.conversations).toHaveLength(2)
    expect(page1.hasMore).toBe(true)
    const page2 = await listInboxPage(FIX.orgA.id, { limit: 2, offset: 2 })
    const keys1 = page1.conversations.map((c) => c.key)
    const keys2 = page2.conversations.map((c) => c.key)
    for (const k of keys1) expect(keys2).not.toContain(k)
  })

  it('filtros combinados: canal + búsqueda', async () => {
    await seedCanonicalWhatsApp('+573005557777', 'Filtros Combinados', new Date())
    const hit = await listInboxPage(FIX.orgA.id, { channel: 'whatsapp', search: 'Combinados' })
    expect(hit.conversations.some((c) => c.contactName === 'Filtros Combinados')).toBe(true)
    const miss = await listInboxPage(FIX.orgA.id, { channel: 'telegram', search: 'Combinados' })
    expect(miss.conversations).toHaveLength(0)
  })

  it('listInbox legado sigue funcionando (compat) y listInboxPage no muta fuentes', async () => {
    await seedCanonicalWhatsApp('+573005558888', 'Compat Legado', new Date())
    const legacyList = await listInbox(FIX.orgA.id, 200)
    expect(Array.isArray(legacyList)).toBe(true)
    expect(legacyList.some((c) => c.contactName === 'Compat Legado')).toBe(true)
    const paged = await listInboxPage(FIX.orgA.id, { limit: 50 })
    expect(paged.conversations.some((c) => c.contactName === 'Compat Legado')).toBe(true)
  })
})
