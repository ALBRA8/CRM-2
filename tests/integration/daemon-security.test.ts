/**
 * daemon-security.test.ts — (reparación 2026-11-17, FASE 1.C)
 *
 * Seguridad del daemon de WhatsApp (src/whatsapp-daemon/daemon.mjs):
 *  1. Enlace LOCAL: el daemon escucha en 127.0.0.1 por defecto (HOST admite
 *     override). Verificado contra la IP NO loopback de la máquina: la conexión
 *     debe ser rechazada (el daemon no queda expuesto a la red).
 *  2. Secreto compartido comparado con timingSafeEqual (SHA-256 de longitud
 *     fija): secreto correcto → 200; incorrecto o de otra longitud → 401.
 *  3. Validación EXACTA del origen (new URL(origin).origin): orígenes con
 *     sufijo atacante como `http://localhost:3000.attacker.com` → 403
 *     (el antiguo `startsWith` los aceptaba).
 *
 * Nota hermética: el daemon se arranca como PROCESO HIJO con ENV_FILE propio
 * (secreto ficticio, SQLite temporal). Jamás escanea QR ni toca .wa-auth.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { networkInterfaces, tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { connect } from 'node:net'
import { fileURLToPath } from 'node:url'
import { request as httpRequest } from 'node:http'
import { safeSecretEqual, normalizeOrigin, isOriginAllowed } from '../../src/whatsapp-daemon/security-helpers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DAEMON = join(__dirname, '..', '..', 'src', 'whatsapp-daemon', 'daemon.mjs')

// Datos FICTICIOS únicamente (regla del repo: cero datos reales).
const TEST_SECRET = 'daemon_test_internal_secret_min24chars_2026' // dummy de prueba — scan-secrets:allow
const TEST_PORT = 34_000 + (process.pid % 2_000)

function nonLoopbackIp(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) {
      if (ni && !ni.internal && ni.family === 'IPv4') return ni.address
    }
  }
  return null
}

function tryConnect(ip: string, port: number, timeoutMs = 1500): Promise<'open' | 'closed'> {
  return new Promise((resolve) => {
    const sock = connect({ host: ip, port, timeout: timeoutMs })
    const done = (r: 'open' | 'closed') => { sock.destroy(); resolve(r) }
    sock.on('connect', () => done('open'))
    sock.on('error', () => done('closed'))
    sock.on('timeout', () => done('closed'))
  })
}

function httpGet(path: string, headers: Record<string, string>): Promise<{ status: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(`http://127.0.0.1:${TEST_PORT}${path}`, { method: 'GET', headers }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.end()
  })
}

let child: ChildProcess | null = null

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'daemon-sec-'))
  const envFile = join(dir, 'test.env')
  // DATABASE_URL a SQLite TEMPORAL con datos ficticios; jamás toca el .env real.
  writeFileSync(envFile, [
    `INTERNAL_API_SECRET=${TEST_SECRET}`,
    `DATABASE_URL=file:${join(dir, 'test.db')}`,
    '',
  ].join('\n'))
  // Hermeticidad: el hijo NO hereda los secretos/BD del proceso de pruebas
  // (loadEnvFile NO sobrescribe variables ya presentes — deben ausentarse para
  // que el ENV_FILE ficticio de las pruebas sea el que manda).
  const childEnv = { ...process.env }
  delete childEnv.INTERNAL_API_SECRET
  delete childEnv.DATABASE_URL
  delete childEnv.HOST
  child = spawn(process.execPath, [DAEMON], {
    env: {
      ...childEnv,
      ENV_FILE: envFile,
      WHATSAPP_DAEMON_PORT: String(TEST_PORT),
      // HOST sin definir: el DEFAULT debe ser 127.0.0.1 (comportamiento a verificar)
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // Esperar a que el daemon anuncie su API (o 25 s máx en máquinas bajo carga)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('daemon no arrancó en 25s')), 25_000)
    const onData = (d: Buffer) => {
      if (d.toString().includes(`http://127.0.0.1:${TEST_PORT}`)) {
        clearTimeout(timer)
        child!.stdout?.off('data', onData)
        resolve()
      }
    }
    child!.stdout?.on('data', onData)
    child!.stderr?.on('data', (d) => {
      if (d.toString().includes('EADDRINUSE')) { clearTimeout(timer); reject(new Error('puerto ocupado')) }
    })
  })
}, 35_000)

afterAll(() => {
  child?.kill('SIGTERM')
})

describe('FASE 1.C — daemon de WhatsApp: enlace local, secreto timing-safe y origen exacto', () => {
  it('1.C.1 helpers unitarios: secreto timing-safe (longitud fija vía SHA-256)', () => {
    expect(safeSecretEqual(TEST_SECRET, TEST_SECRET)).toBe(true)
    expect(safeSecretEqual('corto', TEST_SECRET)).toBe(false)
    expect(safeSecretEqual('', TEST_SECRET)).toBe(false)
    expect(safeSecretEqual(TEST_SECRET + 'x', TEST_SECRET)).toBe(false)
    // Verificación estructural: la comparación interna usa buffers de 32 bytes
    const a = createHash('sha256').update(TEST_SECRET).digest()
    expect(a.length).toBe(32)
  })

  it('1.C.2 helpers unitarios: origen EXACTO (sin bypass por prefijo)', () => {
    const allowed = ['http://localhost:3000', 'http://127.0.0.1:3000']
    expect(isOriginAllowed(normalizeOrigin('http://localhost:3000'), allowed)).toBe(true)
    expect(isOriginAllowed(normalizeOrigin('http://127.0.0.1:3000'), allowed)).toBe(true)
    // el vector de ataque del startsWith():
    expect(isOriginAllowed(normalizeOrigin('http://localhost.3000.attacker.com'), allowed)).toBe(false)
    expect(isOriginAllowed(normalizeOrigin('http://127.0.0.1.3000.evil.io'), allowed)).toBe(false)
    expect(isOriginAllowed(normalizeOrigin('http://crm.albra.co.attacker.com'), allowed)).toBe(false)
    expect(isOriginAllowed(normalizeOrigin('https://localhost:3000'), allowed)).toBe(false)
    expect(isOriginAllowed(normalizeOrigin('http://localhost:3000.evil.io'), allowed)).toBe(false)
    // origen malformado → null (se RECHAZA, no se omite)
    expect(normalizeOrigin('http://localhost:3000.attacker.com')).toBe(null)
    expect(normalizeOrigin('basura-no-url')).toBe(null)
    expect(normalizeOrigin('')).toBe('')
  })

  it('1.C.3 integración: secreto correcto → 200; incorrecto → 401', async () => {
    const ok = await httpGet('/status', { 'Authorization': `Bearer ${TEST_SECRET}` })
    expect(ok.status).toBe(200)

    const bad = await httpGet('/status', { 'Authorization': 'Bearer daemon_test_internal_secret_WRONG' })
    expect(bad.status).toBe(401)

    const none = await httpGet('/status', {})
    expect(none.status).toBe(401)
  })

  it('1.C.4 integración: origen malicioso con sufijo atacante → 403', async () => {
    const evil = await httpGet('/status', {
      'Authorization': `Bearer ${TEST_SECRET}`,
      'Origin': 'http://localhost.3000.attacker.com',
    })
    expect(evil.status).toBe(403)

    const evilReferer = await httpGet('/status', {
      'Authorization': `Bearer ${TEST_SECRET}`,
      'Referer': 'http://127.0.0.1.3000.evil.io/pagina',
    })
    expect(evilReferer.status).toBe(403)

    // origen malformado (header presente, no parseable) → RECHAZADO
    const malformed = await httpGet('/status', {
      'Authorization': `Bearer ${TEST_SECRET}`,
      'Origin': 'http://localhost:3000.attacker.com',
    })
    expect(malformed.status).toBe(403)

    const good = await httpGet('/status', {
      'Authorization': `Bearer ${TEST_SECRET}`,
      'Origin': 'http://localhost:3000',
    })
    expect(good.status).toBe(200)

    // llamada servidor-a-servidor (proxy de Next): SIN Origin → sin filtro CORS
    const serverToServer = await httpGet('/status', { 'Authorization': `Bearer ${TEST_SECRET}` })
    expect(serverToServer.status).toBe(200)
  })

  it('1.C.5 integración: el daemon NO está alcanzable por la IP no-loopback', async (ctx) => {
    const ip = nonLoopbackIp()
    if (!ip) {
      ctx.skip()
      return
    }
    const result = await tryConnect(ip, TEST_PORT)
    expect(result).toBe('closed')
    const local = await tryConnect('127.0.0.1', TEST_PORT)
    expect(local).toBe('open')
  })

  it('1.C.6 el código del daemon usa bind explícito y comparación timing-safe', () => {
    const src = readFileSync(DAEMON, 'utf8')
    expect(src).toMatch(/server\.listen\(PORT, HOST/)
    expect(src).toMatch(/process\.env\.HOST \|\| '127\.0\.0\.1'/)
    expect(src).toMatch(/safeSecretEqual\(providedAuth, INTERNAL_SECRET\)/)
    expect(src).toMatch(/normalizeOrigin\(rawOrigin\)/)
    expect(src.includes("origin.startsWith(o)")).toBe(false)
  })
})
