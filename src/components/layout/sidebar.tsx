'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { can } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { MENU_GROUPS } from '@/lib/views'
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  Calendar,
  FileText,
  Zap,
  MessageSquare,
  DollarSign,
  Package,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
  BarChart3,
  MessageCircle,
  Inbox,
  Shield,
  ShieldCheck,
  Clock,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { EcosystemDialog } from './ecosystem-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { motion, AnimatePresence } from 'framer-motion'

// U1 menú 5+1: los ítems y sus permisos viven en src/lib/views.ts (MENU_GROUPS).
// Icono por id de vista (los permisos y el orden se testean en nav-51.test.ts).
const ICON_BY_VIEW: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  clients: Users,
  calendar: Calendar,
  activity: Clock,
  inbox: Inbox,
  opportunities: TrendingUp,
  products: Package,
  quotes: FileText,
  finances: DollarSign,
  reports: BarChart3,
  automations: Zap,
  settings: Settings,
  team: Shield,
  super: ShieldCheck,
  whatsapp: MessageCircle,
}

export function Sidebar() {
  const { view, setView, user, sidebarCollapsed, toggleSidebar, logout } = useAppStore()
  // (ecosistema 2026-11-17) acceso directo a la capa 2A y 2B desde el CRM
  const [ecoOpen, setEcoOpen] = useState(false)

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? 'U'

  return (
    <aside
      className="h-full bg-slate-900 text-white flex flex-col overflow-hidden"
      style={{ width: sidebarCollapsed ? 60 : 220 }}
    >
      {/* Logo */}
      <div className="flex items-center h-12 px-3 border-b border-slate-700/50 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/25">
            <span className="text-white font-bold text-xs">A</span>
          </div>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="font-bold text-base tracking-tight whitespace-nowrap overflow-hidden"
              >
                <span className="text-white">CRM </span>
                <span className="text-emerald-400">ALBRA</span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation — U1: menú único 5+1 agrupado por dominio */}
      <nav className="flex-1 py-2 px-1.5 space-y-1 overflow-y-auto">
        {MENU_GROUPS.map((group) => {
          const items = group.items.filter((item) => can(user?.role, item.perm))
          if (items.length === 0) return null
          return (
            <div key={group.title}>
              {!sidebarCollapsed && (
                <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 select-none">
                  {group.title}
                </p>
              )}
              {sidebarCollapsed && group.title !== 'Hoy' && <div className="mx-2 my-1 border-t border-slate-700/40" />}
              {items.map((item) => {
                const isActive = view === item.id

                const navButton = (
                  <button
                    onClick={() => setView(item.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-150 relative group',
                      isActive
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    )}
                  >
                    {/* Active left border accent */}
                    {isActive && (
                      <motion.div
                        layoutId="activeNavBorder"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-emerald-300 rounded-r-full"
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      />
                    )}
                    {(() => {
                      const Icon = ICON_BY_VIEW[item.id] ?? LayoutDashboard
                      return <Icon className="w-4 h-4 flex-shrink-0" />
                    })()}
                    <AnimatePresence>
                      {!sidebarCollapsed && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          transition={{ duration: 0.15 }}
                          className="text-[13px] font-medium whitespace-nowrap overflow-hidden"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                )

                if (sidebarCollapsed) {
                  return (
                    <Tooltip key={item.id}>
                      <TooltipTrigger asChild>
                        {navButton}
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8}>
                        {group.title} · {item.label}
                      </TooltipContent>
                    </Tooltip>
                  )
                }

                return <div key={item.id}>{navButton}</div>
              })}
            </div>
          )
        })}
      </nav>

      {/* Acceso directo al ecosistema (capa 2A y 2B) */}
      <div className="px-1.5 pb-1.5 flex-shrink-0 border-t border-slate-700/50 pt-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEcoOpen(true)}
          className="w-full justify-start px-2.5 h-9 text-slate-300 hover:text-white hover:bg-slate-800"
        >
          <Layers className="w-4 h-4 flex-shrink-0 text-emerald-400" />
          {!sidebarCollapsed && <span className="ml-2 text-[13px] font-medium">Ecosistema</span>}
        </Button>
      </div>

      {/* Collapse Toggle */}
      <div className="px-1.5 pb-1.5 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="w-full justify-center text-slate-400 hover:text-white hover:bg-slate-800 h-7 text-[11px]"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="ml-2 text-xs">Colapsar</span>
            </>
          )}
        </Button>
      </div>

      {/* User Section */}
      <div className="border-t border-slate-700/50 p-2 flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">
              <Avatar className="w-7 h-7 flex-shrink-0">
                <AvatarFallback className="bg-emerald-600 text-white text-[10px] font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <AnimatePresence>
                {!sidebarCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="text-left min-w-0 overflow-hidden"
                  >
                    <p className="text-[12px] font-medium text-white truncate">{user?.name ?? 'Usuario'}</p>
                    <p className="text-[10px] text-slate-400 truncate">{user?.email ?? ''}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem className="text-sm text-slate-500" disabled>
              {user?.email ?? ''}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-600 cursor-pointer">
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar Sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Ecosystem dialog (acceso directo a 2A/2B) */}
      <EcosystemDialog open={ecoOpen} onOpenChange={setEcoOpen} />
    </aside>
  )
}
export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { view, setView, user, logout } = useAppStore()
  const [ecoOpen, setEcoOpen] = useState(false)

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? 'U'

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 left-0 z-50 w-[280px] bg-slate-900 text-white flex flex-col shadow-2xl"
          >
            {/* Mobile header */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/25">
                  <span className="text-white font-bold text-sm">A</span>
                </div>
                <span className="font-bold text-lg tracking-tight">
                  <span className="text-white">CRM </span>
                  <span className="text-emerald-400">ALBRA</span>
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-slate-400 hover:text-white hover:bg-slate-800 h-8 w-8"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Navigation — U1: mismos grupos que el sidebar de escritorio */}
            <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
              {MENU_GROUPS.map((group) => {
                const items = group.items.filter((item) => can(user?.role, item.perm))
                if (items.length === 0) return null
                return (
                  <div key={group.title}>
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 select-none">
                      {group.title}
                    </p>
                    {items.map((item) => {
                      const isActive = view === item.id
                      const Icon = ICON_BY_VIEW[item.id] ?? LayoutDashboard
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setView(item.id)
                            onClose()
                          }}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 relative',
                            isActive
                              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                          )}
                        >
                          {isActive && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-emerald-300 rounded-r-full" />
                          )}
                          <Icon className="w-5 h-5 flex-shrink-0" />
                          <span className="text-sm font-medium">{item.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </nav>

            {/* Acceso directo al ecosistema (capa 2A y 2B) */}
            <div className="px-3 pb-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEcoOpen(true)}
                className="w-full justify-start border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-800 hover:text-white h-10"
              >
                <Layers className="w-4 h-4 text-emerald-400" />
                <span className="ml-2 text-sm font-medium">Ecosistema</span>
              </Button>
            </div>

            {/* User Section */}
            <div className="border-t border-slate-700/50 p-4">
              <div className="flex items-center gap-3">
                <Avatar className="w-9 h-9 flex-shrink-0">
                  <AvatarFallback className="bg-emerald-600 text-white text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{user?.name ?? 'Usuario'}</p>
                  <p className="text-xs text-slate-400 truncate">{user?.email ?? ''}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    logout()
                    onClose()
                  }}
                  className="text-slate-400 hover:text-red-400 hover:bg-slate-800 h-8 w-8"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <EcosystemDialog open={ecoOpen} onOpenChange={setEcoOpen} />
    </>
  )
}
