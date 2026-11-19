/**
 * (U4) settings-dominios.test.ts — agrupación de Ajustes por dominio.
 *
 * Invariantes del plan (F4-T04):
 *  - 4 dominios, navegación de máximo 2 niveles.
 *  - CERO tabs huérfanos: los 16 tabs existentes quedan, cada uno en
 *    exactamente un dominio, con ids intactos.
 *  - Los deep-links críticos (?tab=conexiones/llm/google/instagram/facebook/
 *    telegram, retorno del OAuth de Meta) resuelven a su dominio.
 *  - `envios` solo para admin (fail-closed para no admin).
 */
import { describe, it, expect } from 'vitest'
import {
  SETTINGS_DOMAINS,
  SETTINGS_TABS,
  domainOfTab,
  firstTabOfDomain,
  resolveInitialDomain,
  tabsOfDomain,
} from '@/lib/settings-dominios'

/** Los 16 ids de tab que existían antes del reagrupado (sin cambios). */
const TABS_LEGADO = [
  'negocio', 'llm', 'google', 'whatsapp', 'conexiones', 'instagram',
  'tiktok', 'telegram', 'facebook', 'email', 'plantillas', 'custom-fields',
  'seguridad', 'team', 'envios', 'backup',
]

describe('estructura de dominios', () => {
  it('hay exactamente 4 dominios en el orden del plan', () => {
    expect(SETTINGS_DOMAINS.map((d) => d.id)).toEqual(['negocio', 'canales', 'inteligencia', 'seguridad'])
  })

  it('ningún tab huérfano: los 16 ids legados quedan y no hay extras', () => {
    expect(SETTINGS_TABS.map((t) => t.id).sort()).toEqual([...TABS_LEGADO].sort())
  })

  it('cada tab pertenece a exactamente un dominio', () => {
    for (const d of SETTINGS_DOMAINS) {
      const tabs = tabsOfDomain(d.id, true)
      expect(tabs.length).toBeGreaterThan(0)
      for (const t of tabs) expect(t.domain).toBe(d.id)
    }
    const total = SETTINGS_DOMAINS.reduce((s, d) => s + tabsOfDomain(d.id, true).length, 0)
    expect(total).toBe(SETTINGS_TABS.length)
  })

  it('cada dominio tiene descripción (la fila de dominios es autó-explicativa)', () => {
    for (const d of SETTINGS_DOMAINS) expect(d.description.length).toBeGreaterThan(15)
  })
})

describe('deep-links ?tab= preservados', () => {
  it('todos los ids legados resuelven a un dominio válido', () => {
    for (const id of TABS_LEGADO) {
      expect(domainOfTab(id), `tab: ${id}`).not.toBeNull()
    }
  })

  it('retorno del OAuth de Meta y accesos internos aterrizan en Canales/Inteligencia', () => {
    expect(domainOfTab('instagram')).toBe('canales')
    expect(domainOfTab('facebook')).toBe('canales')
    expect(domainOfTab('google')).toBe('canales')
    expect(domainOfTab('telegram')).toBe('canales')
    expect(domainOfTab('conexiones')).toBe('canales')
    expect(domainOfTab('llm')).toBe('inteligencia')
    expect(domainOfTab('envios')).toBe('inteligencia')
  })

  it('tab desconocido → null (el fail-closed lo decide resolveInitialDomain)', () => {
    expect(domainOfTab('no-existe')).toBeNull()
    expect(resolveInitialDomain('no-existe', true)).toBe('negocio')
  })
})

describe('permisos', () => {
  it('envios es admin-only; para no admin desaparece y falla a Negocio', () => {
    const envios = SETTINGS_TABS.find((t) => t.id === 'envios')!
    expect(envios.adminOnly).toBe(true)
    expect(tabsOfDomain('inteligencia', false).some((t) => t.id === 'envios')).toBe(false)
    expect(tabsOfDomain('inteligencia', true).some((t) => t.id === 'envios')).toBe(true)
    expect(resolveInitialDomain('envios', false)).toBe('negocio')
    expect(resolveInitialDomain('envios', true)).toBe('inteligencia')
  })

  it('los demás tabs no son admin-only (visibles para todo el equipo)', () => {
    expect(SETTINGS_TABS.filter((t) => t.adminOnly).map((t) => t.id)).toEqual(['envios'])
  })

  it('firstTabOfDomain devuelve siempre un tab visible del dominio', () => {
    for (const d of SETTINGS_DOMAINS) {
      for (const isAdmin of [true, false]) {
        const first = firstTabOfDomain(d.id, isAdmin)
        expect(tabsOfDomain(d.id, isAdmin).some((t) => t.id === first)).toBe(true)
      }
    }
    // Inteligencia sin admin → IA del CRM (no Envíos).
    expect(firstTabOfDomain('inteligencia', false)).toBe('llm')
  })
})
