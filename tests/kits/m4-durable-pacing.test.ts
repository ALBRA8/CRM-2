import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createDurablePacing } from '../../integration-kits/wp-ultra/m4-durable-pacing/durable-pacing.mjs'

/**
 * Kit M4 (ULTRA) — pacing durable para /step manual: mismo gate para automático
 * y manual, lease exclusivo por campaña, cap diario, durabilidad al reabrir.
 */
describe('kit M4 — durable-pacing', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  const tmpDb = () => {
    const d = mkdtempSync(join(tmpdir(), 'm4kit-'))
    dirs.push(d)
    return join(d, 'pacing.db')
  }

  it('sin dbPath lanza (fail-closed)', () => {
    expect(() => createDurablePacing({})).toThrow(/dbPath es requerido/)
  })

  it('intervalo: primer step permitido, segundo antes del intervalo → 429 con retryAfterMs', () => {
    let now = Date.parse('2026-11-20T08:00:00Z')
    const pacing = createDurablePacing({ dbPath: tmpDb(), clock: () => now })
    try {
      const g1 = pacing.acquire('camp-1', { minIntervalMs: 45_000, dailyCap: 100 })
      expect(g1.allowed).toBe(true)
      pacing.recordSend('camp-1', now)
      now += 10_000 // 10 s después: antes del intervalo
      const g2 = pacing.acquire('camp-1', { minIntervalMs: 45_000, dailyCap: 100 })
      expect(g2.allowed).toBe(false)
      expect(g2.reason).toBe('interval')
      expect(g2.retryAfterMs).toBe(35_000)
      now += 40_000 // 50 s después del envío: intervalo cumplido
      expect(pacing.acquire('camp-1', { minIntervalMs: 45_000, dailyCap: 100 }).allowed).toBe(true)
    } finally {
      pacing.close()
    }
  })

  it('lease exclusivo: otro step dentro del lease → 429 lease_busy', () => {
    let now = Date.parse('2026-11-20T08:00:00Z')
    const pacing = createDurablePacing({ dbPath: tmpDb(), clock: () => now })
    try {
      expect(pacing.acquire('camp-2', { minIntervalMs: 0, dailyCap: 100, holder: 'manual-step-1' }).allowed).toBe(true)
      const g = pacing.acquire('camp-2', { minIntervalMs: 0, dailyCap: 100, holder: 'manual-step-2' })
      expect(g.allowed).toBe(false)
      expect(g.reason).toBe('lease_busy')
      // El MISMO holder puede re-adquirir (retry interno legítimo)
      expect(pacing.acquire('camp-2', { minIntervalMs: 0, dailyCap: 100, holder: 'manual-step-1' }).allowed).toBe(true)
    } finally {
      pacing.close()
    }
  })

  it('cap diario alcanzado → rechazo hasta el día siguiente; release conserva el contador', () => {
    let now = Date.parse('2026-11-20T08:00:00Z')
    const pacing = createDurablePacing({ dbPath: tmpDb(), clock: () => now })
    try {
      pacing.acquire('camp-3', { minIntervalMs: 0, dailyCap: 2, holder: 'h' })
      pacing.recordSend('camp-3', now)
      now += 300_000
      pacing.recordSend('camp-3', now)
      const g = pacing.acquire('camp-3', { minIntervalMs: 0, dailyCap: 2, holder: 'h' })
      expect(g.allowed).toBe(false)
      expect(g.reason).toBe('daily_cap_reached')
      pacing.release('camp-3')
      // Día siguiente: contador reinicia
      now = Date.parse('2026-11-21T08:00:00Z')
      expect(pacing.acquire('camp-3', { minIntervalMs: 0, dailyCap: 2, holder: 'h' })).toMatchObject({ allowed: true, dailyRemaining: 2 })
    } finally {
      pacing.close()
    }
  })

  it('DURABLE: reabrir la BD mantiene intervalo y contador diario (el reinicio no lo salta)', () => {
    const dbPath = tmpDb()
    const T0 = Date.parse('2026-11-20T09:00:00Z')
    const a = createDurablePacing({ dbPath, clock: () => T0 })
    a.acquire('camp-4', { minIntervalMs: 60_000, dailyCap: 10, holder: 'h' })
    a.recordSend('camp-4', T0)
    a.close()

    const b = createDurablePacing({ dbPath, clock: () => T0 + 10_000 })
    try {
      const g = b.acquire('camp-4', { minIntervalMs: 60_000, dailyCap: 10, holder: 'h' })
      expect(g.allowed).toBe(false)
      expect(g.reason).toBe('interval')
      expect(g.retryAfterMs).toBe(50_000)
    } finally {
      b.close()
    }
  })
})
