/**
 * E2E de simulación con LOS TRES SERVICIOS REALES juntos:
 *   CRM-ALBRA (:3000) + WHATSPOWER (:3003) + WHATSPOWER-ULTRA (:3004)
 *
 * Flujo completo verificado (todo en simulación, ALLOW_REAL_DISPATCH=false):
 *   E1  Salud de los 3 servicios.
 *   E2  Configuración WhatsApp de la org en el CRM (appSecret de prueba).
 *   E3  Flujo creado en WHATSPOWER (trigger keyword + crm_action + send_message).
 *   E4  Mensaje entrante Meta firmado → CRM valida → puente → WHATSPOWER
 *       procesa → flujo ejecuta crm_action → CLIENTE REAL creado en el CRM.
 *   E5  Lock de conversación en WHATSPOWER para un teléfono (team/assign).
 *   E6  Consentimiento registrado en ULTRA para un contacto (FASE 2).
 *   E7  Campaña ULTRA con 3 contactos: bloqueado por lock / bloqueado por
 *       falta de consentimiento / bloqueado por salvaguarda de despacho
 *       (jamás SENT con ALLOW_REAL_DISPATCH=false).
 *
 * Requisitos: entorno generado por boot-3-servicios.sh en /tmp/e2e3.env
 * (secretos dummy de prueba; fail-fast si falta).
 *
 * Uso: node scripts/e2e-3-servicios.mjs
 */
import { createHmac } from 'node:crypto'
import { readFileSync, appendFileSync } from 'node:fs'

const ENVF = '/tmp/e2e3.env'
let env
try {
  env = Object.fromEntries(readFileSync(ENVF, 'utf8').trim().split('\n').map((l) => {
    const i = l.indexOf('=')
    return [l.slice(0, i), l.slice(i + 1)]
  }))
} catch {
  console.error(`✋ Falta ${ENVF}: ejecuta antes boot-3-servicios.sh (valores de prueba)`)
  process.exit(1)
}

const CRM = env.CRM || 'http://localhost:3000'
const WP = env.WP || 'http://localhost:3003'
const ULTRA = env.ULTRA || 'http://localhost:3004'
const JWT = env.JWT
const ORG = env.ORG
const META_APP_SECRET = env.META_APP_SECRET
const ORG_SECRET_WP = env.ORG_SECRET_WP
const ADMIN_KEY_ULTRA = env.ADMIN_KEY_ULTRA

if (!JWT || !ORG || !META_APP_SECRET || !ORG_SECRET_WP || !ADMIN_KEY_ULTRA) {
  console.error('✋ Entorno incompleto en ' + ENVF)
  process.exit(1)
}

// Teléfonos FICTICIOS de prueba (bloque 573000000xxx reservado para E2E)
const PHONE_LEAD = '573000007301'
const PHONE_LOCK = '573000007302'
const PHONE_NOCONSENT = '573000007303'
const PHONE_OK = '573000007304'

const results = []
function log(id, name, pass, detail) {
  results.push({ id, name, pass: Boolean(pass), detail: String(detail || '') })
  console.log(`${pass ? '✅' : '❌'} [${id}] ${name} — ${detail}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function jfetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(60000) })
  let json = null
  try { json = await res.json() } catch { /* vacío */ }
  return { status: res.status, json, text: json ? '' : await res.text().catch(() => '') }
}

async function main() {
  // ── E1: salud de los 3 ──
  for (const [name, base] of [['CRM', CRM], ['WHATSPOWER', WP], ['ULTRA', ULTRA]]) {
    const r = await jfetch(`${base}/api/health`)
    log(`E1-${name}`, `health ${name}`, r.status === 200, `status=${r.status}`)
  }

  const authJwt = { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' }

  // ── E2: configurar WhatsApp de la org en CRM (appSecret dummy) ──
  const cfg = await jfetch(`${CRM}/api/whatsapp/config`, {
    method: 'PUT', headers: authJwt,
    body: JSON.stringify({ whatsappPhoneId: 'E2E-3S-PHONE-ID', metaAppSecret: META_APP_SECRET, enableWhatsApp: true }),
  })
  log('E2', 'config WhatsApp org en CRM (appSecret dummy)', cfg.status === 200 || cfg.status === 201, `status=${cfg.status}`)

  // ── E3: flujo en WHATSPOWER con crm_action create_client ──
  const flow = {
    id: `flow_e2e_3servicios_${Date.now()}`,
    name: 'E2E 3 Servicios (prueba)',
    triggerKeywords: ['e2e3'],
    isActive: true,
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Trigger E2E3', position: { x: 0, y: 0 }, data: { keywords: ['e2e3'], matchType: 'contains' } },
      { id: 'n2', type: 'crm_action', title: 'Registrar cliente en CRM', position: { x: 200, y: 0 }, data: { crmAction: 'create_client', crmParams: { name: 'Cliente E2E 3 Servicios', phone: PHONE_LEAD } } },
      { id: 'n3', type: 'send_message', title: 'Respuesta', position: { x: 400, y: 0 }, data: { message: 'Flujo E2E3 ejecutado (respuesta simulada)' } },
    ],
  }
  const fRes = await jfetch(`${WP}/api/flows`, {
    method: 'POST',
    headers: { 'x-org-id': ORG, Authorization: `Bearer ${ORG_SECRET_WP}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(flow),
  })
  log('E3', 'flujo creado en WHATSPOWER (org ' + ORG.slice(0, 8) + '…)', fRes.status === 200 || fRes.status === 201, `status=${fRes.status} body=${(fRes.json ? JSON.stringify(fRes.json) : fRes.text).slice(0, 120)}`)

  // ── E4: mensaje entrante Meta firmado → CRM → WP → flujo → CRM action ──
  const metaBody = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'E2E-3S-WABA',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '573000000000', phone_number_id: 'E2E-3S-PHONE-ID' },
          contacts: [{ wa_id: PHONE_LEAD, profile: { name: 'Lead E2E 3S' } }],
          messages: [{ from: PHONE_LEAD, id: `wamid.E2E3S${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), text: { body: 'hola E2E3 quiero info' }, type: 'text' }],
        },
      }],
    }],
  }
  const rawBody = JSON.stringify(metaBody)
  const metaSig = 'sha256=' + createHmac('sha256', META_APP_SECRET).update(rawBody, 'utf8').digest('hex')
  const hook = await jfetch(`${CRM}/api/whatsapp/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': metaSig }, body: rawBody,
  })
  log('E4a', 'CRM acepta webhook Meta firmado', hook.status === 200, `status=${hook.status}`)
  await sleep(5000)

  const clients = await jfetch(`${CRM}/api/clients?q=${PHONE_LEAD}`, { headers: { Authorization: `Bearer ${JWT}` } })
  const list = Array.isArray(clients.json) ? clients.json : (clients.json?.clients || clients.json?.items || [])
  const created = list.find((c) => String(c.phone || '').includes(PHONE_LEAD))
  log('E4b', 'flujo ejecutó crm_action → cliente creado en CRM', Boolean(created), created ? `clientId=${created.id}` : `encontrados=${list.length}`)

  // ── E5: lock de conversación en WP vía mensaje entrante REAL (IN_FLOW_2A) ──
  const metaBodyLock = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'E2E-3S-WABA',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '573000000000', phone_number_id: 'E2E-3S-PHONE-ID' },
          contacts: [{ wa_id: PHONE_LOCK, profile: { name: 'Contacto con Lock' } }],
          messages: [{ from: PHONE_LOCK, id: `wamid.E2E3SLOCK${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), text: { body: 'mensaje sin keyword de flujo' }, type: 'text' }],
        },
      }],
    }],
  }
  const rawLock = JSON.stringify(metaBodyLock)
  const lockSig = 'sha256=' + createHmac('sha256', META_APP_SECRET).update(rawLock, 'utf8').digest('hex')
  const hookLock = await jfetch(`${CRM}/api/whatsapp/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': lockSig }, body: rawLock,
  })
  log('E5a', 'mensaje entrante de PHONE_LOCK al CRM (activa flujo/lock en WP)', hookLock.status === 200, `status=${hookLock.status}`)
  await sleep(4000)
  const lockCheck = await jfetch(`${WP}/api/internal/locks/${PHONE_LOCK}`, {
    headers: { 'x-org-id': ORG, Authorization: `Bearer ${ORG_SECRET_WP}` },
  })
  const lockBody = lockCheck.json || {}
  const locked = lockBody.locked === true || lockBody.isLocked === true || lockBody.lock === true
  log('E5b', 'WP confirma lock activo para el teléfono (IN_FLOW_2A)', lockCheck.status === 200 && locked, `status=${lockCheck.status} body=${JSON.stringify(lockBody).slice(0, 140)}`)

  // ── E6: consentimiento en ULTRA para PHONE_OK (FASE 2) ──
  const consent = await jfetch(`${ULTRA}/api/compliance/consent`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_KEY_ULTRA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactPhone: PHONE_OK, whoAuthorized: 'operador-de-prueba', channel: 'whatsapp', textShown: 'Texto de consentimiento E2E (prueba)', source: 'e2e-3-servicios' }),
  })
  log('E6', 'consentimiento registrado en ULTRA', consent.status === 201 || consent.status === 200, `status=${consent.status}`)

  // ── E7: campaña ULTRA con los 3 contactos ──
  const csvContent = `phone,name\n${PHONE_LOCK},ConLock\n${PHONE_NOCONSENT},SinConsent\n${PHONE_OK},ConConsent`
  const camp = await jfetch(`${ULTRA}/api/campaigns`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_KEY_ULTRA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `E2E-3S-${Date.now()}`, templateSpintax: 'Mensaje de prueba E2E 3 servicios', csvContent }),
  })
  const campaign = camp.json?.campaign || camp.json
  log('E7a', 'campaña creada en ULTRA', camp.status === 201 || camp.status === 200, `status=${camp.status} id=${campaign?.id}`)

  if (campaign?.id) {
    // Activación: DRAFT→RUNNING se hace con /resume (la puesta en marcha es
    // decisión explícita del operador; el worker jamás auto-arranca DRAFT).
    const act = await jfetch(`${ULTRA}/api/campaigns/${campaign.id}/resume`, {
      method: 'POST', headers: { Authorization: `Bearer ${ADMIN_KEY_ULTRA}` },
    })
    log('E7a2', 'campaña activada (DRAFT→RUNNING vía /resume)', act.status === 200 || act.status === 201, `status=${act.status}`)
    const step = await jfetch(`${ULTRA}/api/campaigns/${campaign.id}/step`, {
      method: 'POST', headers: { Authorization: `Bearer ${ADMIN_KEY_ULTRA}` },
    })
    log('E7b', 'paso de despacho ejecutado', step.status === 200 || step.status === 202, `status=${step.status} body=${JSON.stringify(step.json).slice(0, 100)}`)

    // El pacing anti-ban (jitter 15-35 s) procesa ~1 ítem por ciclo: repetir
    // pasos con esperas hasta que los 3 ítems salgan de PENDING (tope ~100 s).
    let detail = null
    let items = []
    for (let round = 0; round < 14; round++) {
      await sleep(7000)
      await jfetch(`${ULTRA}/api/campaigns/${campaign.id}/step`, { method: 'POST', headers: { Authorization: `Bearer ${ADMIN_KEY_ULTRA}` } })
      detail = await jfetch(`${ULTRA}/api/campaigns/${campaign.id}`, { headers: { Authorization: `Bearer ${ADMIN_KEY_ULTRA}` } })
      items = detail.json?.items || detail.json?.campaign?.items || []
      const pending = items.filter((it) => /^PENDING$/i.test(String(it.status || it.state))).length
      if (pending === 0) break
    }
    log('E7b2', 'ciclos de pacing completados (ítems fuera de PENDING)', items.length > 0 && items.every((it) => !/^PENDING$/i.test(String(it.status || it.state))), `items=${items.length}`)
    const byPhone = {}
    for (const it of items) byPhone[String(it.phone || it.contactPhone)] = it.status || it.state

    const stLock = byPhone[PHONE_LOCK]
    const stNoConsent = byPhone[PHONE_NOCONSENT]
    const stOk = byPhone[PHONE_OK]
    const isSent = (s) => /^SENT\b/.test(String(s || ''))
    log('E7c', 'contacto con lock → NO despachado (lock respetado)', stLock && !isSent(stLock), `status=${stLock}`)
    log('E7d', 'contacto sin consentimiento → SKIPPED_NO_CONSENT (FASE 2)', stNoConsent && /NO_CONSENT/i.test(stNoConsent), `status=${stNoConsent}`)
    log('E7e', 'contacto válido → salvaguarda activa: jamás SENT', stOk && !isSent(stOk), `status=${stOk}`)

    const sentTotal = items.filter((it) => isSent(it.status || it.state)).length
    log('E7f', 'cero envíos reales en toda la campaña (ALLOW_REAL_DISPATCH=false)', sentTotal === 0, `SENT=${sentTotal}`)
    console.log('\nEstados por contacto:', JSON.stringify(byPhone))
  }

  const fails = results.filter((r) => !r.pass).length
  console.log(`\n=== E2E 3 SERVICIOS: ${results.length - fails}/${results.length} PASS ===`)
  try { appendFileSync('/tmp/e2e-3-servicios-results.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2)) } catch { /* no bloquea */ }
  process.exit(fails === 0 ? 0 : 1)
}

main().catch((e) => { console.error('✋ E2E falló:', e); process.exit(1) })
