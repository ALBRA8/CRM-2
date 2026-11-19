/**
 * Mapa vista-URL del CRM (Fase 2: deep-linking).
 *
 * La app navega en modo SPA (setView, sin recarga) pero la URL SIEMPRE
 * refleja el estado: history.pushState en cada cambio de vista y lectura
 * del pathname al bootear. Cada ruta tiene además su archivo App Router
 * (src/app/dashboard/page.tsx, etc.) para que refresh y link compartidos
 * carguen directamente (verificado con el gateway: todas las rutas llegan
 * a la app en el puerto 3000).
 */

export interface ViewState {
  view: string
  clientId?: string
  quoteId?: string
}

/** Vistas sin parámetros → ruta estática. */
const STATIC_VIEW_PATH: Record<string, string> = {
  dashboard: '/dashboard',
  clients: '/clients',
  opportunities: '/pipeline',
  calendar: '/calendar',
  products: '/products',
  quotes: '/quotes',
  whatsapp: '/whatsapp',
  inbox: '/inbox',
  automations: '/automations',
  finances: '/finances',
  reports: '/reports',
  team: '/team',
  activity: '/activity',
  settings: '/settings',
  super: '/super',
}

/**
 * U1 — Menú único 5+1 (plan definitivo, fase 4).
 *
 * Cinco secciones para el usuario + un plano Admin solo superadmin:
 *   Hoy (dashboard) · Clientes · Bandeja (ÚNICA) · Comercial · Ajustes (+ Admin).
 *
 * La pantalla clásica de WhatsApp por QR (`/whatsapp`, sesión única del daemon)
 * SALE del menú principal y queda accesible desde Ajustes → Conexiones
 * ("Abrir la pantalla clásica"); la RUTA sigue viva para PWA y enlaces
 * guardados (viewFromPath la resuelve igual que antes). Ninguna funcionalidad
 * queda inaccesible: el grupo Comercial agrupa lo que antes era lista plana.
 */
export interface MenuItem {
  id: string
  label: string
  perm: string
}

export interface MenuGroup {
  /** Título de sección (en mayúsculas pequeñas en el sidebar). */
  title: string
  items: MenuItem[]
}

export const MENU_GROUPS: MenuGroup[] = [
  {
    title: 'Hoy',
    items: [{ id: 'dashboard', label: 'Inicio', perm: 'clients.read' }],
  },
  {
    title: 'Clientes',
    items: [
      { id: 'clients', label: 'Clientes', perm: 'clients.read' },
      { id: 'calendar', label: 'Calendario', perm: 'reservations.read' },
      { id: 'activity', label: 'Actividad', perm: 'activity.read' },
    ],
  },
  {
    title: 'Bandeja',
    items: [{ id: 'inbox', label: 'Bandeja', perm: 'whatsapp.read' }],
  },
  {
    title: 'Comercial',
    items: [
      { id: 'opportunities', label: 'Oportunidades', perm: 'opportunities.read' },
      { id: 'products', label: 'Productos', perm: 'services.read' },
      { id: 'quotes', label: 'Cotizaciones', perm: 'quotes.read' },
      { id: 'finances', label: 'Finanzas', perm: 'transactions.read' },
      { id: 'reports', label: 'Reportes', perm: 'reports.read' },
      { id: 'automations', label: 'Automatizaciones', perm: 'automations.read' },
    ],
  },
  {
    title: 'Ajustes',
    items: [
      { id: 'settings', label: 'Configuración', perm: 'settings.read' },
      { id: 'team', label: 'Equipo', perm: 'team.manage' },
    ],
  },
  {
    title: 'Admin',
    items: [{ id: 'super', label: 'Super Admin', perm: 'platform.read' }],
  },
]

/**
 * Vistas que quedaron FUERA del menú 5+1 pero siguen vivas por ruta
 * (deep-link, PWA y accesos desde Ajustes).
 */
export const MENU_HIDDEN_VIEWS: Array<{ id: string; label: string; perm: string; where: string }> = [
  { id: 'whatsapp', label: 'WhatsApp clásico (QR)', perm: 'whatsapp.read', where: 'Ajustes → Conexiones' },
]

/** Ruta inversa (path → view), generada para nunca divergir. */
const PATH_TO_VIEW: Record<string, string> = Object.fromEntries(
  Object.entries(STATIC_VIEW_PATH).map(([view, path]) => [path, view])
)

/** Capacidad RBAC mínima por vista (guardas de AppShell; el servidor re-valida). */
export const VIEW_PERMISSIONS: Record<string, string> = {
  dashboard: 'clients.read',
  clients: 'clients.read',
  'client-detail': 'clients.read',
  opportunities: 'opportunities.read',
  calendar: 'reservations.read',
  products: 'services.read',
  quotes: 'quotes.read',
  'quote-detail': 'quotes.read',
  whatsapp: 'whatsapp.read',
  inbox: 'whatsapp.read',
  automations: 'automations.read',
  finances: 'transactions.read',
  reports: 'reports.read',
  team: 'team.manage',
  activity: 'activity.read',
  settings: 'settings.read',
  // Plano de control multi-organización: solo el rol de plataforma superadmin
  // tiene 'platform.read' (ver ROLE_PERMISSIONS en rbac.ts).
  super: 'platform.read',
}

/** Construye la URL canónica de una vista (con sus ids de detalle si aplica). */
export function pathForView(
  view: string,
  ids: { clientId?: string | null; quoteId?: string | null } = {}
): string {
  if (view === 'landing') return '/'
  if (view === 'client-detail') {
    return ids.clientId ? `/clients/${encodeURIComponent(ids.clientId)}` : '/clients'
  }
  if (view === 'quote-detail') {
    return ids.quoteId ? `/quotes/${encodeURIComponent(ids.quoteId)}` : '/quotes'
  }
  return STATIC_VIEW_PATH[view] ?? '/dashboard'
}

/** Interpreta un pathname a vista (+ ids de detalle). Desconocido → dashboard. */
export function viewFromPath(pathname: string): ViewState {
  const path = (pathname || '/').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/'
  if (path === '/') return { view: 'landing' }

  const clientMatch = path.match(/^\/clients\/([^/]+)$/)
  if (clientMatch) return { view: 'client-detail', clientId: decodeURIComponent(clientMatch[1]) }

  const quoteMatch = path.match(/^\/quotes\/([^/]+)$/)
  if (quoteMatch) return { view: 'quote-detail', quoteId: decodeURIComponent(quoteMatch[1]) }

  const view = PATH_TO_VIEW[path]
  return { view: view ?? 'dashboard' }
}
