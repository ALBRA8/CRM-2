/**
 * (U1) nav.ts — modelo puro de la navegación 5+1.
 *
 * El menú se reorganiza en 5 secciones principales + Admin:
 *   Hoy · Clientes · Bandeja · Comercial · Ajustes (+ Admin)
 *
 * Reglas del plan (F4-T01, decisión A10 tratada como aprobada con reversión
 * documentada):
 *  - UNA SOLA bandeja en el menú: la canónica unificada (`inbox`). La
 *    pantalla clásica de QR (`whatsapp`) SALE del menú y queda accesible
 *    desde Ajustes → Canales; la ruta /whatsapp sigue existiendo para
 *    enlaces guardados y la PWA (compatibilidad sin redirección).
 *  - Ninguna funcionalidad queda inaccesible: todo id de esta navegación
 *    tiene vista y ruta; `whatsapp` y `activity` siguen routables aunque no
 *    aparezcan en el menú.
 *  - El filtrado por rol es el mismo RBAC del sidebar (UX; el servidor
 *    siempre re-valida). Las secciones que quedan vacías desaparecen.
 */

export interface NavItem {
  /** Vista del store (ver src/lib/views.ts). */
  id: string
  label: string
  /** Capacidad mínima RBAC (misma convención del sidebar anterior). */
  perm: string
}

export interface NavSection {
  id: string
  title: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'hoy',
    title: 'Hoy',
    items: [{ id: 'dashboard', label: 'Hoy', perm: 'clients.read' }],
  },
  {
    id: 'clientes',
    title: 'Clientes',
    items: [{ id: 'clients', label: 'Clientes', perm: 'clients.read' }],
  },
  {
    id: 'bandeja',
    title: 'Bandeja',
    items: [{ id: 'inbox', label: 'Bandeja', perm: 'whatsapp.read' }],
  },
  {
    id: 'comercial',
    title: 'Comercial',
    items: [
      { id: 'opportunities', label: 'Oportunidades', perm: 'opportunities.read' },
      { id: 'quotes', label: 'Cotizaciones', perm: 'quotes.read' },
      { id: 'products', label: 'Productos', perm: 'services.read' },
      { id: 'calendar', label: 'Agenda', perm: 'reservations.read' },
      { id: 'finances', label: 'Finanzas', perm: 'transactions.read' },
      { id: 'reports', label: 'Reportes', perm: 'reports.read' },
    ],
  },
  {
    id: 'ajustes',
    title: 'Ajustes',
    items: [{ id: 'settings', label: 'Ajustes', perm: 'settings.read' }],
  },
  {
    id: 'admin',
    title: 'Admin',
    items: [
      { id: 'automations', label: 'Automatizaciones', perm: 'automations.read' },
      { id: 'health', label: 'Salud', perm: 'team.manage' },
      { id: 'team', label: 'Equipo', perm: 'team.manage' },
      { id: 'activity', label: 'Actividad', perm: 'activity.read' },
      // Plano de control multi-organización: solo superadmin (platform.read).
      { id: 'super', label: 'Super Admin', perm: 'platform.read' },
    ],
  },
]

/**
 * Vistas que existen y son routables pero NO aparecen en el menú 5+1:
 *  - `whatsapp`: QR clásica, accesible desde Ajustes → Canales.
 *  - `client-detail` / `quote-detail`: vistas de detalle con id (deep-link).
 *  - `landing`: portada pública.
 */
export const MENU_EXCLUDED_VIEWS = ['whatsapp', 'client-detail', 'quote-detail', 'landing'] as const

/** Todos los ítems del menú (aplanado, en orden de sección). */
export function allNavItems(sections: readonly NavSection[] = NAV_SECTIONS): NavItem[] {
  return sections.flatMap((s) => s.items)
}

/**
 * Filtra la navegación por rol: aplica el RBAC al cada ítem y elimina las
 * secciones que quedan vacías. `canFn` se inyecta (por defecto el `can`
 * real de rbac.ts) para poder probar el filtro sin acoplarse al módulo.
 */
export function navSectionsFor(
  role: string | undefined,
  canFn: (role: string | undefined, perm: string) => boolean,
): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canFn(role, item.perm)),
  })).filter((section) => section.items.length > 0)
}
