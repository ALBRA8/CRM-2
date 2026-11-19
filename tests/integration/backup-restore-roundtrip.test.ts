import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

/**
 * E7 (F6-T04 del plan definitivo, MODIFICADA solo CRM) — garantía REAL de que
 * respaldar y RESTAURAR funciona: roundtrip automatizado con la misma técnica
 * de producción (Online Backup API de SQLite vía better-sqlite3, como
 * scripts/sqlite-backup.cjs) + el script real de snapshot con su contrato de
 * exit codes.
 *
 * Flujo del roundtrip:
 *  1. crear BD ficticia con conteos conocidos (clientes y mensajes);
 *  2. snapshot consistente con sqlite-backup.cjs (exit 0 + integrity_check ok);
 *  3. SIMULAR DESASTRE: eliminar filas y tirar la tabla en la BD original;
 *  4. restaurar desde el snapshot (copia byte a byte);
 *  5. verificar: la restaurada abre limpia (integrity_check), conteos exactos
 *     y los datos vuelven byte a byte.
 *
 * No toca producción: todo ocurre en un directorio temporal único.
 */

let workDir: string
let originalPath: string
let backupPath: string

const ROWS = 25
const SEED_CLIENTS = Array.from({ length: ROWS }, (_, i) => ({
  id: `client-${i + 1}`,
  name: `Cliente Roundtrip ${i + 1}`,
  phone: `+57300${String(1000000 + i)}`,
}))

function createFictitiousDb(path: string): void {
  const db = new Database(path)
  db.exec(`
    CREATE TABLE clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL
    );
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL REFERENCES clients(id),
      body TEXT NOT NULL
    );
  `)
  const insertClient = db.prepare('INSERT INTO clients (id, name, phone) VALUES (@id, @name, @phone)')
  const insertMessage = db.prepare('INSERT INTO messages (client_id, body) VALUES (?, ?)')
  const seed = db.transaction(() => {
    for (const c of SEED_CLIENTS) {
      insertClient.run(c)
      insertMessage.run(c.id, `Mensaje de ${c.name}`)
    }
  })
  seed()
  db.close()
}

describe('E7: backup/restore roundtrip (Online Backup API + script de producción)', () => {
  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'crm-backup-roundtrip-'))
    originalPath = join(workDir, 'original.db')
    backupPath = join(workDir, 'snapshot.db')
    createFictitiousDb(originalPath)
  })

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  it('el script de producción produce un snapshot consistente (exit 0, integrity_check ok)', () => {
    const out = execFileSync('node', ['scripts/sqlite-backup.cjs'], {
      cwd: join(__dirname, '..', '..'),
      env: { ...process.env, DATABASE_URL: `file:${originalPath}`, BACKUP_OUT: backupPath },
      encoding: 'utf8',
      timeout: 60_000,
    })
    expect(out).toContain('integrity_check: ok')
    expect(existsSync(backupPath)).toBe(true)
    // Verificación independiente del producto
    const snap = new Database(backupPath, { readonly: true })
    expect(snap.pragma('integrity_check', { simple: true })).toBe('ok')
    snap.close()
  })

  it('el snapshot contiene EXACTAMENTE los mismos conteos y datos que la original', () => {
    const snap = new Database(backupPath, { readonly: true })
    const clientCount = (snap.prepare('SELECT COUNT(*) AS n FROM clients').get() as { n: number }).n
    const messageCount = (snap.prepare('SELECT COUNT(*) AS n FROM messages').get() as { n: number }).n
    expect(clientCount).toBe(ROWS)
    expect(messageCount).toBe(ROWS)
    const first = snap.prepare('SELECT name, phone FROM clients WHERE id = ?').get('client-1') as { name: string; phone: string }
    expect(first.name).toBe(SEED_CLIENTS[0].name)
    snap.close()
  })

  it('SIMULACIÓN DE DESASTRE: la original pierde los datos (DELETE + DROP)', () => {
    const db = new Database(originalPath)
    db.exec('DELETE FROM messages; DROP TABLE messages; DROP TABLE clients;')
    const check = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='clients'").get()
    expect(check).toBeUndefined()
    db.close()
  })

  it('RESTAURACIÓN: copiar el snapshot sobre la ruta original recupera TODO', () => {
    // La restauración de producción (backup-restore-drill.sh) es EXACTAMENTE
    // esto: con la app detenida, copiar el snapshot consistente sobre la ruta
    // de la BD. El snapshot fue verificado con integrity_check antes de copiar.
    const snap = new Database(backupPath, { readonly: true })
    expect(snap.pragma('integrity_check', { simple: true })).toBe('ok')
    snap.close()
    rmSync(originalPath)
    copyFileSync(backupPath, originalPath)

    const db = new Database(originalPath, { readonly: true })
    // Integridad del resultado restaurado
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
    // Conteos restaurados al estado del snapshot
    const clientCount = (db.prepare('SELECT COUNT(*) AS n FROM clients').get() as { n: number }).n
    const messageCount = (db.prepare('SELECT COUNT(*) AS n FROM messages').get() as { n: number }).n
    expect(clientCount).toBe(ROWS)
    expect(messageCount).toBe(ROWS)
    // Datos byte a byte (no solo conteos): comparación por conjunto — el ORDER
    // BY de SQLite con ids textuales es lexicográfico, no el orden del seed.
    const all = db.prepare('SELECT id, name, phone FROM clients ORDER BY id').all() as Array<{ id: string; name: string; phone: string }>
    const byId = new Map(all.map((c) => [c.id, c]))
    expect(all).toHaveLength(ROWS)
    for (const expected of SEED_CLIENTS) {
      const got = byId.get(expected.id)
      expect(got).toEqual(expected)
    }
    const sampleMessage = db.prepare('SELECT body FROM messages WHERE client_id = ?').get('client-7') as { body: string }
    expect(sampleMessage.body).toBe('Mensaje de Cliente Roundtrip 7')
    db.close()
  })
})
