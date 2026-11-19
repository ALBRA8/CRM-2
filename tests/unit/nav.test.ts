/**
 * (U1) nav.test.ts — modelo puro de la navegación 5+1.
 *
 * Invariantes del plan (F4-T01):
 *  - Secciones 5+1: Hoy · Clientes · Bandeja · Comercial · Ajustes (+ Admin).
 *  - UNA SOLA bandeja en el menú: `inbox` exactamente una vez y `whatsapp`
 *    fuera del menú (queda accesible por ruta /whatsapp y desde Ajustes).
 *  - Ninguna funcionalidad inaccesible: todo ítem del menú tiene vista y
 *    ruta estática; las vistas excluidas del menú siguen routables.
 *  - RBAC: sin sección vacía; super solo con platform.read; los permisos
 *    son capacidades conocidas por el RBAC real.
 */
import { describe, it, expect } from 'vitest'
import {
  NAV_SECTIONS,
  MENU_EXCLUDED_VIEWS,
  allNavItems,
  navSectionsFor,
} from '@/lib/nav'
import { STATIC_VIEW_PATH, viewFromPath } from '@/lib/views'
import { can, KNOWN_ROLES } from '@/lib/rbac'

describe('estructura 5+1', () => {
  it('hay exactamente 6 secciones en el orden del plan', () => {
    expect(NAV_SECTIONS.map((s) => s.id)).toEqual([
      'hoy', 'clientes', 'bandeja', 'comercial', 'ajustes', 'admin',
    ])
  })

  it('la primera sección es «Hoy» y su ítem es el dashboard', () => {
    expect(NAV_SECTIONS[0].title).toBe('Hoy')
    expect(NAV_SECTIONS[0].items[0].id).toBe('dashboard')
  })

  it('sin ids duplicados ni etiquetas duplicadas en todo el menú', () => {
    const items = allNavItems()
    const ids = items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    const labels = items.map((i) => i.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('bandeja única', () => {
  it('inbox aparece exactamente UNA vez y en la sección Bandeja', () => {
    const items = allNavItems()
    expect(items.filter((i) => i.id === 'inbox')).toHaveLength(1)
    expect(NAV_SECTIONS.find((s) => s.id === 'bandeja')!.items[0].id).toBe('inbox')
  })

  it('whatsapp (QR clásica) NO está en ninguna sección del menú', () => {
    expect(allNavItems().some((i) => i.id === 'whatsapp')).toBe(false)
    expect(MENU_EXCLUDED_VIEWS).toContain('whatsapp')
  })

  it('la vista whatsapp sigue routable: /whatsapp resuelve y el menú no la lista', () => {
    expect(viewFromPath('/whatsapp').view).toBe('whatsapp')
    expect(STATIC_VIEW_PATH['whatsapp']).toBe('/whatsapp')
  })
})

describe('ninguna funcionalidad inaccesible', () => {
  it('todo ítem del menú tiene ruta estática real', () => {
    for (const item of allNavItems()) {
      expect(STATIC_VIEW_PATH[item.id], `falta ruta para ${item.id}`).toBeTruthy()
      // El fallback de viewFromPath es '/dashboard': ningún ítem puede caer
      // en él (dashboard es el único que legítimamente apunta ahí).
      if (item.id !== 'dashboard') {
        expect(STATIC_VIEW_PATH[item.id]).not.toBe('/dashboard')
      }
    }
  })

  it('las vistas excluidas del menú siguen existiendo como vistas/rutas', () => {
    // whatsapp tiene página App Router propia (src/app/whatsapp/page.tsx)
    // y las vistas de detalle resuelven por patrón de id.
    expect(viewFromPath('/clients/abc123')).toEqual({ view: 'client-detail', clientId: 'abc123' })
    expect(viewFromPath('/quotes/xyz789')).toEqual({ view: 'quote-detail', quoteId: 'xyz789' })
  })
})

describe('RBAC de la navegación', () => {
  it('todo permiso del menú es una capacidad ejercible por superadmin', () => {
    for (const item of allNavItems()) {
      expect(can('superadmin', item.perm), `permiso raro: ${item.perm}`).toBe(true)
    }
  })

  it('owner ve todas las secciones salvo Super Admin', () => {
    const sections = navSectionsFor('owner', can)
    const ids = allNavItems(sections).map((i) => i.id)
    expect(ids).toContain('dashboard')
    expect(ids).toContain('inbox')
    expect(ids).not.toContain('super')
    // 6 secciones (admin visible sin super)
    expect(sections).toHaveLength(6)
  })

  it('agent: sin secciones vacías y sin módulos de admin', () => {
    const sections = navSectionsFor('agent', can)
    const ids = allNavItems(sections).map((i) => i.id)
    expect(ids).not.toContain('health')
    expect(ids).not.toContain('team')
    expect(ids).not.toContain('automations')
    expect(ids).not.toContain('settings') // settings.* NO es de agent
    for (const s of sections) expect(s.items.length).toBeGreaterThan(0)
    // bandeja y comercial siguen visibles para agent
    expect(ids).toContain('inbox')
    expect(ids).toContain('quotes')
  })

  it('superadmin ve todo incluido Super Admin', () => {
    const ids = allNavItems(navSectionsFor('superadmin', can)).map((i) => i.id)
    expect(ids).toContain('super')
  })

  it('sin rol cae fail-closed al nivel member (el sidebar ni se renderiza sin sesión)', () => {
    const ids = allNavItems(navSectionsFor(undefined, can)).map((i) => i.id)
    const memberIds = allNavItems(navSectionsFor('member', can)).map((i) => i.id)
    expect(ids).toEqual(memberIds)
  })

  it('todos los roles conocidos filtran sin excepciones', () => {
    for (const role of KNOWN_ROLES) {
      expect(() => navSectionsFor(role, can)).not.toThrow()
    }
  })
})
