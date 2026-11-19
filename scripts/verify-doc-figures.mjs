#!/usr/bin/env node
/**
 * verify-doc-figures.mjs — (E4) verificador de cifras documentales contra el código.
 *
 * La "falsa confianza" documental (readiness con cifras que cambiaron sin
 * actualizarse) se cierra con un bloque canónico en PRODUCTION_READINESS.md
 * que este script RECUENTA del código real en cada corrida:
 *
 *   <!-- FIGURAS-CANONICAS-INICIO ... -->
 *   rutas_api: 125
 *   ...
 *   <!-- FIGURAS-CANONICAS-FIN -->
 *
 * Uso:
 *   node scripts/verify-doc-figures.mjs            # valida el bloque (exit 0/1)
 *   node scripts/verify-doc-figures.mjs --print    # imprime las cifras reales (para actualizar el bloque)
 *   node scripts/verify-doc-figures.mjs --json     # JSON de las cifras reales
 *
 * Reglas de conteo (deterministas, sin ejecutar la suite):
 *   - rutas_api:        archivos route.ts bajo src/app/api
 *   - archivos_prueba:  archivos test.ts bajo tests/ (cualquier profundidad)
 *   - modelos_prisma:   bloques `model X` en prisma/schema.prisma
 *   - migraciones:      directorios en prisma/migrations (sin migration_lock)
 *   - componentes_ui:   archivos .tsx en src/components
 */
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', cwd: ROOT }).trim()
}

export function realFigures() {
  const rutasApi = sh('find src/app/api -name "route.ts" | wc -l').split('\n').pop()
  const archivosPrueba = sh('find tests -name "*.test.ts" | wc -l').split('\n').pop()
  const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8')
  const modelos = (schema.match(/^model\s+\w+/gm) ?? []).length
  const migraciones = sh('ls -1 prisma/migrations | grep -v migration_lock | wc -l').split('\n').pop()
  const componentes = sh('find src/components -name "*.tsx" | wc -l').split('\n').pop()
  return {
    rutas_api: Number(rutasApi),
    archivos_prueba: Number(archivosPrueba),
    modelos_prisma: Number(modelos),
    migraciones: Number(migraciones),
    componentes_ui: Number(componentes),
  }
}

const DOC = join(ROOT, 'PRODUCTION_READINESS.md')
const START = '<!-- FIGURAS-CANONICAS-INICIO'
const END_TOKEN = 'FIGURAS-CANONICAS-FIN'

function parseCanonicalBlock(text) {
  const i = text.indexOf(START)
  if (i < 0) throw new Error('Bloque FIGURAS-CANONICAS no encontrado en PRODUCTION_READINESS.md')
  const j = text.indexOf(END_TOKEN, i)
  if (j < 0) throw new Error('Bloque FIGURAS-CANONICAS sin cierre')
  const body = text.slice(i, j)
  const figs = {}
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(\w+)\s*:\s*(\d+)\s*$/)
    if (m) figs[m[1]] = Number(m[2])
  }
  return figs
}

const figs = realFigures()

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(figs, null, 2))
  process.exit(0)
}

if (process.argv.includes('--print')) {
  console.log('<!-- FIGURAS-CANONICAS-INICIO (verificado por scripts/verify-doc-figures.mjs — no editar a mano) -->')
  for (const [k, v] of Object.entries(figs)) console.log(`${k}: ${v}`)
  console.log('<!-- FIGURAS-CANONICAS-FIN -->')
  process.exit(0)
}

if (!existsSync(DOC)) {
  console.error('No se encontró PRODUCTION_READINESS.md')
  process.exit(1)
}

let declared
try {
  declared = parseCanonicalBlock(readFileSync(DOC, 'utf8'))
} catch (e) {
  console.error(`ERROR: ${e.message}`)
  process.exit(1)
}

const mismatches = []
for (const [k, v] of Object.entries(figs)) {
  if (!(k in declared)) mismatches.push(`Falta en el bloque: ${k}`)
  else if (declared[k] !== v) mismatches.push(`${k}: documento declara ${declared[k]}, el código tiene ${v}`)
}
for (const k of Object.keys(declared)) {
  if (!(k in figs)) mismatches.push(`El bloque declara "${k}" que el verificador no reconoce`)
}

if (mismatches.length > 0) {
  console.error('CIFRAS DESALINEADAS — actualiza el bloque canónico (node scripts/verify-doc-figures.mjs --print):')
  for (const m of mismatches) console.error(`  - ${m}`)
  process.exit(1)
}

console.log(`OK — cifras del documento conciliadas con el código: ${Object.entries(figs).map(([k, v]) => `${k}=${v}`).join(', ')}`)
