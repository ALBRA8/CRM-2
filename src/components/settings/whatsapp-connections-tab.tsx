'use client'

/**
 * F3-T02 (F2) — UI de conexiones WhatsApp MULTI-NÚMERO por organización.
 *
 * Pantalla única en Ajustes → WhatsApp que cubre los dos mecanismos de
 * conexión existentes en la base, hoy repartidos entre dos experiencias:
 *
 *  1. Cloud API de Meta (model WhatsAppConnection) — multi-número real:
 *     lista, verificación de token, desconexión con confirmación y eventos.
 *     API: /api/whatsapp/connections (org del JWT; admin para POST/DELETE).
 *  2. Baileys propio (daemon en :3002, sesión POR ORGANIZACIÓN) — conectar
 *     por QR, estado con veredicto de propiedad y desconexión.
 *     API: /api/whatsapp/daemon-proxy (el orgId SIEMPRE viene del JWT).
 *
 * El frontend NUNCA habla al daemon directamente y jamás envía orgId en el
 * body: el proxy lo sobreescribe con el del JWT (fail-closed multi-tenant).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  BadgeCheck, CheckCircle2, ChevronDown, Loader2, Plus, QrCode, RefreshCw,
  ShieldAlert, Smartphone, Unplug, Wifi, WifiOff,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { can } from '@/lib/rbac'
import {
  connectionDisplayName, connectionEventPresentation, connectionStatusPresentation,
  daemonStatusPresentation, formatEventDate, planProgress,
} from '@/lib/wa-connections-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'

const DAEMON_PROXY = '/api/whatsapp/daemon-proxy'

interface CloudConnection {
  id: string
  phoneNumberId: string
  phoneNumber?: string | null
  displayName?: string | null
  status: string
  statusDetail?: string | null
  source?: string | null
  lastVerifiedAt?: string | null
  createdAt?: string
}

interface PlanInfo {
  id: string
  label: string
  maxConnections: number
  activeConnections: number
}

interface ConnectionEventRow {
  id: string
  connectionId: string | null
  type: string
  detail?: string | null
  createdAt: string
  connection?: { phoneNumber?: string | null; displayName?: string | null; phoneNumberId?: string | null } | null
}

interface WaStatus {
  status: string
  phone?: string | null
  lastUpdate?: string | null
  lastError?: string | null
  sessions?: unknown
}

interface WaQrData {
  status: string
  qr: string | null
  qrText?: string | null
  phone?: string | null
  ttlSeconds?: number
}

export function WhatsAppConnectionsTab() {
  const user = useAppStore((s) => s.user)
  const isAdminUser = useAppStore((s) => s.isAdmin)
  // Capacidad de integración (conectar/desconectar); el servidor la revalida.
  const canIntegrate = Boolean(isAdminUser) && can(user?.role ?? 'member', 'integrations.*')

  // ---- Conexiones Cloud API (multi-número) ----
  const [connections, setConnections] = useState<CloudConnection[]>([])
  const [plan, setPlan] = useState<PlanInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ phoneNumberId: '', accessToken: '', phoneNumber: '', displayName: '' })
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null)

  // ---- Eventos ----
  const [events, setEvents] = useState<ConnectionEventRow[]>([])
  const [eventsOpen, setEventsOpen] = useState(false)

  // ---- Sesión Baileys (QR) ----
  const [waStatus, setWaStatus] = useState<WaStatus>({ status: 'disconnected' })
  const [waQr, setWaQr] = useState<WaQrData>({ status: 'disconnected', qr: null })
  const [waLoading, setWaLoading] = useState(false)
  const [waAttempted, setWaAttempted] = useState(false)
  const [waError, setWaError] = useState<string | null>(null)
  const [confirmWaDisconnect, setConfirmWaDisconnect] = useState(false)
  const qrSecondsLeft = useRef(0)
  const [qrTicker, setQrTicker] = useState(0)

  const authHeaders = useCallback((): Record<string, string> => {
    const token = api.getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/connections', { headers: authHeaders() })
      if (!res.ok) throw new Error('load')
      const data = (await res.json()) as { connections?: CloudConnection[]; plan?: PlanInfo }
      setConnections(Array.isArray(data.connections) ? data.connections : [])
      setPlan(data.plan ?? null)
    } catch {
      toast.error('No se pudieron cargar las conexiones WhatsApp')
    } finally {
      setLoading(false)
    }
  }, [authHeaders])

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/connections/events?take=20', { headers: authHeaders() })
      if (!res.ok) throw new Error('load')
      const data = (await res.json()) as { events?: ConnectionEventRow[] }
      setEvents(Array.isArray(data.events) ? data.events : [])
    } catch {
      toast.error('No se pudo cargar el registro de eventos')
    }
  }, [authHeaders])

  const loadWaStatus = useCallback(async () => {
    try {
      const res = await fetch(`${DAEMON_PROXY}?path=/status`, { headers: authHeaders() })
      if (!res.ok) throw new Error('status')
      const data = (await res.json()) as WaStatus
      setWaStatus(data)
      setWaError(data.lastError ?? null)
      if (data.status === 'connected') setWaAttempted(false)
      if (data.status === 'waiting_qr') void loadQr()
    } catch {
      setWaStatus({ status: 'disconnected' })
      setWaError('No se pudo consultar el estado del daemon de WhatsApp')
    }
  }, [authHeaders])

  const loadQr = useCallback(async () => {
    try {
      const res = await fetch(`${DAEMON_PROXY}?path=/qr`, { headers: authHeaders() })
      if (!res.ok) throw new Error('qr')
      const data = (await res.json()) as WaQrData
      setWaQr(data)
      if (typeof data.ttlSeconds === 'number') qrSecondsLeft.current = data.ttlSeconds
      if (data.status === 'connected') {
        setWaStatus((prev) => ({ ...prev, status: 'connected', phone: data.phone ?? prev.phone }))
      } else if (data.status === 'qr_expired') {
        setWaStatus((prev) => ({ ...prev, status: 'qr_expired' }))
      }
    } catch {
      // El daemon puede tardar en generar el QR: el polling reintenta.
    }
  }, [authHeaders])

  useEffect(() => {
    void loadConnections()
    void loadEvents()
    void loadWaStatus()
  }, [loadConnections, loadEvents, loadWaStatus])

  // Polling del QR mientras haya algo que esperar (mismo criterio del tab legacy).
  useEffect(() => {
    const shouldPoll =
      waStatus.status === 'waiting_qr' ||
      waStatus.status === 'connecting' ||
      (waAttempted && waStatus.status !== 'connected' && waStatus.status !== 'qr_expired')
    if (!shouldPoll) return
    const interval = setInterval(() => {
      void loadQr()
      void loadWaStatus()
    }, 3000)
    return () => clearInterval(interval)
  }, [waStatus.status, waAttempted, loadQr, loadWaStatus])

  // Contador visual de vida del QR.
  useEffect(() => {
    if (waStatus.status !== 'waiting_qr') return
    const t = setInterval(() => {
      qrSecondsLeft.current = Math.max(0, qrSecondsLeft.current - 1)
      setQrTicker((n) => n + 1)
    }, 1000)
    return () => clearInterval(t)
  }, [waStatus.status])

  const handleDaemonConnect = async (force: boolean) => {
    setWaLoading(true)
    try {
      const res = await fetch(DAEMON_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ path: '/connect', force }),
      })
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; status?: string }
      if (!res.ok || data.success === false) {
        setWaError(data.error || `No se pudo iniciar la conexión (HTTP ${res.status})`)
        toast.error(data.error || 'No se pudo iniciar la conexión por QR')
        return
      }
      setWaAttempted(true)
      setWaError(null)
      toast.success('Conexión iniciada: escanea el código QR con tu WhatsApp')
      await loadWaStatus()
      void loadQr()
    } catch {
      setWaError('Daemon de WhatsApp no disponible')
      toast.error('Daemon de WhatsApp no disponible')
    } finally {
      setWaLoading(false)
    }
  }

  const handleDaemonDisconnect = async () => {
    setWaLoading(true)
    try {
      const res = await fetch(DAEMON_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ path: '/disconnect' }),
      })
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string }
      if (!res.ok || data.success === false) {
        toast.error(data.error || 'No se pudo desconectar la sesión de WhatsApp')
        return
      }
      setWaAttempted(false)
      setWaQr({ status: 'disconnected', qr: null })
      toast.success('Sesión de WhatsApp desconectada')
      await loadWaStatus()
    } catch {
      toast.error('Daemon de WhatsApp no disponible')
    } finally {
      setWaLoading(false)
    }
  }

  const handleVerify = async (conn: CloudConnection) => {
    setBusyId(conn.id)
    try {
      const res = await fetch(`/api/whatsapp/connections/${conn.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string; error?: string }
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'La verificación del token falló (¿token revocado en Meta?)')
      } else {
        toast.success('Token verificado contra Meta: número operable')
      }
      await loadConnections()
      void loadEvents()
    } catch {
      toast.error('No se pudo verificar la conexión')
    } finally {
      setBusyId(null)
    }
  }

  const handleDisconnect = async () => {
    if (!confirmDelete) return
    setBusyId(confirmDelete.id)
    try {
      const res = await fetch(`/api/whatsapp/connections/${confirmDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ revoked: false }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'No se pudo desconectar el número')
        return
      }
      toast.success(`Número ${confirmDelete.label} desconectado`)
      await loadConnections()
      void loadEvents()
    } catch {
      toast.error('No se pudo desconectar el número')
    } finally {
      setBusyId(null)
      setConfirmDelete(null)
    }
  }

  const handleAdd = async () => {
    if (!addForm.phoneNumberId.trim() || !addForm.accessToken.trim()) {
      toast.error('El ID de número de teléfono y el token de acceso son obligatorios')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/whatsapp/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          phoneNumberId: addForm.phoneNumberId.trim(),
          accessToken: addForm.accessToken.trim(),
          phoneNumber: addForm.phoneNumber.trim() || undefined,
          displayName: addForm.displayName.trim() || undefined,
          source: 'manual',
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string }
      if (!res.ok) {
        toast.error(data.message || data.error || `No se pudo añadir el número (HTTP ${res.status})`)
        return
      }
      toast.success('Número añadido y verificado')
      setAddForm({ phoneNumberId: '', accessToken: '', phoneNumber: '', displayName: '' })
      setShowAddForm(false)
      await loadConnections()
      void loadEvents()
    } catch {
      toast.error('No se pudo añadir el número')
    } finally {
      setAdding(false)
    }
  }

  const progress = planProgress(plan?.activeConnections ?? connections.filter((c) => c.status === 'connected' || c.status === 'pending').length, plan?.maxConnections ?? null)
  const waPres = daemonStatusPresentation(waStatus.status)
  const isWaConnected = waStatus.status === 'connected'
  const isWaWaitingQr = waStatus.status === 'waiting_qr' || waStatus.status === 'qr_expired'
  const isWaConnecting = waStatus.status === 'connecting'
  const qrAlive = qrTicker >= 0 && qrSecondsLeft.current > 0

  return (
    <div className="space-y-6">
      {/* ================= Plan de conexiones ================= */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Números de WhatsApp de la organización</CardTitle>
              <CardDescription>
                Conecta varios números por Cloud API de Meta o por QR (Baileys propio). Cada número aparece una sola vez.
              </CardDescription>
            </div>
            <Badge variant="outline" className="shrink-0 border-slate-200 text-slate-600">
              Plan: {plan?.label ?? '—'}
            </Badge>
          </div>
          {plan && (
            <div className="mt-2 space-y-1">
              <Progress value={progress.percent} className="h-2" />
              <p className="text-xs text-slate-500">
                {progress.label}
                {progress.atLimit ? ' — alcanzaste el tope de tu plan; actualiza para añadir más números' : ''}
              </p>
            </div>
          )}
        </CardHeader>
      </Card>

      {/* ================= Cloud API (multi-número) ================= */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-base">Cloud API de Meta</CardTitle>
                <CardDescription>Números oficiales con token de Meta (multi-número, plantillas y ventanas 24 h)</CardDescription>
              </div>
            </div>
            {canIntegrate && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAddForm((v) => !v)}>
                {showAddForm ? <ChevronDown className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {showAddForm ? 'Cerrar' : 'Añadir número'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAddForm && canIntegrate && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wa-phone-number-id">ID del número de teléfono (Meta)</Label>
                  <Input
                    id="wa-phone-number-id"
                    value={addForm.phoneNumberId}
                    onChange={(e) => setAddForm((f) => ({ ...f, phoneNumberId: e.target.value }))}
                    placeholder="p. ej. 1234567890"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-access-token">Token de acceso (Meta)</Label>
                  <Input
                    id="wa-access-token"
                    type="password"
                    value={addForm.accessToken}
                    onChange={(e) => setAddForm((f) => ({ ...f, accessToken: e.target.value }))}
                    placeholder="Token con permiso whatsapp_business_messaging"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-phone">Teléfono (E.164, opcional)</Label>
                  <Input
                    id="wa-phone"
                    value={addForm.phoneNumber}
                    onChange={(e) => setAddForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                    placeholder="+573001234567"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-display-name">Nombre visible (opcional)</Label>
                  <Input
                    id="wa-display-name"
                    value={addForm.displayName}
                    onChange={(e) => setAddForm((f) => ({ ...f, displayName: e.target.value }))}
                    placeholder="p. ej. Ventas Bogotá"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)} disabled={adding}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleAdd} disabled={adding} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
                  Guardar y verificar
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 py-6 justify-center text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando conexiones…
            </div>
          ) : connections.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <Smartphone className="w-8 h-8 text-slate-300" />
              </div>
              <h4 className="text-sm font-semibold text-slate-700 mb-1">No hay números vía Cloud API</h4>
              <p className="text-sm text-slate-400 max-w-md mx-auto mb-3">
                {canIntegrate
                  ? 'Añade un número de la Cloud API de Meta, o usa la conexión por QR más abajo para empezar sin API.'
                  : 'Un administrador puede añadir números de la Cloud API de Meta desde esta pantalla.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {connections.map((c) => {
                const pres = connectionStatusPresentation(c.status)
                return (
                  <li key={c.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        {pres.active ? <Wifi className="w-5 h-5 text-emerald-600" /> : <WifiOff className="w-5 h-5 text-slate-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm text-slate-900 truncate">{connectionDisplayName(c)}</p>
                          <Badge variant="outline" className={`gap-1.5 ${pres.badgeClass}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${pres.dotClass}`} />
                            {pres.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Fuente: {c.source === 'manual' ? 'Alta manual' : c.source === 'embedded_signup' ? 'Registro embebido de Meta' : c.source || '—'}
                          {c.lastVerifiedAt ? ` · Última verificación: ${formatEventDate(c.lastVerifiedAt)}` : ''}
                        </p>
                        {c.statusDetail && <p className="text-xs text-amber-600 mt-1">{c.statusDetail}</p>}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => handleVerify(c)}
                          disabled={busyId === c.id}
                        >
                          {busyId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />}
                          Verificar
                        </Button>
                        {canIntegrate && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                            onClick={() => setConfirmDelete({ id: c.id, label: connectionDisplayName(c) })}
                            disabled={busyId === c.id}
                          >
                            <Unplug className="w-3.5 h-3.5" />
                            Desconectar
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ================= Baileys por QR ================= */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
              <QrCode className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-base">WhatsApp por QR (Baileys propio)</CardTitle>
              <CardDescription>Sesión dedicada de esta organización; sin API de Meta. La propiedad de la sesión se verifica en el servidor (fail-closed).</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isWaConnected ? 'bg-emerald-100' : 'bg-slate-100'}`}>
              {isWaConnected ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <WifiOff className="w-5 h-5 text-slate-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`gap-1.5 ${waPres.badgeClass}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${waPres.dotClass}`} />
                  {waPres.label}
                </Badge>
                {waStatus.phone && <span className="text-sm text-slate-700">{waStatus.phone}</span>}
              </div>
              {waError && <p className="text-xs text-amber-600 mt-1">{waError}</p>}
              {waStatus.lastUpdate && (
                <p className="text-xs text-slate-400 mt-1">Última actualización: {formatEventDate(waStatus.lastUpdate)}</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {!isWaConnected && canIntegrate && (
                <Button size="sm" onClick={() => handleDaemonConnect(true)} disabled={waLoading} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                  {waLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                  Conectar / generar QR
                </Button>
              )}
              {isWaConnected && canIntegrate && (
                <Button size="sm" variant="outline" className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => setConfirmWaDisconnect(true)} disabled={waLoading}>
                  <Unplug className="w-3.5 h-3.5" />
                  Desconectar
                </Button>
              )}
            </div>
          </div>

          {(isWaWaitingQr || isWaConnecting) && (
            <div className="text-center py-4 border border-slate-200 rounded-xl">
              {waQr.qr ? (
                <>
                  <div className="relative inline-block mb-3">
                    <div className={`bg-white p-4 rounded-2xl shadow-lg border border-slate-200 ${qrAlive ? '' : 'opacity-20 blur-[1px]'}`}>
                      <img src={waQr.qr} alt="Código QR de WhatsApp" className="w-56 h-56 select-none pointer-events-none" />
                    </div>
                    {!qrAlive && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/85 rounded-2xl">
                        <RefreshCw className="w-6 h-6 text-amber-600 mb-2" />
                        <p className="text-sm font-semibold text-slate-800">Código QR expirado</p>
                        <Button size="sm" className="mt-2 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleDaemonConnect(true)} disabled={waLoading}>
                          <RefreshCw className={`w-3.5 h-3.5 ${waLoading ? 'animate-spin' : ''}`} />
                          Generar nuevo QR
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 font-medium">
                    {qrAlive ? `Escanea con WhatsApp → Dispositivos vinculados (${qrSecondsLeft.current}s)` : 'Esperando nuevo código…'}
                  </p>
                </>
              ) : (
                <div className="py-4">
                  <Loader2 className="w-7 h-7 animate-spin text-emerald-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Generando código QR…</p>
                </div>
              )}
            </div>
          )}

          <Separator />
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-500">
              Seguridad: la sesión QR pertenece SIEMPRE a esta organización (verificación fail-closed en el servidor).
              Solo un administrador puede conectar o desconectar; las acciones se registran en el historial de eventos.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ================= Registro de eventos ================= */}
      <Card className="border-0 shadow-sm">
        <CardHeader
          className="pb-3 cursor-pointer select-none"
          onClick={() => setEventsOpen((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Registro de eventos de conexión</CardTitle>
              <CardDescription>Últimos 20 eventos de todos los números de la organización</CardDescription>
            </div>
            <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${eventsOpen ? 'rotate-180' : ''}`} />
          </div>
        </CardHeader>
        {eventsOpen && (
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Todavía no hay eventos registrados.</p>
            ) : (
              <ul className="space-y-2.5">
                {events.map((ev) => {
                  const pres = connectionEventPresentation(ev.type)
                  return (
                    <li key={ev.id} className="flex items-start gap-2.5">
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${pres.dotClass}`} />
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800">
                          <span className="font-medium">{pres.label}</span>
                          {ev.connection && (
                            <span className="text-slate-500"> — {connectionDisplayName(ev.connection)}</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatEventDate(ev.createdAt)}
                          {ev.detail ? ` · ${ev.detail}` : ''}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        )}
      </Card>

      {/* ================= Confirmaciones ================= */}
      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar {confirmDelete?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              El número dejará de enviar y recibir mensajes por Cloud API. El token cifrado se destruye y la
              operación queda registrada en los eventos. Puedes volver a conectarlo después con un token válido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={(e) => { e.preventDefault(); void handleDisconnect() }}
              disabled={busyId !== null}
            >
              {busyId ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Sí, desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmWaDisconnect} onOpenChange={setConfirmWaDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar la sesión de WhatsApp por QR?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta organización dejará de recibir y enviar por la sesión Baileys hasta que se conecte de nuevo
              escaneando otro código QR. La operación queda registrada en los eventos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={waLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={(e) => { e.preventDefault(); setConfirmWaDisconnect(false); void handleDaemonDisconnect() }}
              disabled={waLoading}
            >
              {waLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Sí, desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * Fila "WhatsApp" del panel Información del Sistema de Ajustes: estado en
 * vivo de la sesión Baileys de la organización (consulta única al proxy,
 * refresco cada 30 s). Mantenido separado del tab para no montar todo el
 * panel multi-número dentro de la tarjeta de sistema.
 */
export function WhatsAppSystemStatusRow() {
  const [status, setStatus] = useState<string>('disconnected')
  const [phone, setPhone] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const token = api.getToken()
        const res = await fetch(`${DAEMON_PROXY}?path=/status`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
        if (!res.ok) throw new Error('status')
        const data = (await res.json()) as { status?: string; phone?: string | null }
        if (!alive) return
        setStatus(typeof data.status === 'string' ? data.status : 'disconnected')
        setPhone(data.phone ?? null)
      } catch {
        if (alive) setStatus('disconnected')
      }
    }
    void load()
    const t = setInterval(load, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const connected = status === 'connected'
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
        <span className="text-sm text-slate-700">WhatsApp</span>
      </div>
      <Badge variant="outline" className={`text-xs ${connected ? 'border-emerald-200 text-emerald-700' : ''}`}>
        {connected ? `Conectado${phone ? ` (${phone})` : ''}` : 'Desconectado'}
      </Badge>
    </div>
  )
}
