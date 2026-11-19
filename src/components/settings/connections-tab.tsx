'use client'

/**
 * connections-tab.tsx — (F2) UI de conexiones WhatsApp multi-número.
 *
 * Pantalla "Ajustes → Canales → Números WhatsApp": el propietario de cada
 * organización conecta, verifica, desconecta y audita sus números SIN tocar
 * la API. Consume exclusivamente las rutas ya probadas en integración:
 *  - GET/POST  /api/whatsapp/connections
 *  - GET/DELETE /api/whatsapp/connections/[id]
 *  - POST      /api/whatsapp/connections/[id]/verify
 *  - GET/POST  /api/whatsapp/embedded-signup
 *  - proxy daemon (QR Baileys por organización, veredicto P0.1)
 *
 * Reglas de seguridad heredadas:
 *  - La AUTORIDAD es el servidor (requireAuth + isAdmin + plan). Aquí solo se
 *    OCULTAN acciones a no-admin: un usuario avanzado no gana nada porque la
 *    API rechaza igual.
 *  - La desconexión pide CONFIRMACIÓN DOBLE (máquina de estados en
 *    src/lib/wa-connections-ui.ts, probada en unit).
 *  - El token de acceso se pega UNA VEZ en el alta manual y se envía por
 *    HTTPS al servidor, que lo cifra (AES-256-GCM); jamás se vuelve a pedir
 *    ni se muestra en claro.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CheckCircle,
  XCircle,
  Loader2,
  Smartphone,
  QrCode,
  RefreshCw,
  Plus,
  Cloud,
  Unplug,
  History,
  ShieldAlert,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  connectionEventUi,
  connectionUiState,
  daemonSessionBadge,
  disconnectButtonLabel,
  disconnectConfirmReducer,
  maskPhone,
  planQuotaSummary,
  shortDate,
  sourceLabel,
  tokenExpiryWarning,
  waStatusMeta,
  type WaConnectionEventView,
  type WaConnectionView,
  type WaPlanView,
  type DisconnectConfirmState,
} from '@/lib/wa-connections-ui'
import { mapStatusToVerdict } from '@/lib/whatsapp-session-verdict'

// ---------- Vista de la sesión QR del daemon (subset del payload /status) ----------

interface DaemonSessionView {
  orgId?: string
  status?: string
  phone?: string | null
  lastUpdate?: string | null
  lastError?: string | null
}

interface DaemonStatusView {
  status?: string
  phone?: string | null
  lastUpdate?: string | null
  lastError?: string | null
  orgLinked?: boolean
  linkedOrgId?: string | null
  sessions?: DaemonSessionView[]
}

interface DaemonQrView {
  status?: string
  qr?: string | null
  qrText?: string | null
  ttlSeconds?: number
}

const TONE_CLASSES: Record<string, string> = {
  success: 'border-emerald-200 text-emerald-700 bg-emerald-50',
  warning: 'border-amber-200 text-amber-700 bg-amber-50',
  neutral: 'border-slate-200 text-slate-600 bg-slate-50',
  destructive: 'border-rose-200 text-rose-700 bg-rose-50',
}

function StatusBadge({ tone, label }: { tone: string; label: string }) {
  return (
    <Badge variant="outline" className={TONE_CLASSES[tone] ?? TONE_CLASSES.neutral}>
      {label}
    </Badge>
  )
}

export function ConnectionsTab() {
  const isAdmin = useAppStore((s) => s.isAdmin)

  // ---- Estado de datos ----
  const [loading, setLoading] = useState(true)
  const [connections, setConnections] = useState<WaConnectionView[]>([])
  const [plan, setPlan] = useState<WaPlanView>({ maxConnections: 1, activeConnections: 0 })

  // ---- Alta manual ----
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({ phoneNumberId: '', accessToken: '', displayName: '', wabaId: '', phoneNumber: '' })
  const [adding, setAdding] = useState(false)

  // ---- Acciones por conexión ----
  const [busyId, setBusyId] = useState<string | null>(null)
  const [disconnectState, setDisconnectState] = useState<DisconnectConfirmState>({ phase: 'idle' })

  // ---- Detalle + eventos ----
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailEvents, setDetailEvents] = useState<WaConnectionEventView[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  // ---- Sesión QR del daemon (Baileys por organización) ----
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatusView | null>(null)
  const [daemonQr, setDaemonQr] = useState<DaemonQrView | null>(null)
  const [qrLoading, setQrLoading] = useState(false)

  // ---- Embedded Signup ----
  const [esLoading, setEsLoading] = useState(false)

  const quota = useMemo(() => planQuotaSummary(plan), [plan])

  const loadConnections = useCallback(async () => {
    try {
      const data = (await api.getWaConnections()) as { connections: WaConnectionView[]; plan: WaPlanView }
      setConnections(data.connections ?? [])
      setPlan(data.plan ?? { maxConnections: 1, activeConnections: 0 })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar conexiones')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDaemonStatus = useCallback(async () => {
    try {
      const data = (await api.getWhatsAppStatus()) as DaemonStatusView
      setDaemonStatus(data)
    } catch {
      // El daemon puede estar apagado: la sección QR informa estado desconocido.
      setDaemonStatus(null)
    }
  }, [])

  const loadDaemonQr = useCallback(async () => {
    setQrLoading(true)
    try {
      const data = (await api.getWhatsAppQr()) as DaemonQrView
      setDaemonQr(data)
    } catch {
      setDaemonQr(null)
    } finally {
      setQrLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConnections()
    void loadDaemonStatus()
  }, [loadConnections, loadDaemonStatus])

  // La sesión QR del daemon multi-org para ESTA organización se resuelve con
  // el veredicto P0.1 (mismo módulo probado del gate fail-closed). El
  // veredicto UNKNOWN (daemon apagado/respuesta ambigua) se muestra sin
  // detalles sensibles.
  const myVerdict = useMemo(() => {
    if (!daemonStatus) return 'UNKNOWN' as const
    const orgId = useAppStore.getState().user?.id ?? '__unknown__'
    return mapStatusToVerdict(daemonStatus, orgId)
  }, [daemonStatus])

  const qrBadge = daemonSessionBadge(myVerdict, daemonStatus ?? undefined)

  // ---- Acciones ----

  const handleAdd = async () => {
    if (!form.phoneNumberId.trim() || !form.accessToken.trim()) {
      toast.error('phoneNumberId y accessToken son obligatorios')
      return
    }
    setAdding(true)
    try {
      const res = (await api.addWaConnection({
        phoneNumberId: form.phoneNumberId.trim(),
        accessToken: form.accessToken.trim(),
        displayName: form.displayName.trim() || undefined,
        wabaId: form.wabaId.trim() || undefined,
        phoneNumber: form.phoneNumber.trim() || undefined,
      })) as { ok?: boolean; connectionId?: string; status?: string }
      toast.success(`Número registrado (estado: ${res.status ?? 'pending'})`)
      setForm({ phoneNumberId: '', accessToken: '', displayName: '', wabaId: '', phoneNumber: '' })
      setShowAddForm(false)
      await loadConnections()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo conectar el número')
    } finally {
      setAdding(false)
    }
  }

  const handleVerify = async (id: string) => {
    setBusyId(id)
    try {
      await api.verifyWaConnection(id)
      toast.success('Token verificado contra Meta')
      await loadConnections()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verificación falló')
      await loadConnections()
    } finally {
      setBusyId(null)
    }
  }

  const handleDisconnect = async (id: string) => {
    // Confirmación doble (máquina pura probada en unit):
    //  1ª pulsación → ARM (el botón pasa a “¿Confirmar desconexión?”)
    //  2ª pulsación → CONFIRM (solo si es la misma conexión) → working → API
    const next = disconnectConfirmReducer(disconnectState, { type: 'CONFIRM', connectionId: id })
    if (next.phase !== 'working') {
      setDisconnectState(disconnectConfirmReducer(disconnectState, { type: 'ARM', connectionId: id }))
      return
    }
    setDisconnectState(next)
    setBusyId(id)
    try {
      await api.disconnectWaConnection(id)
      toast.success('Número desconectado: el token fue destruido')
      await loadConnections()
      await loadDaemonStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo desconectar')
    } finally {
      setBusyId(null)
      setDisconnectState({ phase: 'idle' })
    }
  }

  // Auto-cancela la confirmación armada tras 6 s (evita quedarse “¿Seguro?”
  // abierto para siempre y reduce desconexiones por click distraído).
  useEffect(() => {
    if (disconnectState.phase !== 'armed') return
    const t = setTimeout(() => setDisconnectState({ phase: 'idle' }), 6000)
    return () => clearTimeout(t)
  }, [disconnectState])

  const openDetail = async (id: string) => {
    setDetailId(id)
    setDetailLoading(true)
    setDetailEvents([])
    try {
      const data = (await api.getWaConnection(id)) as { events?: WaConnectionEventView[] }
      setDetailEvents(data.events ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cargar el detalle')
      setDetailId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleConnectQr = async () => {
    try {
      await api.connectWhatsApp()
      toast.info('Daemon generando QR…')
      await loadDaemonStatus()
      await loadDaemonQr()
    } catch {
      toast.error('No se pudo iniciar la sesión QR')
    }
  }

  const handleDisconnectQr = async () => {
    try {
      await api.disconnectWhatsApp()
      toast.success('Sesión QR cerrada')
      setDaemonQr(null)
      await loadDaemonStatus()
    } catch {
      toast.error('No se pudo cerrar la sesión QR')
    }
  }

  const handleEmbeddedSignup = async () => {
    setEsLoading(true)
    try {
      const cfg = (await api.getEmbeddedSignupConfig()) as {
        appId: string
        configId?: string
        graphVersion?: string
        state: string
      }
      const FB = (window as unknown as { FB?: { login: (cb: (r: { authResponse?: { code?: string } }) => void, opts: Record<string, unknown>) => void } }).FB
      if (FB?.login) {
        FB.login(async (response) => {
          const code = response?.authResponse?.code
          if (!code) { toast.error('Embedded Signup cancelado en Meta'); setEsLoading(false); return }
          const phoneId = window.prompt('phoneNumberId devuelto por Meta (obligatorio para registrar el número):')
          if (!phoneId) { setEsLoading(false); return }
          try {
            await api.completeEmbeddedSignup({ code, state: cfg.state, phoneNumberId: phoneId })
            toast.success('Número conectado vía Embedded Signup')
            await loadConnections()
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Canje de código falló')
          } finally {
            setEsLoading(false)
          }
        }, { config_id: cfg.configId, response_type: 'code', override_default_response_type: true, extras: { setup: {} } })
      } else {
        toast.info('SDK de Meta no cargado: carga https://connect.facebook.net/es_LA/sdk.js para el flujo oficial')
        setEsLoading(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Embedded Signup no disponible')
      setEsLoading(false)
    }
  }

  // ---------- Render ----------

  return (
    <div className="space-y-6 mt-4">
      {/* Cupo del plan */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                <Cloud className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Números de WhatsApp de la organización</CardTitle>
                <CardDescription>
                  Conexiones Cloud API y sesión QR (Baileys) — cada organización ve solo sus números.
                </CardDescription>
              </div>
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleEmbeddedSignup} disabled={esLoading || !quota.canAdd}>
                  {esLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                  Embedded Signup
                </Button>
                <Button size="sm" onClick={() => setShowAddForm((v) => !v)} disabled={!quota.canAdd}>
                  <Plus className="w-4 h-4" /> Conectar número
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${quota.canAdd ? 'bg-emerald-500' : 'bg-rose-500'}`}
                style={{ width: `${Math.round(quota.ratio * 100)}%` }}
              />
            </div>
            <span className={`text-xs font-medium ${quota.canAdd ? 'text-slate-500' : 'text-rose-600'}`}>
              {quota.message}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Alta manual (admin + cupo disponible) */}
      {isAdmin && showAddForm && (
        <Card className="border border-emerald-100 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Conectar número Cloud API manualmente</CardTitle>
            <CardDescription>
              Pega el phoneNumberId y el accessToken de tu cuenta Meta Business. El token se cifra en el
              servidor y jamás se vuelve a mostrar.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="wa-phone-number-id">phoneNumberId *</Label>
              <Input
                id="wa-phone-number-id"
                value={form.phoneNumberId}
                onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
                placeholder="p. ej. 123456789012345"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-access-token">accessToken *</Label>
              <Input
                id="wa-access-token"
                type="password"
                value={form.accessToken}
                onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
                placeholder="Token de acceso de Meta (se cifra server-side)"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-display-name">Nombre comercial</Label>
              <Input
                id="wa-display-name"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="p. ej. ALBRA Ventas"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-phone">Número (opcional)</Label>
              <Input
                id="wa-phone"
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                placeholder="+573001234567"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-waba-id">WABA ID (opcional)</Label>
              <Input
                id="wa-waba-id"
                value={form.wabaId}
                onChange={(e) => setForm({ ...form, wabaId: e.target.value })}
                placeholder="ID de WhatsApp Business Account"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleAdd} disabled={adding}>
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Registrar número
              </Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de conexiones */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Números registrados</CardTitle>
          <CardDescription>Estado real de sesión y token por número.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : connections.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No hay números registrados todavía. {isAdmin ? 'Usa “Conectar número” o Embedded Signup.' : 'Pide a un administrador que conecte el primer número.'}
            </div>
          ) : (
            connections.map((c) => {
              const meta = waStatusMeta(c.status)
              const actions = connectionUiState(c, isAdmin)
              const confirmLabel = disconnectButtonLabel(disconnectState, c.id)
              const expiry = tokenExpiryWarning(c.tokenExpiresAt)
              return (
                <div key={c.id} className="rounded-xl border border-slate-100 bg-white p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-900">
                          {c.displayName || maskPhone(c.phoneNumber)}
                        </span>
                        <StatusBadge tone={meta.tone} label={meta.label} />
                        <Badge variant="outline" className="text-[10px] text-slate-400">
                          {sourceLabel(c.source)}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {meta.description}{c.statusDetail ? ` — ${c.statusDetail}` : ''}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Tel: {maskPhone(c.phoneNumber)} · phoneNumberId: {c.phoneNumberId} · Verificado: {shortDate(c.lastVerifiedAt)}
                      </p>
                      {expiry && (
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {expiry}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {actions.canVerify && (
                        <Button size="sm" variant="outline" onClick={() => handleVerify(c.id)} disabled={busyId === c.id}>
                          {busyId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Verificar
                        </Button>
                      )}
                      {actions.canDisconnect && (
                        <Button
                          size="sm"
                          variant={disconnectState.phase === 'armed' && disconnectState.connectionId === c.id ? 'destructive' : 'outline'}
                          onClick={() => handleDisconnect(c.id)}
                          disabled={busyId === c.id || disconnectState.phase === 'working'}
                        >
                          {disconnectState.phase === 'working' && disconnectState.connectionId === c.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Unplug className="w-3.5 h-3.5" />}
                          {confirmLabel}
                        </Button>
                      )}
                      {actions.canViewEvents && (
                        <Button size="sm" variant="ghost" onClick={() => openDetail(c.id)}>
                          <History className="w-3.5 h-3.5" /> Eventos
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Sesión QR del daemon (Baileys por organización) */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-50 rounded-lg flex items-center justify-center">
              <QrCode className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <CardTitle className="text-base">Sesión QR (número compartido vía daemon)</CardTitle>
              <CardDescription>Conexión alternativa por QR con el daemon multi-organización.</CardDescription>
            </div>
            <div className="ml-auto">
              <StatusBadge tone={qrBadge.tone} label={qrBadge.label} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-500">{qrBadge.description}</p>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleConnectQr}>
                <Smartphone className="w-4 h-4" /> Generar QR
              </Button>
              <Button size="sm" variant="outline" onClick={loadDaemonQr} disabled={qrLoading}>
                {qrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refrescar QR
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDisconnectQr}>
                <Unplug className="w-4 h-4" /> Cerrar sesión QR
              </Button>
            </div>
          )}
          {daemonQr?.qr && (
            <div className="flex flex-col items-center gap-2 py-2">
              {/* El daemon entrega el QR como data URL base64 (ver interfaz WaQrData). */}
              <img src={daemonQr.qr} alt="Código QR de WhatsApp" className="w-56 h-56 rounded-lg border border-slate-100" />
              {typeof daemonQr.ttlSeconds === 'number' && (
                <p className="text-xs text-slate-400">El QR se refresca automáticamente cada ~{daemonQr.ttlSeconds}s</p>
              )}
            </div>
          )}
          {daemonStatus?.lastError && (
            <p className="text-xs text-rose-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {daemonStatus.lastError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Detalle + eventos de auditoría */}
      <Dialog open={detailId !== null} onOpenChange={(open) => { if (!open) setDetailId(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Historial de la conexión</DialogTitle>
            <DialogDescription>Últimos 20 eventos de auditoría del número.</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : detailEvents.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">Sin eventos registrados.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {detailEvents.map((ev) => {
                const ui = connectionEventUi(ev.type)
                return (
                  <div key={ev.id} className="flex items-start gap-2 text-sm">
                    <div className="mt-0.5">
                      {ui.tone === 'success' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        : ui.tone === 'destructive' ? <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        : ui.tone === 'warning' ? <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                        : <History className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-800 text-sm font-medium">{ui.label}</p>
                      {ev.detail && <p className="text-xs text-slate-500 break-words">{ev.detail}</p>}
                      <p className="text-[10px] text-slate-400">{shortDate(ev.createdAt)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailId(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
