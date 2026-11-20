import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createDurableReplayCache, DurableReplayCacheError } from '../../integration-kits/wp-ultra/s4-durable-replay-cache/durable-replay-cache.mjs'

/**
 * Kit S4 (WP+ULTRA) — cache durable de replay (jti) + rate limit persistente.
 * Propiedades: unicidad del canje, DURABILIDAD tras cerrar y reabrir la BD,
 * límite exacto del contador atómico compartido entre "instancias".
 */
describe('kit S4 — durable-replay-cache', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  const tmpDb = () => {
    const d = mkdtempSync(join(tmpdir(), 's4kit-'))
    dirs.push(d)
    return join(d, 'security-cache.db')
  }

  it('sin dbPath lanza (fail-closed)', () => {
    expect(() => createDurableReplayCache({})).toThrow(DurableReplayCacheError)
  })

  it('claimJti: primer canje true, replay false, jti distinto true', () => {
    const cache = createDurableReplayCache({ dbPath: tmpDb() })
    try {
      expect(cache.claimJti('jti-1', 90_000, 1000)).toBe(true)
      expect(cache.claimJti('jti-1', 90_000, 1000)).toBe(false) // replay
      expect(cache.claimJti('jti-2', 90_000, 1000)).toBe(true)
    } finally {
      cache.close()
    }
  })

  it('DURABLE: tras reabrir la BD el jti sigue quemado (replay post-reinicio bloqueado)', () => {
    const dbPath = tmpDb()
    const first = createDurableReplayCache({ dbPath })
    expect(first.claimJti('jti-restart', 600_000, 5000)).toBe(true)
    first.close()

    const second = createDurableReplayCache({ dbPath })
    try {
      expect(second.claimJti('jti-restart', 600_000, 5000)).toBe(false)
    } finally {
      second.close()
    }
  })

  it('claimJti expirado por TTL vuelve a canjear (jti nuevo con ventana nueva)', () => {
    const cache = createDurableReplayCache({ dbPath: tmpDb() })
    try {
      expect(cache.claimJti('jti-ttl', 1_000, 1000)).toBe(true)
      expect(cache.claimJti('jti-ttl', 1_000, 1000)).toBe(false) // dentro del TTL
      expect(cache.claimJti('jti-ttl', 1_000, 5_000)).toBe(true) // TTL vencido
    } finally {
      cache.close()
    }
  })

  it('rateLimit: límite exacto, exceso con retryAfter, ventana vencida reinicia', () => {
    const cache = createDurableReplayCache({ dbPath: tmpDb() })
    try {
      expect(cache.rateLimit('login:1.2.3.4', 3, 60_000, 1000)).toMatchObject({ ok: true, remaining: 2 })
      expect(cache.rateLimit('login:1.2.3.4', 3, 60_000, 1000)).toMatchObject({ ok: true, remaining: 1 })
      const third = cache.rateLimit('login:1.2.3.4', 3, 60_000, 1000)
      expect(third).toMatchObject({ ok: true, remaining: 0 })
      const fourth = cache.rateLimit('login:1.2.3.4', 3, 60_000, 1000)
      expect(fourth.ok).toBe(false)
      expect(fourth.retryAfter).toBeGreaterThan(0)
      // Ventana nueva (now >= resetAt) reinicia el contador
      expect(cache.rateLimit('login:1.2.3.4', 3, 60_000, 70_000)).toMatchObject({ ok: true, remaining: 2 })
    } finally {
      cache.close()
    }
  })

  it('DURABLE entre "instancias": dos caches sobre la misma BD comparten el cómputo', () => {
    const dbPath = tmpDb()
    const a = createDurableReplayCache({ dbPath })
    const b = createDurableReplayCache({ dbPath })
    try {
      expect(a.rateLimit('shared-key', 2, 60_000, 1000).ok).toBe(true)
      expect(b.rateLimit('shared-key', 2, 60_000, 1000).ok).toBe(true)
      expect(a.rateLimit('shared-key', 2, 60_000, 1000).ok).toBe(false) // límite compartido: 2 ya consumidas
    } finally {
      a.close()
      b.close()
    }
  })
})
