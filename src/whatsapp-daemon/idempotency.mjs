/**
 * FASE 6 — B2 residual: idempotencia PERSISTENTE para POST /send del daemon
 * Baileys, scoped por organización.
 *
 * Contrato (revisión independiente 2026-11-06, exigencia B2):
 *   - El daemon DEBE recibir y persistir la clave de idempotencia ANTES del
 *     envío; solicitudes repetidas de una clave ya IN_FLIGHT/UNCERTAIN deben
 *     devolver estado incierto SIN reenviar.
 *   - DONE responde el messageId original sin reenviar (at-most-once observable
 *     para reintentos del llamador; el modelo de entrega sigue at-least-once).
 *   - Lease vencido → UNCERTAIN permanente (jamás reenvío automático; requiere
 *     reconciliación con evidencia, igual que la capa 2A/2B).
 *   - FAILED (Baileys lanzó antes de aceptar) → reintento permitido.
 *
 * Tabla aditiva DaemonSendIdempotency en la MISMA SQLite del CRM daemon
 * (organizations: el daemon usa la BD del CRM cuando está disponible; si no hay
 * db, el llamador degrada a comportamiento previo sin claves).
 */

/**
 * Crea la tabla de idempotencia si no existe (migración aditiva, sin DDL
 * destructivo). Rollback documentado: DROP TABLE DaemonSendIdempotency
 * (no afecta datos de negocio).
 */
export function ensureIdempotencyTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS DaemonSendIdempotency (
      organization_id TEXT NOT NULL,
      idem_key TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('IN_FLIGHT','DONE','FAILED','UNCERTAIN')),
      message_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (organization_id, idem_key)
    )
  `)
}

/**
 * Reserva una clave de envío. Devuelve UNA de:
 *   { action: 'proceed' }                    → enviar (clave nueva o FAILED previo)
 *   { action: 'in_flight' }                  → NO reenviar: hay un envío en curso (lease vivo)
 *   { action: 'uncertain', messageId? }      → NO reenviar: resultado desconocido (lease vencido o marcado)
 *   { action: 'done', messageId }            → NO reenviar: ya enviado; responder messageId original
 */
export function reserveDaemonSend(db, orgId, idemKey, nowMs, leaseMs = 600_000) {
  if (!db || !orgId || !idemKey) return { action: 'proceed' }
  const row = db
    .prepare('SELECT state, message_id, updated_at FROM DaemonSendIdempotency WHERE organization_id = ? AND idem_key = ?')
    .get(orgId, String(idemKey))

  if (!row) {
    db.prepare(
      'INSERT INTO DaemonSendIdempotency (organization_id, idem_key, state, message_id, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)'
    ).run(orgId, String(idemKey), 'IN_FLIGHT', nowMs, nowMs)
    return { action: 'proceed' }
  }

  if (row.state === 'DONE') return { action: 'done', messageId: row.message_id }
  if (row.state === 'UNCERTAIN') return { action: 'uncertain', messageId: row.message_id }
  if (row.state === 'FAILED') {
    // El envío previo lanzó ANTES de aceptarse: la clave se reabre para reintento.
    db.prepare('UPDATE DaemonSendIdempotency SET state = ?, updated_at = ? WHERE organization_id = ? AND idem_key = ?')
      .run('IN_FLIGHT', nowMs, orgId, String(idemKey))
    return { action: 'proceed' }
  }

  // IN_FLIGHT: lease vivo → no reenviar; lease vencido → UNCERTAIN permanente.
  if (nowMs - Number(row.updated_at) < leaseMs) return { action: 'in_flight' }
  db.prepare("UPDATE DaemonSendIdempotency SET state = 'UNCERTAIN', updated_at = ? WHERE organization_id = ? AND idem_key = ?")
    .run(nowMs, orgId, String(idemKey))
  return { action: 'uncertain', messageId: row.message_id }
}

/** Marca DONE tras la aceptación de Baileys con el messageId real. */
export function markDaemonSendDone(db, orgId, idemKey, messageId, nowMs) {
  if (!db || !orgId || !idemKey) return
  db.prepare('UPDATE DaemonSendIdempotency SET state = ?, message_id = ?, updated_at = ? WHERE organization_id = ? AND idem_key = ?')
    .run('DONE', messageId == null ? null : String(messageId), nowMs, orgId, String(idemKey))
}

/** Marca FAILED cuando el envío lanzó sin aceptación (reintento permitido). */
export function markDaemonSendFailed(db, orgId, idemKey, nowMs) {
  if (!db || !orgId || !idemKey) return
  db.prepare("UPDATE DaemonSendIdempotency SET state = 'FAILED', updated_at = ? WHERE organization_id = ? AND idem_key = ?")
    .run(nowMs, orgId, String(idemKey))
}
