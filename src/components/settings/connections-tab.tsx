'use client'

/**
 * F2 — UI de conexiones WhatsApp multi-número (plan definitivo, fase 3).
 *
 * Pantalla por organización sobre la API ya probada:
 *  - GET  /api/whatsapp/connections        → lista + uso del plan
 *  - POST /api/whatsapp/connections        → conexión manual Cloud API (admin)
 *  - GET  /api/whatsapp/connections/[id]   → detalle + registro de eventos
 *  - DELETE /api/whatsapp/connections/[id] → desconexión (admin, doble confirmación)
 *  - POST /api/whatsapp/connections/[id]/verify → revalida el token contra Meta
 *  - GET/POST /api/whatsapp/embedded-signup → flujo oficial de Meta (si está configurado)
 *
 * La pestaña legacy "whatsapp" (sesión QR única del daemon) queda intacta;
 * esta pestaña añade la capa multi-número (WhatsAppConnection) sin tocarla.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Smartphone, QrCode, RefreshCw, Loader2, Plus, ShieldCheck, Trash2,
  History, AlertTriangle, CheckCircle, WifiOff, ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  connectionStatusBadge, connectionSourceLabel, eventTypeLabel, planUsageText,
  planLimitReached, validateManualForm, canAttemptDisconnect, formatConnectionDate,
  tokenExpiringSoon, parseEmbeddedSignupMessage, embeddedSignupOutcome,
  embeddedSignupSdkUrl, DISCONNECT_CONFIRM_WORD, type ManualFormErrors,
} from '@/lib/wa-connections-ui'

interface WaConnection {
  id: string
  wabaId: string | null
  phoneNumberId: string
  phoneNumber: string
  displayName: string | null
  status: string
  statusDetail: string | null
  source: string
  tokenExpiresAt: string | null
  lastVerifiedAt: string | null
  lastErrorAt: string | null
  createdAt: string
  updatedAt: string
}

interface WaConnectionsResponse {
  connections: WaConnection[]
  plan: { id: string; label: string; maxConnections: number; activeConnections: number }
}

interface WaConnectionDetail extends WaConnection {
  events: { id: string; type: string; detail: string | null; createdAt: string }[]
}

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void
      login: (cb: (r: unknown) => void, opts: Record<string, unknown>) => void
    }
  }
}

export function ConnectionsTab() {
  const isAdmin = useAppStore((s) => s.isAdmin)

  const [data, setData] = useState<WaConnectionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Conexión manual (Cloud API)
  const [showForm, setShowForm] = useState(false)
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [formErrors, setFormErrors] = useState<ManualFormErrors>({})
  const [creating, setCreating] = useState(false)

  // Desconexión (doble confirmación)
  const [pendingDisconnect, setPendingDisconnect] = useState<WaConnection | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [disconnecting, setDisconnecting] = useState(false)

  // Detalle + eventos
  const [detail, setDetail] = useState<WaConnectionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Embedded Signup
  const [esConfig, setEsConfig] = useState<{ appId: string; configId?: string; graphVersion: string; state: string } | null>(null)
  const [esAvailable, setEsAvailable] = useState(false)
  const [esBusy, setEsBusy] = useState(false)
  const esStateRef = useRef<string>('')

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    else setRefreshing(true)
    try {
      const res = (await api.getWaConnections()) as WaConnectionsResponse
      setData(res)
    } catch (err) {
      if (initial) toast.error('No se pudieron cargar las conexiones')
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Embedded Signup: solo si el servidor lo tiene configurado (fail-closed).
  useEffect(() => {
    (async () => {
      try {
        const cfg = (await api.getWaEmbeddedSignupConfig()) as { appId: string; configId?: string; graphVersion: string; state: string }
        setEsConfig(cfg)
        setEsAvailable(true)
      } catch {
        setEsAvailable(false) // 503 → falta META_APP_ID/SECRET: flujo manual es la ruta
      }
    })()
  }, [])

  useEffect(() => {
    void load(true)
    // Refresco pasivo cada 30 s: refleja veredictos sin acción del operador.
    const t = setInterval(() => { void load(false) }, 30_000)
    return () => clearInterval(t)
  }, [load])

  /** Carga el SDK de Meta una sola vez y devuelve el FB global. */
  const loadFbSdk = (graphVersion: string): Promise<NonNullable<Window['FB']>> =>
    new Promise((resolve, reject) => {
      if (window.FB) return resolve(window.FB)
      const script = document.createElement('script')
      script.src = embeddedSignupSdkUrl(graphVersion)
      script.async = true
      script.onload = () => {
        if (window.FB) return resolve(window.FB)
        reject(new Error('SDK de Meta no disponible'))
      }
      script.onerror = () => reject(new Error('SDK de Meta no disponible'))
      document.body.appendChild(script)
    })

  /** Flujo oficial de Meta: FB.login con config_id + escucha del evento de sesión. */
  const startEmbeddedSignup = async () => {
    if (!esConfig) return
    setEsBusy(true)
    esStateRef.current = esConfig.state
    try {
      const FB = await loadFbSdk(esConfig.graphVersion)
      FB.init({ appId: esConfig.appId, cookie: true, xfbml: false, version: esConfig.graphVersion })
      const onMessage = (event: MessageEvent) => {
        const payload = parseEmbeddedSignupMessage(event.data)
        if (!payload || esStateRef.current === '') return
        window.removeEventListener('message', onMessage)
        void (async () => {
          try {
            await api.completeWaEmbeddedSignup({
              code: payload.code,
              state: esStateRef.current,
              phoneNumberId: payload.phoneNumberId,
              wabaId: payload.wabaId,
            })
            toast.success('Número conectado vía Embedded Signup')
            esStateRef.current = ''
            await load(false)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Embedded Signup falló')
          } finally {
            setEsBusy(false)
          }
        })()
      }
      window.addEventListener('message', onMessage)
      FB.login(
        (response: unknown) => {
          const outcome = embeddedSignupOutcome(response)
          // Si Meta no emitió el evento de sesión (cancelación o error), limpiar.
          setTimeout(() => {
            if (outcome && !outcome.includes('completada')) {
              window.removeEventListener('message', onMessage)
              if (outcome.includes('cancelada')) toast.info(outcome)
              else toast.error(outcome || 'Embedded Signup no completado')
              setEsBusy(false)
              esStateRef.current = ''
            }
          }, 500)
        },
        {
          config_id: esConfig.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: { setup: {}, featureType: '', sessionInfoVersion: esConfig.graphVersion },
        },
      )
    } catch (err) {
      setEsBusy(false)
      toast.error(err instanceof Error ? err.message : 'No se pudo iniciar el flujo de Meta')
    }
  }

  const submitManualConnection = async () => {
    const errors = validateManualForm({ phoneNumberId, accessToken })
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return
    setCreating(true)
    try {
      await api.createWaConnection({
        phoneNumberId: phoneNumberId.trim(),
        accessToken: accessToken.trim(),
        wabaId: wabaId.trim(),
        phoneNumber: phoneNumber.trim(),
        displayName: displayName.trim(),
      })
      toast.success('Número registrado; verifica el token para confirmar el estado')
      setPhoneNumberId(''); setAccessToken(''); setWabaId(''); setPhoneNumber(''); setDisplayName('')
      setFormErrors({})
      setShowForm(false)
      await load(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar la conexión')
    } finally {
      setCreating(false)
    }
  }

  const openDisconnect = (c: WaConnection) => {
    setPendingDisconnect(c)
    setConfirmText('')
  }

  const confirmDisconnect = async () => {
    if (!pendingDisconnect || !canAttemptDisconnect(confirmText)) return
    setDisconnecting(true)
    try {
      await api.deleteWaConnection(pendingDisconnect.id)
      toast.success(`Número ${pendingDisconnect.phoneNumber} desconectado; token destruido`)
      setPendingDisconnect(null)
      await load(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo desconectar')
    } finally {
      setDisconnecting(false)
    }
  }

  const verifyConnection = async (c: WaConnection) => {
    try {
      const res = (await api.verifyWaConnection(c.id)) as { status: string }
      toast.success(`Token verificado contra Meta (${res.status})`)
      await load(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verificación fallida')
      await load(false)
    }
  }

  const openDetail = async (c: WaConnection) => {
    setDetailLoading(true)
    try {
      const d = (await api.getWaConnection(c.id)) as WaConnectionDetail
      setDetail(d)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cargar el detalle')
    } finally {
      setDetailLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        <span className="ml-3 text-sm text-slate-500">Cargando conexiones…</span>
      </div>
    )
  }

  const plan = data?.plan
  const connections = data?.connections ?? []
  const limitReached = plan ? planLimitReached(plan.activeConnections, plan.maxConnections) : false

  return (
    <div className="space-y-6 mt-4" data-testid="wa-connections-tab">
      {/* Uso del plan + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-emerald-600" />
          <span className="text-sm text-slate-600" data-testid="plan-usage">
            {plan ? planUsageText(plan.activeConnections, plan.maxConnections, plan.label) : 'Plan desconocido'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load(false)} disabled={refreshing}>
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Actualizar
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowForm((v) => !v)} disabled={limitReached}>
              <Plus className="w-4 h-4" />
              Conectar número
            </Button>
          )}
        </div>
      </div>

      {limitReached && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm">
            Límite del plan alcanzado ({plan?.activeConnections}/{plan?.maxConnections}).
            Amplía el plan o desconecta un número para añadir otro.
          </AlertDescription>
        </Alert>
      )}

      {!isAdmin && (
        <Alert className="border-slate-200 bg-slate-50">
          <ShieldCheck className="w-4 h-4 text-slate-500" />
          <AlertDescription className="text-slate-600 text-sm">
            Puedes ver el estado de los números; conectar o desconectar exige permisos de administrador.
          </AlertDescription>
        </Alert>
      )}

      {/* Formulario de conexión manual (Cloud API) */}
      {isAdmin && showForm && !limitReached && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} data-testid="manual-connect-form">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Conectar número vía Cloud API</CardTitle>
              <CardDescription>
                Registra un número de WhatsApp Business Cloud API. El token se cifra en reposo y
                nunca vuelve a mostrarse.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="wa-phone-number-id">Phone Number ID *</Label>
                  <Input
                    id="wa-phone-number-id" value={phoneNumberId} data-testid="input-phone-number-id"
                    onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="1234567890"
                  />
                  {formErrors.phoneNumberId && <p className="text-xs text-red-600">{formErrors.phoneNumberId}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-access-token">Token de acceso *</Label>
                  <Input
                    id="wa-access-token" type="password" value={accessToken} data-testid="input-access-token"
                    onChange={(e) => setAccessToken(e.target.value)} placeholder="EAAG…"
                  />
                  {formErrors.accessToken && <p className="text-xs text-red-600">{formErrors.accessToken}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-waba-id">WABA ID (opcional)</Label>
                  <Input id="wa-waba-id" value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="1029384756" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-phone">Número E.164 (opcional)</Label>
                  <Input id="wa-phone" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+573001234567" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="wa-display-name">Nombre comercial (opcional)</Label>
                  <Input id="wa-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Mi Negocio" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void submitManualConnection()} disabled={creating} data-testid="submit-manual-connection">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Registrar conexión
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)} disabled={creating}>Cancelar</Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Embedded Signup de Meta (solo si el servidor lo tiene configurado) */}
      {isAdmin && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <QrCode className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-800">Conectar con Meta (Embedded Signup)</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {esAvailable
                    ? 'Flujo oficial de Meta: autoriza desde WhatsApp Business y el token se canjea en el servidor. El código vive un solo uso.'
                    : 'El servidor no tiene META_APP_ID / META_APP_SECRET configurados: usa la conexión manual por Cloud API o configura la app de Meta en el servidor.'}
                </p>
              </div>
              {esAvailable ? (
                <Button variant="outline" size="sm" onClick={() => void startEmbeddedSignup()} disabled={esBusy} data-testid="start-embedded-signup">
                  {esBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  Conectar con Meta
                </Button>
              ) : (
                <Badge variant="outline" className="border-slate-200 text-slate-400">No configurado</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de conexiones */}
      <div className="space-y-3" data-testid="connection-list">
        {connections.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center">
              <WifiOff className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Todavía no hay números conectados para esta organización.</p>
              {isAdmin && <p className="text-xs text-slate-400 mt-1">Usa “Conectar número” para registrar el primero.</p>}
            </CardContent>
          </Card>
        )}
        {connections.map((c) => {
          const badge = connectionStatusBadge(c.status)
          const expiring = tokenExpiringSoon(c.tokenExpiresAt)
          return (
            <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} data-testid={`connection-card-${c.phoneNumberId}`}>
              <Card className={`border-0 shadow-sm ${c.status === 'connected' ? 'bg-emerald-50/40' : 'bg-white'}`}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      c.status === 'connected' ? 'bg-emerald-100' : 'bg-slate-100'
                    }`}>
                      {c.status === 'connected' ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : <WifiOff className="w-5 h-5 text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800">{c.displayName || c.phoneNumber || 'Número de WhatsApp'}</span>
                        <Badge variant="outline" className={badge.classes} data-testid={`status-badge-${c.status}`}>{badge.label}</Badge>
                        {c.source === 'manual' && (
                          <Badge variant="outline" className="border-slate-200 text-slate-500 text-[10px]">{connectionSourceLabel(c.source)}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{c.phoneNumber || c.phoneNumberId}</p>
                      {c.statusDetail && <p className="text-xs text-slate-400 mt-1">{c.statusDetail}</p>}
                      <p className="text-xs text-slate-400 mt-1">
                        Última verificación: {formatConnectionDate(c.lastVerifiedAt)}
                        {expiring && <span className="text-amber-600 font-medium"> · Token vence pronto ({formatConnectionDate(c.tokenExpiresAt)})</span>}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => void verifyConnection(c)} data-testid={`verify-${c.id}`}>
                        <ShieldCheck className="w-4 h-4" /> Verificar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void openDetail(c)} disabled={detailLoading} data-testid={`events-${c.id}`}>
                        {detailLoading && detail?.id === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />} Historial
                      </Button>
                      {isAdmin && (
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => openDisconnect(c)} data-testid={`disconnect-${c.id}`}>
                          <Trash2 className="w-4 h-4" /> Desconectar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Diálogo de desconexión — doble confirmación con palabra exacta */}
      <AlertDialog open={!!pendingDisconnect} onOpenChange={(open) => { if (!open) setPendingDisconnect(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar {pendingDisconnect?.phoneNumber || pendingDisconnect?.phoneNumberId}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  Se destruirá el token cifrado de esta conexión y dejará de enviar/recibir por este número.
                  Las demás conexiones de la organización no se ven afectadas.
                </p>
                <p className="mt-2">
                  Para confirmar escribe <span className="font-mono font-semibold">{DISCONNECT_CONFIRM_WORD}</span>:
                </p>
                <Input
                  className="mt-2" value={confirmText} data-testid="disconnect-confirm-input"
                  onChange={(e) => setConfirmText(e.target.value)} placeholder={DISCONNECT_CONFIRM_WORD}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="disconnect-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 disabled:opacity-40"
              disabled={!canAttemptDisconnect(confirmText) || disconnecting}
              onClick={(e) => { e.preventDefault(); void confirmDisconnect() }}
              data-testid="disconnect-confirm"
            >
              {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Desconectar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de detalle + registro de eventos */}
      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null) }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de {detail?.displayName || detail?.phoneNumber}</DialogTitle>
            <DialogDescription>
              Últimos eventos de la conexión (el servidor conserva 20).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2" data-testid="connection-events">
            {detail?.events.length === 0 && <p className="text-sm text-slate-400">Sin eventos registrados todavía.</p>}
            {detail?.events.map((ev) => (
              <div key={ev.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-[10px] h-4 border-slate-200 text-slate-600">{eventTypeLabel(ev.type)}</Badge>
                  <span className="text-[10px] text-slate-400">{formatConnectionDate(ev.createdAt)}</span>
                </div>
                {ev.detail && <p className="text-xs text-slate-600 mt-1">{ev.detail}</p>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
