#!/usr/bin/env node
/**
 * outbox-worker.mjs — Worker PULL de las outboxes de canales y workflows (O4).
 *
 * Los endpoints internos ya implementan la lógica de despacho (regla 9):
 *   POST /api/internal/channel-outbox   Bearer CHANNEL_OUTBOX_WORKER_SECRET
 *                                       (gate server-side CHANNEL_OUTBOUND_DISPATCH_ENABLED=true)
 *   POST /api/internal/workflow-outbox  Bearer WORKFLOW_OUTBOX_WORKER_SECRET
 *                                       (gate server-side WORKFLOW_OUTBOX_DISPATCH_ENABLED=true)
 *
 * Este proceso SOLO tira de la cola en un bucle con backoff exponencial: los
 * secretos y los kill-switches viven en el servidor (el worker no puede enviar
 * nada si el servidor no está habilitado). Diseñado para ejecutarse bajo
 * systemd (deploy/systemd/crm-outbox-worker.service, Restart=on-failure).
 *
 * Higiene:
 *  - NUNCA imprime cuerpos de mensajes, IDs ni credenciales: solo contadores.
 *  - Los errores de red hacen backoff (base 2 s → máx 60 s), no abortan: el
 *    daemon de systemd decide el reinicio si el proceso realmente muere.
 *  - SIGTERM/SIGINT → cierre limpio (systemd lo usa en stop/restart).
 *
 * Uso: node scripts/outbox-worker.mjs
 * Env: BASE_URL, CHANNEL_OUTBOX_WORKER_SECRET, WORKFLOW_OUTBOX_WORKER_SECRET,
 *      OUTBOX_WORKER_INTERVAL_MS (default 15000), OUTBOX_WORKER_LIMIT (1..5)
 */
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

const DEFAULT_INTERVAL_MS = 15_000
const MAX_BACKOFF_MS = 60_000
const MIN_SECRET_LEN = 32

/** Backoff exponencial acotado (puro; testeado): base*2^(attempt-1) sin pasar max. */
export function computeBackoffMs(attempt, baseMs = 2000, maxMs = MAX_BACKOFF_MS) {
  const n = Math.max(0, Math.min(Number(attempt) || 0, 16))
  const ms = baseMs * 2 ** Math.max(0, n - 1)
  return Math.min(ms, maxMs)
}

/** Intervalo del siguiente tick (puro; testeado): error → backoff, ok → base. */
export function computeNextDelayMs({ ok, consecutiveErrors, intervalMs = DEFAULT_INTERVAL_MS }) {
  if (!ok) return computeBackoffMs(consecutiveErrors)
  return intervalMs
}

/** Configuración fail-fast: nada se arranca a medias (contrato P0.4). */
export function resolveConfig(env = process.env) {
  const errors = []
  const baseUrl = (env.BASE_URL || '').replace(/\/+$/, '')
  if (!baseUrl) errors.push('BASE_URL ausente')
  for (const name of ['CHANNEL_OUTBOX_WORKER_SECRET', 'WORKFLOW_OUTBOX_WORKER_SECRET']) {
    if (!env[name] || env[name].length < MIN_SECRET_LEN) errors.push(`${name} ausente o débil (<${MIN_SECRET_LEN})`)
  }
  if (errors.length > 0) {
    throw new Error('[outbox-worker] Configuración inválida: ' + errors.join('; '))
  }
  const intervalMs = Math.max(1000, Number(env.OUTBOX_WORKER_INTERVAL_MS) || DEFAULT_INTERVAL_MS)
  const limit = Math.max(1, Math.min(Number(env.OUTBOX_WORKER_LIMIT) || 1, 5))
  return { baseUrl, intervalMs, limit, channelSecret: env.CHANNEL_OUTBOX_WORKER_SECRET, workflowSecret: env.WORKFLOW_OUTBOX_WORKER_SECRET }
}

/** Un ciclo de pull sobre los DOS endpoints (inyectable para pruebas). */
export async function pullOnce({ baseUrl, limit, channelSecret, workflowSecret }, fetchImpl = fetch) {
  const endpoints = [
    { path: '/api/internal/channel-outbox', secret: channelSecret, name: 'channel' },
    { path: '/api/internal/workflow-outbox', secret: workflowSecret, name: 'workflow' },
  ]
  const outcomes = []
  for (const ep of endpoints) {
    let outcome
    try {
      const res = await fetchImpl(`${baseUrl}${ep.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${ep.secret}` },
        body: JSON.stringify({ limit }),
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        outcome = { endpoint: ep.name, ok: true, code: res.status }
      } else {
        // 401/503/4xx/5xx: el gate del servidor decide; el worker solo reporta.
        outcome = { endpoint: ep.name, ok: res.status === 503, code: res.status, note: res.status === 503 ? 'dispatch deshabilitado en el servidor' : undefined }
      }
    } catch {
      outcome = { endpoint: ep.name, ok: false, code: 0, note: 'red/timeout' }
    }
    outcomes.push(outcome)
  }
  return outcomes
}

function logTick(outcomes) {
  // Solo contadores y códigos: jamás cuerpos ni IDs (higiene de logs).
  const summary = outcomes
    .map((o) => `${o.endpoint}:${o.ok ? 'ok' : 'skip'}(${o.code}${o.note ? ',' + o.note : ''})`)
    .join(' ')
  console.log(`[outbox-worker] ${new Date().toISOString()} ${summary}`)
}

/** Bucle principal. resolveConfig falla si falta algo (systemd reinicia). */
export async function runWorkerLoop(env = process.env, fetchImpl = fetch, { signal } = {}) {
  const config = resolveConfig(env)
  let consecutiveErrors = 0
  while (!signal?.aborted) {
    try {
      const outcomes = await pullOnce(config, fetchImpl)
      const ok = outcomes.some((o) => o.ok)
      consecutiveErrors = ok ? 0 : consecutiveErrors + 1
      logTick(outcomes)
    } catch (err) {
      consecutiveErrors += 1
      console.error('[outbox-worker] ciclo falló:', err instanceof Error ? err.message : err)
    }
    const nextDelay = computeNextDelayMs({ ok: consecutiveErrors === 0, consecutiveErrors, intervalMs: config.intervalMs })
    try {
      await delay(nextDelay, undefined, { signal })
    } catch {
      break // SIGTERM/SIGINT: cierre limpio, exit 0
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController()
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      console.log('[outbox-worker] cierre limpio (' + sig + ')')
      controller.abort()
    })
  }
  runWorkerLoop(process.env, fetch, { signal: controller.signal })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[outbox-worker] arranque falló:', err instanceof Error ? err.message : err)
      process.exit(1)
    })
}
