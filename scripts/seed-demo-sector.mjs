/**
 * U6 (F7-T06) — Seeder sectorial de DEMOSTRACIÓN, reproducible e idempotente.
 *
 * Materializa una organización `demo-<slug>` con usuarios, pipeline, clientes,
 * oportunidades, reservas, tareas, cotizaciones (+ítems) y conversaciones
 * WhatsApp de ejemplo para el sector elegido. Las definiciones viven en
 * `scripts/demo-sectors.mjs` (datos puros validados por tests).
 *
 * Seguridad:
 *  - ABORTA en entorno productivo (NODE_ENV/CRM_ENV production o DATABASE_URL
 *    con «prod») y si el bloque canónico de cifras no fue tocado.
 *  - Jamás modifica organizaciones existentes que no sean `demo-<slug>`.
 *  - Todo dato lleva marca [demo]/(Demo) y las contraseñas son de demostración.
 *
 * Uso:
 *   node scripts/seed-demo-sector.mjs --list
 *   node scripts/seed-demo-sector.mjs --sector restaurante
 *   node scripts/seed-demo-sector.mjs --sector salud-estetica
 *   node scripts/seed-demo-sector.mjs --sector inmobiliaria
 *
 * Idempotencia: sembrar dos veces produce el mismo estado (upserts lógicos con
 * claves fijas: slug, email, teléfono, título, número de cotización).
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'node:crypto'
import { SECTORS, validateSectorData } from './demo-sectors.mjs'

const db = new PrismaClient()

// --- Guardas de entorno: jamás sembrar demos en producción ---
const DATABASE_URL = process.env.DATABASE_URL ?? ''
const looksProduction =
  process.env.NODE_ENV === 'production' ||
  process.env.CRM_ENV === 'production' ||
  /prod/i.test(DATABASE_URL)
if (looksProduction) {
  console.error('ABORTADO: entorno productivo detectado (NODE_ENV/CRM_ENV/DATABASE_URL). Las semillas demo jamás corren aquí.')
  process.exit(1)
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

// --- CLI mínima ---
const args = process.argv.slice(2)
if (args.includes('--list') || args.length === 0) {
  console.log('Sectores disponibles (node scripts/seed-demo-sector.mjs --sector <slug>):')
  for (const s of SECTORS) {
    console.log(`  ${s.slug.padEnd(16)} ${s.orgName} — ${s.businessLine}`)
  }
  process.exit(args.length === 0 ? 1 : 0)
}
const idx = args.indexOf('--sector')
const slug = idx >= 0 ? args[idx + 1] : undefined
const sector = SECTORS.find((s) => s.slug === slug)
if (!slug || !sector) {
  console.error(`ABORTADO: sector desconocido «${slug ?? '(vacío)'}». Usa --list para ver los disponibles.`)
  process.exit(1)
}

// Fail-fast: validar la definición ANTES de tocar la base de datos
const errors = validateSectorData(sector)
if (errors.length) {
  console.error('ABORTADO: la definición sectorial tiene errores de validación:')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}

const now = new Date()
const at = (hours) => new Date(now.getTime() + hours * 3600_000)
const atMin = (min) => new Date(now.getTime() + min * 60_000)
const stats = { users: 0, stages: 0, clients: 0, opportunities: 0, reservations: 0, tasks: 0, quotes: 0, conversations: 0 }

try {
  // Organización demo dedicada por sector (jamás toca otras orgs)
  const org = await db.organization.upsert({
    where: { slug: `demo-${sector.slug}` },
    update: { name: sector.orgName, isActive: true },
    create: { slug: `demo-${sector.slug}`, name: sector.orgName, plan: 'pilot', isActive: true },
  })

  // Usuarios demo (email global único; scrypt igual que el resto del sistema)
  for (const u of sector.users) {
    await db.user.upsert({
      where: { email: u.email },
      update: { passwordHash: hashPassword(u.password), role: u.role, isActive: true, organizationId: org.id, name: u.name },
      create: { email: u.email, name: u.name, passwordHash: hashPassword(u.password), role: u.role, organizationId: org.id, isActive: true },
    })
    stats.users++
  }

  // Pipeline del sector
  const stageByOrder = new Map()
  for (const st of sector.pipelineStages) {
    const existing = await db.pipelineStage.findFirst({ where: { organizationId: org.id, name: st.name, order: st.order }, select: { id: true } })
    const stage = existing
      ? await db.pipelineStage.update({ where: { id: existing.id }, data: { color: st.color, probability: st.probability, isWon: !!st.isWon, isLost: !!st.isLost } })
      : await db.pipelineStage.create({ data: { organizationId: org.id, name: st.name, order: st.order, color: st.color, probability: st.probability, isWon: !!st.isWon, isLost: !!st.isLost } })
    stageByOrder.set(st.order, stage.id)
    stats.stages++
  }

  // Clientes (clave fija: teléfono dentro de la org)
  const clientByKey = new Map()
  for (const c of sector.clients) {
    const existing = await db.client.findFirst({ where: { organizationId: org.id, phone: c.phone }, select: { id: true } })
    const data = {
      name: c.name,
      email: c.email ?? null,
      phone: c.phone,
      status: c.status,
      source: c.source,
      notes: c.notes,
      lastContactAt: at(-24),
    }
    const client = existing
      ? await db.client.update({ where: { id: existing.id }, data })
      : await db.client.create({ data: { ...data, organizationId: org.id } })
    clientByKey.set(c.key, client.id)
    stats.clients++
  }

  // Oportunidades (clave fija: título dentro de la org)
  const oppByKey = new Map()
  for (const o of sector.opportunities) {
    const data = {
      title: o.title,
      clientId: clientByKey.get(o.clientKey),
      stageId: stageByOrder.get(o.stageOrder),
      amount: o.amount,
      currency: o.currency,
      probability: sector.pipelineStages.find((s) => s.order === o.stageOrder)?.probability ?? null,
      expectedCloseDate: at(24 * 14),
    }
    const existing = await db.opportunity.findFirst({ where: { organizationId: org.id, title: o.title }, select: { id: true } })
    const opp = existing
      ? await db.opportunity.update({ where: { id: existing.id }, data })
      : await db.opportunity.create({ data: { ...data, organizationId: org.id } })
    oppByKey.set(o.key, opp.id)
    stats.opportunities++
  }

  // Reservas (clave fija: título dentro de la org)
  for (const r of sector.reservations) {
    const data = {
      clientId: clientByKey.get(r.clientKey),
      title: r.title,
      startsAt: at(r.startsInHours),
      endsAt: new Date(at(r.startsInHours).getTime() + r.durationMin * 60_000),
      status: r.status,
      location: r.location ?? null,
    }
    const existing = await db.reservation.findFirst({ where: { organizationId: org.id, title: r.title }, select: { id: true } })
    if (existing) await db.reservation.update({ where: { id: existing.id }, data })
    else await db.reservation.create({ data: { ...data, organizationId: org.id } })
    stats.reservations++
  }

  // Tareas (clave fija: título dentro de la org)
  for (const t of sector.tasks) {
    const data = {
      title: t.title,
      clientId: t.clientKey ? clientByKey.get(t.clientKey) : null,
      priority: t.priority,
      status: t.status,
      dueAt: t.status === 'open' ? at(t.dueInHours) : null,
      completedAt: t.status === 'done' ? at(-2) : null,
    }
    const existing = await db.task.findFirst({ where: { organizationId: org.id, title: t.title }, select: { id: true } })
    if (existing) await db.task.update({ where: { id: existing.id }, data })
    else await db.task.create({ data: { ...data, organizationId: org.id } })
    stats.tasks++
  }

  // Cotizaciones + ítems (clave fija: @@unique([organizationId, number]))
  for (const q of sector.quotes) {
    const subtotal = q.items.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0)
    const tax = Math.round(subtotal * 0.19) // IVA Colombia demo
    const data = {
      clientId: clientByKey.get(q.clientKey),
      opportunityId: q.oppKey ? oppByKey.get(q.oppKey) : null,
      status: q.status,
      validUntil: at(24 * q.validInDays),
      notes: q.notes,
      subtotal,
      tax,
      total: subtotal + tax,
      currency: 'COP',
    }
    let quote = await db.quote.findUnique({ where: { organizationId_number: { organizationId: org.id, number: q.number } }, select: { id: true } })
    if (quote) {
      quote = await db.quote.update({ where: { id: quote.id }, data })
    } else {
      quote = await db.quote.create({ data: { ...data, organizationId: org.id, number: q.number } })
    }
    const itemCount = await db.quoteItem.count({ where: { quoteId: quote.id } })
    if (itemCount === 0) {
      await db.quoteItem.createMany({
        data: q.items.map((it, i) => ({
          quoteId: quote.id,
          organizationId: org.id,
          sku: it.sku ?? null,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          subtotal: it.quantity * it.unitPrice,
          position: i,
        })),
      })
    }
    stats.quotes++
  }

  // Conversaciones WhatsApp (tablas del daemon; clave @@unique([organizationId, contactPhone]))
  for (const conv of sector.conversations) {
    const client = sector.clients.find((c) => c.key === conv.clientKey)
    const last = conv.thread[conv.thread.length - 1]
    const unread = last.from === 'in' ? 1 : 0
    const payload = {
      clientId: clientByKey.get(conv.clientKey),
      contactName: client.name,
      lastMessage: last.text,
      lastMessageFrom: last.from,
      lastMessageAt: atMin(last.offsetMin),
      unreadCount: unread,
      isAutoReply: true,
    }
    const existing = await db.whatsAppConversation.findUnique({
      where: { organizationId_contactPhone: { organizationId: org.id, contactPhone: client.phone } },
      select: { id: true },
    })
    const conversation = existing
      ? await db.whatsAppConversation.update({ where: { id: existing.id }, data: payload })
      : await db.whatsAppConversation.create({ data: { ...payload, organizationId: org.id, contactPhone: client.phone } })
    const msgCount = await db.whatsAppMessage.count({ where: { conversationId: conversation.id } })
    if (msgCount === 0) {
      await db.whatsAppMessage.createMany({
        data: conv.thread.map((m) => ({
          organizationId: org.id,
          conversationId: conversation.id,
          direction: m.from === 'in' ? 'inbound' : 'outbound',
          fromNumber: m.from === 'in' ? client.phone : 'biz',
          toNumber: m.from === 'in' ? 'biz' : client.phone,
          senderType: m.from === 'in' ? 'contact' : 'agent',
          text: m.text,
          createdAt: atMin(m.offsetMin),
        })),
      })
    }
    stats.conversations++
  }

  console.log(`\nOK — semillas «${sector.slug}» en org ${org.slug} (${org.id}):`)
  console.log(`  usuarios=${stats.users} etapas=${stats.stages} clientes=${stats.clients} oportunidades=${stats.opportunities}`)
  console.log(`  reservas=${stats.reservations} tareas=${stats.tasks} cotizaciones=${stats.quotes} conversaciones=${stats.conversations}`)
  console.log('  Credenciales demo (jamás usar en producción):')
  for (const u of sector.users) console.log(`    ${u.email} / ${u.password} (${u.role})`)
  console.log('  Reproducible: correr de nuevo no duplica nada.')
} catch (err) {
  console.error('ERROR sembrando la demo sectorial:', err)
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
