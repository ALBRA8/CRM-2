/**
 * (U5) pulido-visual.test.ts — F4-T05: tipografía, dark mode y estados vacíos.
 *
 * INVARIANTES que bloquean regresiones visuales en CI:
 *  1. Tipografía: NINGUNA clase de texto arbitraria por debajo de 13px en
 *     el código de la app (src/components + src/app). El mínimo del CRM es
 *     13px y `text-xs` está redefinido a 13px como token (@utility).
 *  2. Dark mode consistente: la decisión del plan es COMPLETARLO (no
 *     retirarlo): ThemeProvider con attribute="class" en el layout, el
 *     ThemeToggle en el header (desktop y móvil) y la capa `.dark` de
 *     globals.css remapeando las utilidades crudas de las superficies.
 *     Si alguien borra la capa dark o el toggle, el modo queda a medias
 *     (primitivas oscuras + superficies claras) y este test lo detecta.
 *  3. Estados vacíos: el componente reutilizable EmptyState existe y está
 *     adoptado en las pantallas principales; ninguna pantalla principal
 *     vuelve a pintar vacíos artesanales sin acción.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(process.cwd())

/** Recorre recursivamente un directorio y devuelve sus archivos .ts/.tsx. */
function walkTs(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walkTs(full))
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

/** Clases de texto arbitrarias por debajo de 13px (prohibidas por U5). */
const CLASES_SUB13 = /text-\[(?:9|10|11|12)(?:\.\d+)?px\]/g

function readRel(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}

describe('U5 · tipografía mínima 13px', () => {
  it('INVARIANTE: ninguna clase text-[…px] por debajo de 13px en src/', () => {
    const offenders: string[] = []
    for (const dir of ['src/components', 'src/app']) {
      for (const file of walkTs(join(ROOT, dir))) {
        const content = readFileSync(file, 'utf8')
        if (CLASES_SUB13.test(content)) offenders.push(file.replace(ROOT + '/', ''))
        CLASES_SUB13.lastIndex = 0
      }
    }
    expect(offenders, `clases sub-13px en: ${offenders.join(', ')}`).toEqual([])
  })

  it('INVARIANTE: text-xs está redefinido como token a 13px en globals.css', () => {
    const css = readRel('src/app/globals.css')
    expect(css).toMatch(/@utility\s+text-xs\s*\{/)
    const block = css.match(/@utility\s+text-xs\s*\{[^}]*\}/)?.[0] ?? ''
    expect(block).toContain('13px')
    expect(block).toMatch(/font-size:\s*13px/)
  })
})

describe('U5 · dark mode consistente (decisión: completar)', () => {
  it('el layout monta ThemeProvider con attribute="class" (next-themes activo)', () => {
    const layout = readRel('src/app/layout.tsx')
    expect(layout).toContain('ThemeProvider')
    expect(layout).toMatch(/attribute="class"/)
  })

  it('el header (desktop y móvil) monta el ThemeToggle', () => {
    const layout = readRel('src/components/layout/app-layout.tsx')
    const count = (layout.match(/<ThemeToggle\s*\/>/g) ?? []).length
    expect(count).toBeGreaterThanOrEqual(2)
    expect(layout).toContain("import { ThemeToggle }")
  })

  it('la capa .dark de globals.css remapea las superficies crudas del negocio', () => {
    const css = readRel('src/app/globals.css')
    // Superficies: blanco y grises de fondo (los selectores pueden ir agrupados con coma)
    expect(css).toMatch(/\.dark\s+\.bg-white[\s,]/)
    expect(css).toMatch(/\.dark\s+\.bg-(?:gray|slate)-50[\s,]/)
    expect(css).toMatch(/\.dark\s+\.bg-(?:gray|slate)-100[\s,]/)
    // Textos y bordes del cromo de la app
    expect(css).toMatch(/\.dark\s+\.text-(?:slate|gray)-(?:900|800)[\s,]/)
    expect(css).toMatch(/\.dark\s+\.text-(?:slate|gray)-(?:600|500)[\s,]/)
    expect(css).toMatch(/\.dark\s+\.border-(?:gray|slate)-200[\s,]/)
    // Estados semánticos y scrollbar
    expect(css).toMatch(/\.dark\s+\.bg-emerald-50[\s,]/)
    expect(css).toMatch(/\.dark\s+\.text-emerald-600/)
    expect(css).toMatch(/\.dark\s+::-webkit-scrollbar-thumb/)
    // El sistema sabe que está en oscuro (inputs nativos, scrollbars)
    expect(css).toMatch(/\.dark\s*\{\s*color-scheme:\s*dark;/)
  })

  it('los archivos del sistema de tema existen (decisión reversible por git)', () => {
    expect(() => readRel('src/components/theme-provider.tsx')).not.toThrow()
    expect(() => readRel('src/components/layout/theme-toggle.tsx')).not.toThrow()
    const toggle = readRel('src/components/layout/theme-toggle.tsx')
    expect(toggle).toContain('next-themes')
  })
})

describe('U5 · estados vacíos reutilizables', () => {
  const PANTALLAS = [
    'src/components/inbox/inbox-page.tsx',
    'src/components/whatsapp/whatsapp-page.tsx',
    'src/components/quotes/quotes-list.tsx',
    'src/components/automations/automations-page.tsx',
    'src/components/clients/clients-list.tsx',
    'src/components/products/products-page.tsx',
  ]

  it('el componente EmptyState existe con la API acordada', () => {
    const src = readRel('src/components/ui/empty-state.tsx')
    expect(src).toContain('export function EmptyState')
    for (const prop of ['icon', 'title', 'description', 'action', 'size']) {
      expect(src).toContain(prop)
    }
  })

  it('INVARIANTE: las 6 pantallas principales adoptan EmptyState', () => {
    for (const rel of PANTALLAS) {
      const src = readRel(rel)
      expect(src, `${rel} debe importar EmptyState`).toContain(
        "from '@/components/ui/empty-state'"
      )
    }
  })

  it('el EmptyState respeta la escala tipográfica (mínimo 13px en el propio componente)', () => {
    const src = readRel('src/components/ui/empty-state.tsx')
    expect(CLASES_SUB13.test(src)).toBe(false)
    CLASES_SUB13.lastIndex = 0
    expect(src).toContain('text-[13px]')
  })
})
