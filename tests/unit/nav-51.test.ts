import { describe, expect, it } from 'vitest'
import { MENU_GROUPS, MENU_HIDDEN_VIEWS, pathForView, viewFromPath, VIEW_PERMISSIONS } from '@/lib/views'
import { ROLE_PERMISSIONS, can } from '@/lib/rbac'

/**
 * U1 — navegación única 5+1.
 *
 * Invariantes del menú nuevo:
 *  1. Hay exactamente 6 grupos: 5 secciones de usuario + Admin (solo superadmin).
 *  2. La Bandeja es UNA: 'inbox' aparece en el menú; la QR clásica ('whatsapp')
 *     NO está en el menú pero su RUTA sigue viva (/whatsapp) y queda accesible
 *     desde Ajustes → Conexiones.
 *  3. Ninguna funcionalidad se pierde: toda vista del mapa de rutas sigue
 *     resolviéndose por URL (deep-link y PWA).
 *  4. Cada ítem conserva su permiso RBAC y ese permiso existe en el RBAC real.
 */

const ORDEN_ESPERADO = ['Hoy', 'Clientes', 'Bandeja', 'Comercial', 'Ajustes', 'Admin']

describe('U1 · estructura del menú 5+1', () => {
  it('6 grupos en el orden acordado (5 + Admin)', () => {
    expect(MENU_GROUPS.map((g) => g.title)).toEqual(ORDEN_ESPERADO)
  })

  it('la bandeja es UNA y está sola en su sección', () => {
    const bandeja = MENU_GROUPS.find((g) => g.title === 'Bandeja')!
    expect(bandeja.items.map((i) => i.id)).toEqual(['inbox'])
  })

  it('la QR clásica NO está en el menú y queda documentada como oculta', () => {
    const enMenu = MENU_GROUPS.flatMap((g) => g.items.map((i) => i.id))
    expect(enMenu).not.toContain('whatsapp')
    expect(enMenu).toContain('inbox')
    const oculta = MENU_HIDDEN_VIEWS.find((v) => v.id === 'whatsapp')
    expect(oculta).toBeDefined()
    expect(oculta!.where).toContain('Ajustes')
  })

  it('el plano Admin solo contiene super y exige platform.read', () => {
    const admin = MENU_GROUPS.find((g) => g.title === 'Admin')!
    expect(admin.items.map((i) => i.id)).toEqual(['super'])
    expect(admin.items[0].perm).toBe('platform.read')
  })
})

describe('U1 · ninguna funcionalidad queda inaccesible', () => {
  it('todas las vistas del menú anterior siguen resolviéndose por ruta', () => {
    const vistasAnteriores = [
      'dashboard', 'clients', 'opportunities', 'products', 'calendar', 'quotes',
      'whatsapp', 'inbox', 'automations', 'finances', 'reports', 'team',
      'activity', 'settings', 'super',
    ]
    for (const v of vistasAnteriores) {
      const path = pathForView(v)
      expect(viewFromPath(path).view, `ruta de ${v}`).toBe(v)
    }
  })

  it('la ruta /whatsapp sigue viva para PWA y enlaces guardados', () => {
    expect(pathForView('whatsapp')).toBe('/whatsapp')
    expect(viewFromPath('/whatsapp')).toEqual({ view: 'whatsapp' })
  })

  it('cada vista del menú tiene permiso definido en VIEW_PERMISSIONS', () => {
    for (const g of MENU_GROUPS) {
      for (const item of g.items) {
        expect(VIEW_PERMISSIONS[item.id], `permiso de ${item.id}`).toBeDefined()
        expect(VIEW_PERMISSIONS[item.id]).toBe(item.perm)
      }
    }
  })

  it('todos los permisos del menú se ejercen con el RBAC real (con comodines)', () => {
    // La semántica real es can(rol, capacidad) con comodines de recurso
    // ('automations.*' concede 'automations.read'). Todos los ítems de usuario
    // son ejercibles por un ADMIN (algunos, como Reportes o Automatizaciones,
    // son de administrador por diseño); el plano Admin solo por superadmin.
    const enMenu = MENU_GROUPS.flatMap((g) => g.items)
    for (const item of enMenu) {
      if (item.id === 'super') {
        expect(can('superadmin', item.perm), `superadmin puede ${item.perm}`).toBe(true)
        expect(can('admin', item.perm), `admin NO puede ${item.perm}`).toBe(false)
      } else {
        expect(can('admin', item.perm), `admin puede ${item.perm}`).toBe(true)
      }
    }
  })

  it('sin duplicados en todo el menú', () => {
    const ids = MENU_GROUPS.flatMap((g) => g.items.map((i) => i.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
