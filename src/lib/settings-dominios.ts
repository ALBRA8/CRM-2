/**
 * (U4) settings-dominios.ts — agrupación de Ajustes por dominio.
 *
 * Problema: 16 tabs planos en una sola pantalla; encontrar un ajuste es
 * lento y cada cambio es arriesgado.
 *
 * Solución (plan F4-T04): 4 dominios con navegación de máx. 2 niveles:
 *   Negocio · Canales · Inteligencia · Seguridad y equipo
 *
 * Contrato:
 *  - CERO tabs huérfanos: los 16 tabs existentes quedan, cada uno en
 *    exactamente UN dominio, con sus ids intactos (los deep-links
 *    ?tab=conexiones, ?tab=google, ?tab=instagram, ?tab=facebook,
 *    ?tab=telegram, ?tab=llm y el retorno del OAuth de Meta siguen
 *    funcionando sin cambios).
 *  - `envios` (conciliación de envíos UNCERTAIN) es solo para admin.
 */

export type SettingsDomainId = 'negocio' | 'canales' | 'inteligencia' | 'seguridad'

export interface SettingsTabDef {
  /** Valor del tab (sin cambios; los deep-links externos dependen de él). */
  id: string
  label: string
  domain: SettingsDomainId
  /** Visible solo para owner/admin (igual que antes del reagrupado). */
  adminOnly?: boolean
}

export interface SettingsDomainDef {
  id: SettingsDomainId
  label: string
  description: string
}

export const SETTINGS_DOMAINS: SettingsDomainDef[] = [
  { id: 'negocio', label: 'Negocio', description: 'Empresa, plantillas y campos propios del CRM' },
  { id: 'canales', label: 'Canales', description: 'WhatsApp y el resto de canales de mensajería' },
  { id: 'inteligencia', label: 'Inteligencia', description: 'Agente IA y conciliación de envíos' },
  { id: 'seguridad', label: 'Seguridad y equipo', description: 'Accesos, respaldo y 2FA' },
]

/** Los 16 tabs actuales, cada uno en un único dominio. */
export const SETTINGS_TABS: SettingsTabDef[] = [
  // Negocio
  { id: 'negocio', label: 'Negocio', domain: 'negocio' },
  { id: 'plantillas', label: 'Plantillas', domain: 'negocio' },
  { id: 'custom-fields', label: 'Campos Custom', domain: 'negocio' },
  // Canales
  { id: 'whatsapp', label: 'WhatsApp', domain: 'canales' },
  { id: 'conexiones', label: 'Números WA', domain: 'canales' },
  { id: 'instagram', label: 'Instagram', domain: 'canales' },
  { id: 'tiktok', label: 'TikTok', domain: 'canales' },
  { id: 'telegram', label: 'Telegram', domain: 'canales' },
  { id: 'facebook', label: 'Messenger', domain: 'canales' },
  { id: 'email', label: 'Email SMTP', domain: 'canales' },
  { id: 'google', label: 'Google', domain: 'canales' },
  // Inteligencia
  { id: 'llm', label: 'IA del CRM', domain: 'inteligencia' },
  { id: 'envios', label: 'Envíos', domain: 'inteligencia', adminOnly: true },
  // Seguridad y equipo
  { id: 'seguridad', label: 'Seguridad', domain: 'seguridad' },
  { id: 'team', label: 'Equipo', domain: 'seguridad' },
  { id: 'backup', label: 'Respaldo', domain: 'seguridad' },
]

/** Dominio de un tab; null si el id no existe (deep-link malformado). */
export function domainOfTab(tabId: string): SettingsDomainId | null {
  return SETTINGS_TABS.find((t) => t.id === tabId)?.domain ?? null
}

/** Tabs visibles de un dominio; si el usuario no es admin, sin los adminOnly. */
export function tabsOfDomain(
  domain: SettingsDomainId,
  isAdmin = false,
): SettingsTabDef[] {
  return SETTINGS_TABS.filter((t) => t.domain === domain && (isAdmin || !t.adminOnly))
}

/**
 * Dominio a partir de un tab inicial (?tab=). Si el tab no existe o el
 * usuario no puede verlo, cae al primer dominio (Negocio), fail-closed.
 */
export function resolveInitialDomain(tabId: string, isAdmin = false): SettingsDomainId {
  const d = domainOfTab(tabId)
  if (d) {
    // Si el tab es admin-only y el usuario no lo es, no se abre ahí.
    const t = SETTINGS_TABS.find((x) => x.id === tabId)!
    if (!t.adminOnly || isAdmin) return d
  }
  return SETTINGS_DOMAINS[0].id
}

/** Primer tab visible de un dominio (para cambiar de dominio con 1 clic). */
export function firstTabOfDomain(domain: SettingsDomainId, isAdmin = false): string {
  return tabsOfDomain(domain, isAdmin)[0]?.id ?? 'negocio'
}
