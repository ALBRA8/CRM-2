/**
 * (D4) verify-doc-figures.test.ts — check de cifras documentales en CI.
 *
 * Cubre:
 *  - caso positivo: el bloque canónico de PRODUCTION_READINESS.md coincide
 *    con el código REAL (exit 0) — esta prueba ES el check,
 *  - caso negativo exigido por el plan: una afirmación falsa (cifra que el
 *    código no respalda) DEBE hacer fallar el verificador (exit 1 con
 *    diferencia explícita),
 *  - ausencia de bloque o de cierre → exit 1 (no se puede declarar sin bloque).
 */
import { describe, it, expect } from 'vitest'
import { execSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(process.cwd(), 'scripts/verify-doc-figures.mjs')
const DOC = join(process.cwd(), 'PRODUCTION_READINESS.md')

function runIn(dir: string): { status: number; output: string } {
  const r = spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' })
  return { status: r.status ?? -1, output: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('verify-doc-figures (E4/D4)', () => {
  it('el bloque canónico del repo coincide con el código real (exit 0)', () => {
    // En el repo real, el check debe estar en verde: esta es la prueba que
    // correrá CI como paso explícito tras la suite.
    const out = execSync(`node ${JSON.stringify(SCRIPT)}`, { encoding: 'utf8' })
    expect(out).toContain('OK — cifras del documento conciliadas')
  })

  it('una cifra falsa hace fallar el check con la diferencia exacta (exit 1)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verify-figs-'))
    try {
      // Entorno "vacío": sin src/ ni prisma/ → todas las cifras reales son 0.
      // Un documento que declara cifras ≠ 0 es una afirmación SIN evidencia.
      writeFileSync(
        join(dir, 'PRODUCTION_READINESS.md'),
        [
          '<!-- FIGURAS-CANONICAS-INICIO (verificado) -->',
          'rutas_api: 125',
          'archivos_prueba: 105',
          'modelos_prisma: 46',
          'migraciones: 17',
          'componentes_ui: 104',
          '<!-- FIGURAS-CANONICAS-FIN -->',
        ].join('\n'),
      )
      const { status, output } = runIn(dir)
      expect(status).toBe(1)
      expect(output).toContain('CIFRAS DESALINEADAS')
      expect(output).toContain('rutas_api: documento declara 125, el código tiene 0')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('bloque sin cierre o ausente → exit 1 (falla ruidoso)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verify-figs-'))
    try {
      writeFileSync(join(dir, 'PRODUCTION_READINESS.md'), '# Sin bloque\n')
      const { status, output } = runIn(dir)
      expect(status).toBe(1)
      expect(output).toContain('FIGURAS-CANONICAS')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('modo --print emite el bloque listo para pegar (5 cifras)', () => {
    const out = execSync(`node ${JSON.stringify(SCRIPT)} --print`, { encoding: 'utf8' })
    expect(out).toContain('FIGURAS-CANONICAS-INICIO')
    expect(out).toContain('FIGURAS-CANONICAS-FIN')
    const lines = out.split('\n').filter((l) => /^[a-z_]+: \d+$/.test(l))
    expect(lines).toHaveLength(5)
  })

  it('el CI contiene el paso del check tras la suite (D4 cableado)', () => {
    const ci = readFileSync(
      join(process.cwd(), '.github/workflows/ci.yml'),
      'utf8',
    )
    expect(ci).toMatch(/Suite de tests/)
    expect(ci).toMatch(/node scripts\/verify-doc-figures\.mjs/)
    // Orden: el check corre DESPUÉS de la suite y ANTES del build.
    const suiteIdx = ci.indexOf('Suite de tests')
    const figsIdx = ci.indexOf('verify-doc-figures')
    const buildIdx = ci.indexOf('Build de producción')
    expect(figsIdx).toBeGreaterThan(suiteIdx)
    expect(buildIdx).toBeGreaterThan(figsIdx)
  })
})
