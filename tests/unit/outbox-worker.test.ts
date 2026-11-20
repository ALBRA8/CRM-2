import { describe, expect, it, vi } from 'vitest'
import {
  computeBackoffMs,
  computeNextDelayMs,
  resolveConfig,
  pullOnce,
  runWorkerLoop,
} from '../../scripts/outbox-worker.mjs'

/**
 * O4 — worker pull de las outboxes (canales + workflows).
 *
 * La lógica de DESPACHO vive en los endpoints del servidor (kill-switches y
 * secrets allí); este proceso solo tira de la cola. Se testea: configuración
 * fail-fast, backoff acotado, higiene de logs (sin cuerpos/IDs) y que un
 * ciclo no salta si el servidor tiene el despacho deshabilitado (503).
 */

const ENV_OK = {
  BASE_URL: 'http://127.0.0.1:3000',
  CHANNEL_OUTBOX_WORKER_SECRET: 'c'.repeat(32),
  WORKFLOW_OUTBOX_WORKER_SECRET: 'w'.repeat(32),
}

describe('resolveConfig — fail-fast sin arranques a medias', () => {
  it('acepta una configuración válida y acota intervalo y límite', () => {
    const cfg = resolveConfig({ ...ENV_OK, OUTBOX_WORKER_INTERVAL_MS: "500", OUTBOX_WORKER_LIMIT: "99" } as unknown as NodeJS.ProcessEnv)
    expect(cfg.baseUrl).toBe('http://127.0.0.1:3000')
    expect(cfg.intervalMs).toBe(1000) // mínimo 1 s, pese a pedir 500
    expect(cfg.limit).toBe(5) // máximo 5 (contrato del endpoint)
  })

  it('rechaza secretos ausentes o cortos (<32) — contrato P0.4', () => {
    expect(() => resolveConfig({} as unknown as NodeJS.ProcessEnv)).toThrow(/CHANNEL_OUTBOX_WORKER_SECRET/)
    expect(() => resolveConfig({ ...ENV_OK, WORKFLOW_OUTBOX_WORKER_SECRET: 'corto' } as unknown as NodeJS.ProcessEnv)).toThrow(/WORKFLOW_OUTBOX_WORKER_SECRET/)
  })

  it('rechaza BASE_URL ausente', () => {
    expect(() => resolveConfig({ CHANNEL_OUTBOX_WORKER_SECRET: 'c'.repeat(32), WORKFLOW_OUTBOX_WORKER_SECRET: 'w'.repeat(32) } as unknown as NodeJS.ProcessEnv)).toThrow(/BASE_URL/)
  })
})

describe('backoff — exponencial acotado, sin ruido', () => {
  it('duplica con el intento y respeta el techo de 60 s', () => {
    expect(computeBackoffMs(0)).toBe(2000) // primer intento: sin multiplicar
    expect(computeBackoffMs(1)).toBe(2000) // primer error real: base
    expect(computeBackoffMs(2)).toBe(4000)
    expect(computeBackoffMs(3)).toBe(8000)
    expect(computeBackoffMs(10)).toBe(60_000)
    expect(computeBackoffMs(99)).toBe(60_000)
  })

  it('el siguiente tick es el intervalo base tras éxito y backoff tras fallo', () => {
    expect(computeNextDelayMs({ ok: true, consecutiveErrors: 0, intervalMs: 15_000 })).toBe(15_000)
    expect(computeNextDelayMs({ ok: false, consecutiveErrors: 1, intervalMs: 15_000 })).toBe(2000)
    expect(computeNextDelayMs({ ok: false, consecutiveErrors: 8, intervalMs: 15_000 })).toBe(60_000)
  })
})

describe('pullOnce — contratos del servidor respetados', () => {
  it('llama a los DOS endpoints con Bearer y límite, sin filtrar cuerpos', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/api/internal/channel-outbox')) {
        expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${'c'.repeat(32)}`)
        expect(init?.body).toBe('{"limit":2}')
        return new Response(JSON.stringify({ results: [{ status: 'sent' }] }), { status: 200 })
      }
      if (u.endsWith('/api/internal/workflow-outbox')) {
        expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${'w'.repeat(32)}`)
        return new Response(JSON.stringify({ results: [] }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    })
    const outcomes = await pullOnce({ baseUrl: 'http://127.0.0.1:3000', limit: 2, channelSecret: 'c'.repeat(32), workflowSecret: 'w'.repeat(32) } , fetchMock as unknown as typeof fetch)
    expect(outcomes.map((o) => o.endpoint)).toEqual(['channel', 'workflow'])
    expect(outcomes.every((o) => o.ok)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('503 (despacho deshabilitado en el servidor) NO es un fallo del worker', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'El despacho está deshabilitado por configuración' }), { status: 503 }))
    const outcomes = await pullOnce({ baseUrl: 'http://x', limit: 1, channelSecret: 'c'.repeat(32), workflowSecret: 'w'.repeat(32) } , fetchMock as unknown as typeof fetch)
    expect(outcomes.every((o) => o.ok && o.code === 503)).toBe(true)
  })

  it('fallo de red/timeout se reporta sin lanzar (el bucle decide el backoff)', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    const outcomes = await pullOnce({ baseUrl: 'http://x', limit: 1, channelSecret: 'c'.repeat(32), workflowSecret: 'w'.repeat(32) } , fetchMock as unknown as typeof fetch)
    expect(outcomes.every((o) => !o.ok && o.note === 'red/timeout')).toBe(true)
  })

  it('401 se reporta como no-ok (secret desalineado es un fallo real)', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 401 }))
    const outcomes = await pullOnce({ baseUrl: 'http://x', limit: 1, channelSecret: 'c'.repeat(32), workflowSecret: 'w'.repeat(32) } , fetchMock as unknown as typeof fetch)
    expect(outcomes.every((o) => !o.ok && o.code === 401)).toBe(true)
  })
})

describe('runWorkerLoop — bucle con cierre limpio', () => {
  it('hace UN ciclo y sale limpio con señal abortada tras él (exit 0 esperado)', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async () => {
      controller.abort() // tras el primer pull, señal de cierre limpio
      return new Response('{"results":[]}', { status: 200 })
    })
    const logs: string[] = []
    const origLog = console.log
    console.log = (m: string) => logs.push(String(m))
    try {
      await runWorkerLoop(
        { ...ENV_OK, OUTBOX_WORKER_INTERVAL_MS: '5' } as unknown as NodeJS.ProcessEnv,
        fetchMock as unknown as typeof fetch,
        { signal: controller.signal },
      )
    } finally {
      console.log = origLog
    }
    expect(fetchMock).toHaveBeenCalledTimes(2) // un ciclo: channel + workflow
    // higiene: el log NUNCA contiene el cuerpo ni secretos
    const joined = logs.join(' ')
    expect(joined).not.toContain('c'.repeat(32))
    expect(joined).not.toContain('results')
  })

  it('falla de arranque si la configuración es inválida (fail-fast, sin ciclos)', async () => {
    const fetchMock = vi.fn()
    await expect(runWorkerLoop({} as unknown as NodeJS.ProcessEnv, fetchMock)).rejects.toThrow(/Configuración inválida/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
