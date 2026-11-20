#!/usr/bin/env node
/**
 * build-purge-replace-text.mjs — Generador de expresiones de purga para S2
 * (plan definitivo CRM-ALBRA v2.0, F1-T02: purga del historial git).
 *
 * Recorre TODO el historial con la MISMA tabla de patrones y las mismas reglas
 * del escáner (PATTERNS + marcador `scan-secrets:allow` de scan-secrets.mjs)
 * y vuelca los VALORES LITERALES de los hallazgos cuya huella (sha256-12)
 * está en la baseline con estado `ROTACION-PENDIENTE` al archivo:
 *
 *     scripts/security/.purge-replace-text.txt   (formato de --replace-text)
 *
 * Para ejecutarse en la ventana de purga:
 *     git filter-repo --replace-text scripts/security/.purge-replace-text.txt
 *
 * SEGURIDAD:
 *  - El archivo generado contiene secretos literales: NUNCA se versiona
 *    (entrada dedicada en .gitignore), se crea con permisos 0600 y el runbook
 *    (docs/actas/VENTANA-PURGA-HISTORIAL-S2.md) ordena BORRARLO al cerrar la
 *    ventana.
 *  - Los valores jamás se imprimen en pantalla ni en el resumen (solo
 *    longitudes y huellas, que ya son públicos en la baseline).
 *  - Con --verify solo cuenta y reporta cobertura, sin escribir nada.
 *  - Sin --verify se niega a ejecutarse con el árbol sucio (la purga exige un
 *    clon limpio y dedicado).
 *
 * Uso:
 *   node scripts/security/build-purge-replace-text.mjs --verify   # contar
 *   node scripts/security/build-purge-replace-text.mjs            # generar
 */
import { execSync } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { PATTERNS } from '../scan-secrets.mjs'

const BASELINE_PATH = join('scripts', 'security', 'secret-baseline.json')
const OUTPUT_PATH = join('scripts', 'security', '.purge-replace-text.txt')
const REMOVED_TOKEN = '***REMOVED***'
const ALLOW_MARK = 'scan-secrets:allow'

const verifyOnly = process.argv.includes('--verify')
if (!verifyOnly) {
  const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim()
  if (dirty) {
    console.error('ERROR: el árbol de trabajo está sucio. La purga (S2) exige un clon limpio y dedicado.')
    process.exit(2)
  }
}

if (!existsSync(BASELINE_PATH)) throw new Error('No existe la baseline: ' + BASELINE_PATH)
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
const pending = baseline.filter((b) => b.status === 'ROTACION-PENDIENTE')
if (pending.length === 0) {
  console.error('La baseline no tiene entradas ROTACION-PENDIENTE: no hay nada que purgar.')
  process.exit(0)
}
const pendingMap = new Map(pending.map((b) => [b.fingerprint, b]))

const commits = execSync('git rev-list --all', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n').filter(Boolean)
process.stderr.write(`Escaneando ${commits.length} commits del historial…\n`)

// huella -> { literal (solo en memoria), commits, categories, length }
const found = new Map()
let findings = 0
const scanned = new Set()
for (const c of commits) {
  let files = []
  try {
    files = execSync(`git show ${c} --format= --name-only --diff-filter=AM`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n').filter(Boolean)
  } catch { continue }
  for (const file of files) {
    const key = `${c}:${file}`
    if (scanned.has(key)) continue
    scanned.add(key)
    let blob = ''
    try {
      blob = execSync(`git show ${c}:${JSON.stringify(file)}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    } catch { continue /* binario o ausente en ese commit */ }
    for (const p of PATTERNS) {
      p.re.lastIndex = 0
      let m
      while ((m = p.re.exec(blob)) !== null) {
        const raw = (m[1] ?? m[0]).trim()
        const lineNo = blob.slice(0, m.index).split('\n').length
        const line = blob.split('\n')[lineNo - 1] ?? ''
        if (line.includes(ALLOW_MARK)) continue
        const fp = createHash('sha256').update(raw).digest('hex').slice(0, 12)
        p.re.lastIndex = m.index + m[0].length // evita bucles en matches vacíos
        if (!pendingMap.has(fp)) continue
        findings++
        const entry = found.get(fp) ?? { literal: raw, commits: new Set(), categories: new Set(), length: raw.length }
        entry.commits.add(c.slice(0, 8))
        entry.categories.add(p.id)
        entry.length = raw.length
        found.set(fp, entry)
      }
    }
  }
}

const missing = [...pendingMap.keys()].filter((fp) => !found.has(fp))
const summary = {
  commitsEscaneados: commits.length,
  huellasPendientesEnBaseline: pendingMap.size,
  huellasLocalizadasEnHistorial: found.size,
  cobertura: `${found.size}/${pendingMap.size}`,
  hallazgosTotales: findings,
  huellasNoLocalizadas: missing,
}
console.error(JSON.stringify(summary, null, 1))

if (verifyOnly) process.exit(0)

// Orden por longitud DESCENDENTE: filter-repo aplica las reglas en orden y así
// un literal prefijo de otro no "consume" el reemplazo antes de tiempo.
const entries = [...found.values()].sort((a, b) => b.literal.length - a.literal.length)
const content = entries.map((e) => `${e.literal}==>${REMOVED_TOKEN}`).join('\n') + '\n'
writeFileSync(OUTPUT_PATH, content, { mode: 0o600 })
chmodSync(OUTPUT_PATH, 0o600)
console.error(`Escrito ${OUTPUT_PATH} (${entries.length} reglas, permisos 0600).`)
console.error('RECUERDA: borrar este archivo al cerrar la ventana de purga. NUNCA versionarlo.')
