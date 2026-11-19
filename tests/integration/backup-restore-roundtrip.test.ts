import { mkdtempSync, rmSync, existsSync, statSync, openSync, writeSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * (E7 / F6-T04 — MODIFICADA: solo CRM) Test automatizado de BACKUP/RESTORE.
 *
 * El plan exige: "Test que crea BD ficticia, respalda, elimina y restaura
 * verificando integridad y conteos". Este roundtrip cubre la CADENA COMPLETA
 * con la MISMA mecánica que producción usa (scripts/sqlite-backup.cjs):
 *
 *   [1] BD ficticia sintética (dos tablas con filas conocidas, en modo WAL
 *       como la real) → [2] snapshot consistente con la Online Backup API
 *       de SQLite + PRAGMA integrity_check del producto → [3] escrituras
 *       posteriores al snapshot (deben PERDERSE al restaurar) → [4]
 *       destrucción controlada del estado vivo (DELETE de todas las filas)
 *       → [5] restauración desde el snapshot → [6] verificación: integridad
 *       ok, conteos idénticos al punto de captura, contenido idéntico y las
 *       filas post-snapshot ausentes.
 *
 * Además se ejecuta scripts/sqlite-backup.cjs REAL (subproceso) para
 * verificar: (a) un snapshot sano sale exit 0 con integridad ok; (b) una
 * BD fuente dañada produce exit 2 — un backup silenciosamente dañado NO
 * pasa desapercibido.
 *
 * NO toca la BD real (DATABASE_URL no se lee): todo vive en /tmp. El drill
 * completo con acta (arranque standalone + auth) es el paso del propietario
 * (decisión A8) con scripts/backup-restore-drill.sh.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'agent'
);
CREATE TABLE IF NOT EXISTS "Client" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "score" INTEGER
);
`

type Counts = { users: number; clients: number }

function rowsFor(db: Database.Database): Counts {
  return {
    users: (db.prepare('SELECT COUNT(*) AS n FROM "User"').get() as { n: number }).n,
    clients: (db.prepare('SELECT COUNT(*) AS n FROM "Client"').get() as { n: number }).n,
  }
}

/** Corre el script de producción sobre una BD y devuelve su exit code. */
function runBackupScript(env: Record<string, string>): number {
  try {
    execFileSync(process.execPath, ['scripts/sqlite-backup.cjs'], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: 'pipe',
    })
    return 0
  } catch (err) {
    return (err as { status?: number }).status ?? -1
  }
}

/** Pisa bytes del interior del archivo con ceros (degradación controlada). */
function corrupt(path: string, at: number, bytes: number): void {
  const buf = Buffer.alloc(bytes, 0x00)
  const fd = openSync(path, 'r+')
  writeSync(fd, buf, 0, bytes, at)
  closeSync(fd)
}

const dirs: string[] = []

function tmpDir(prefix: string): string {
  const d = mkdtempSync(prefix)
  dirs.push(d)
  return d
}

afterEach(() => {
  while (dirs.length) {
    rmSync(dirs.pop() as string, { recursive: true, force: true })
  }
})

describe('E7 · backup/restore roundtrip (Online Backup API → destrucción → restauración)', () => {
  it('restaurar devuelve integridad, conteos y contenido EXACTOS del punto de captura', async () => {
    const work = tmpDir('/tmp/e7-roundtrip-')
    const livePath = join(work, 'custom.db')
    const snapshotPath = join(work, 'snapshot.db')

    // [1] BD ficticia sintética (WAL como la BD real de producción)
    const db = new Database(livePath)
    db.pragma('journal_mode = WAL')
    db.exec(SCHEMA)
    const insertUser = db.prepare('INSERT INTO "User" (id, email, name, role) VALUES (?, ?, ?, ?)')
    const insertClient = db.prepare('INSERT INTO "Client" (id, name, phone, score) VALUES (?, ?, ?, ?)')
    db.transaction(() => {
      insertUser.run('u1', 'maria@albra.co', 'María Dueña', 'owner')
      insertUser.run('u2', 'luis@albra.co', 'Luis Agente', 'agent')
      insertClient.run('c1', 'José García', '+573001110000', 92)
      insertClient.run('c2', 'Ana Torres', '+573002220000', 78)
      insertClient.run('c3', 'Café La Esquina', '+573003330000', 64)
    })()
    const before = rowsFor(db)
    expect(before).toEqual({ users: 2, clients: 3 })

    // [2] Snapshot consistente (misma mecánica que scripts/sqlite-backup.cjs)
    await db.backup(snapshotPath)
    const snapReader = new Database(snapshotPath, { readonly: true })
    expect(snapReader.pragma('integrity_check', { simple: true })).toBe('ok')
    snapReader.close()

    // [3] Escrituras POSTERIORES al snapshot (al restaurar deben perderse)
    insertClient.run('c4', 'Creado DESPUÉS del backup', '+573999990000', 1)
    expect(rowsFor(db).clients).toBe(4)

    // [4] Destrucción controlada del estado vivo (pérdida simulada)
    db.exec('DELETE FROM "Client"; DELETE FROM "User";')
    expect(rowsFor(db)).toEqual({ users: 0, clients: 0 })
    db.close()

    // [5] Restauración desde el snapshot hacia la ruta viva
    const snap = new Database(snapshotPath, { readonly: true })
    await snap.backup(livePath)
    snap.close()

    // [6] Verificación: integridad + conteos + contenido + ausencia de post-snapshot
    const restored = new Database(livePath, { readonly: true })
    expect(restored.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(rowsFor(restored)).toEqual(before)
    expect(restored.prepare('SELECT name, phone, score FROM "Client" WHERE id = ?').get('c1'))
      .toEqual({ name: 'José García', phone: '+573001110000', score: 92 })
    expect((restored.prepare('SELECT COUNT(*) AS n FROM "Client" WHERE id = ?').get('c4') as { n: number }).n)
      .toBe(0)
    restored.close()
  })

  it('scripts/sqlite-backup.cjs (subproceso real) sobre BD sana → exit 0, snapshot íntegro con los datos', () => {
    const work = tmpDir('/tmp/e7-script-')
    const livePath = join(work, 'custom.db')
    const outPath = join(work, 'snapshot.db')
    const db = new Database(livePath)
    db.exec(SCHEMA)
    db.prepare('INSERT INTO "Client" (id, name, phone, score) VALUES (?, ?, ?, ?)')
      .run('c1', 'Probar script', '+573001110000', 50)
    db.close()

    const code = runBackupScript({ DATABASE_URL: `file:${livePath}`, BACKUP_OUT: outPath })
    expect(code).toBe(0)
    expect(existsSync(outPath)).toBe(true)
    expect(statSync(outPath).size).toBeGreaterThan(0)
    const snap = new Database(outPath, { readonly: true })
    expect(snap.pragma('integrity_check', { simple: true })).toBe('ok')
    expect((snap.prepare('SELECT COUNT(*) AS n FROM "Client"').get() as { n: number }).n).toBe(1)
    snap.close()
  })

  it('BD fuente dañada → exit 2: un backup silenciosamente dañado NO pasa desapercibido', () => {
    const work = tmpDir('/tmp/e7-corrupt-')
    const livePath = join(work, 'custom.db')
    const outPath = join(work, 'snapshot.db')
    const db = new Database(livePath)
    db.exec(SCHEMA)
    db.prepare('INSERT INTO "Client" (id, name) VALUES (?, ?)').run('c1', 'Víctima')
    db.close()

    corrupt(livePath, 4096, 128)

    const code = runBackupScript({ DATABASE_URL: `file:${livePath}`, BACKUP_OUT: outPath })
    expect(code).toBe(2)
  })
})
