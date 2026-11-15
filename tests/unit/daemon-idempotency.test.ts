/**
 * FASE 6 — B2 residual (revisión independiente 2026-11-06): el daemon Baileys
 * recibía POST /send y solo leía `to` y `text`: no leía ni persistía
 * idempotencyKey ni X-Correlation-Id, y no aplicaba deduplicación → ventana
 * real de DUPLICACIÓN si el llamador reintenta tras una caída.
 *
 * Corrección: módulo SQL `idempotency.mjs` + cableado en /send.
 *   - reserveDaemonSend: PENDING/IN_FLIGHT con lease → 409 sin reenviar.
 *   - DONE → responde el messageId original sin reenviar.
 *   - lease vencido → UNCERTAIN (jamás reenvío automático; reconciliación manual).
 *   - FAILED (send lanzó) → reintento permitido (el envío no ocurrió).
 *
 * Regla del hallazgo: estas pruebas FALLAN antes del fix (módulo inexistente y
 * daemon sin referencias a idempotencia) y PASAN después.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  ensureIdempotencyTable,
  reserveDaemonSend,
  markDaemonSendDone,
  markDaemonSendFailed,
} from '../../src/whatsapp-daemon/idempotency.mjs'

const DAEMON_SRC = readFileSync(join(process.cwd(), 'src/whatsapp-daemon/daemon.mjs'), 'utf8')

describe('idempotencia del daemon Baileys (B2 residual)', () => {
  it('WIRED-1: daemon.mjs lee idempotencyKey/X-Correlation-Id y llama reserveDaemonSend antes de enviar', () => {
    expect(DAEMON_SRC).toContain('reserveDaemonSend')
    expect(DAEMON_SRC).toContain('idempotencyKey')
    expect(DAEMON_SRC).toContain('x-correlation-id')
    expect(DAEMON_SRC).toContain('markDaemonSendDone')
  })

  it('B2-1: primera reserva → proceed; segunda con lease vivo → in_flight (sin reenvío)', () => {
    const db = new DatabaseSync(':memory:')
    ensureIdempotencyTable(db)
    const t0 = 1_000_000
    const first = reserveDaemonSend(db, 'org-a', 'key-1', t0, 600_000)
    expect(first.action).toBe('proceed')
    const second = reserveDaemonSend(db, 'org-a', 'key-1', t0 + 5_000, 600_000)
    expect(second.action).toBe('in_flight')
  })

  it('B2-2: DONE conserva el messageId original y devuelve done sin reenviar', () => {
    const db = new DatabaseSync(':memory:')
    ensureIdempotencyTable(db)
    const t0 = 1_000_000
    expect(reserveDaemonSend(db, 'org-a', 'key-2', t0, 600_000).action).toBe('proceed')
    markDaemonSendDone(db, 'org-a', 'key-2', 'MSG-ABC-123', t0 + 1_000)
    const again = reserveDaemonSend(db, 'org-a', 'key-2', t0 + 60_000, 600_000)
    expect(again.action).toBe('done')
    expect(again.messageId).toBe('MSG-ABC-123')
  })

  it('B2-3: lease vencido → UNCERTAIN (jamás reenvío automático)', () => {
    const db = new DatabaseSync(':memory:')
    ensureIdempotencyTable(db)
    const t0 = 1_000_000
    expect(reserveDaemonSend(db, 'org-a', 'key-3', t0, 600_000).action).toBe('proceed')
    const stale = reserveDaemonSend(db, 'org-a', 'key-3', t0 + 700_000, 600_000)
    expect(stale.action).toBe('uncertain')
    // y una reserva posterior sigue uncertain (quedó marcado)
    const later = reserveDaemonSend(db, 'org-a', 'key-3', t0 + 800_000, 600_000)
    expect(later.action).toBe('uncertain')
  })

  it('B2-4: FAILED tras error de envío permite reintento limpio (proceed)', () => {
    const db = new DatabaseSync(':memory:')
    ensureIdempotencyTable(db)
    const t0 = 1_000_000
    expect(reserveDaemonSend(db, 'org-b', 'key-4', t0, 600_000).action).toBe('proceed')
    markDaemonSendFailed(db, 'org-b', 'key-4', t0 + 2_000)
    const retry = reserveDaemonSend(db, 'org-b', 'key-4', t0 + 3_000, 600_000)
    expect(retry.action).toBe('proceed')
  })

  it('B2-5: aislamiento por organización — la misma clave en otra org NO colisiona', () => {
    const db = new DatabaseSync(':memory:')
    ensureIdempotencyTable(db)
    const t0 = 1_000_000
    expect(reserveDaemonSend(db, 'org-a', 'key-5', t0, 600_000).action).toBe('proceed')
    expect(reserveDaemonSend(db, 'org-b', 'key-5', t0 + 1_000, 600_000).action).toBe('proceed')
  })
})
