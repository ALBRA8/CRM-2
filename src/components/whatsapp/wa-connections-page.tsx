'use client'

/**
 * wa-connections-page.tsx — Panel de CONEXIONES WHATSAPP MULTI-NÚMERO (F2 del
 * plan definitivo CRM-ALBRA v2.0).
 *
 * Consume la API /api/whatsapp/connections (Meta Cloud API por organización,
 * decisión 2026-11-11): cada organización administra SUS números con límite de
 * plan, cifrado de tokens server-side y aislamiento total entre orgs.
 *
 * Capacidades:
 *  - lista de números con estado (conectado/pendiente/desconectado/revocado);
 *  - uso del plan (X de Y) con barra de progreso;
 *  - conexión por Embedded Signup oficial de Meta (si la app está configurada)
 *    o registro manual con token directo (solo administrador);
 *  - verificación del token contra Graph API y desconexión con confirmación;
 *  - historial de eventos por conexión (últimos 20, lo expone la API).
 *
 * La lógica de presentación vive en wa-connections-view-model.ts (regla 9:
 * módulo puro con pruebas). Este componente solo renderiza y llama a la API.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  MessageCircle, RefreshCw, Plus, Loader2, Unplug, ShieldCheck, History,
  QrCode, AlertTriangle, ExternalLink, Phone, Landmark, Link2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  type WaConnectionView, type WaPlanInfo, type WaEventView,
  statusMeta, isActiveStatus, sortConnections, planUsageSummary,
  tokenExpiryMeta, connectionHealth, HEALTH_BORDER_CLASS,
  sourceLabel, eventMeta, formatMoment,
  manualFormDefaults, validateManualForm, type ManualConnectionForm,
  embeddedFlowMessage,
} from '@/lib/wa-connections-view-model'

/* ──── Embedded Signup: SDK de Meta ──── */

interface FbAuthResponse { code?: string }
interface FbLoginResult { authResponse?: FbAuthResponse | null }
interface FbSdk {
  init: (opts: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void
  login: (cb: (r: FbLoginResult) => void, opts: Record<string, unknown>) => void
}
interface WaEmbeddedSignupMessage {
  type: string
  event?: string
  data?: { phone_number_id?: string; waba_id?: string }
}

declare global {
  interface Window {
    FB?: FbSdk
    __waEmbeddedSignupResolve?: ((payload: { phoneNumberId: string; wabaId: string }) => void) | null
  }
}

/** Inyecta el SDK de Facebook (una sola vez) y resuelve cuando window.FB existe. */
function loadFacebookSdk(appId: string, graphVersion: string): Promise<FbSdk> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB)
    const existing = document.getElementById('fb-mkt-sdk') as HTMLScriptElement | null
    const timer = window.setInterval(() => {
      if (window.FB) {
        window.clearInterval(timer)
        resolve(window.FB)
      }
    }, 300)
    window.setTimeout(() => {
      window.clearInterval(timer)
      if (!window.FB) reject(new Error('El SDK de Meta no cargó (¿bloqueador de contenido?)'))
    }, 15_000)
    if (existing) return
    const script = document.createElement('script')
    script.id = 'fb-mkt-sdk'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      window.FB?.init({ appId, cookie: true, xfbml: true, version: graphVersion })
    }
    script.onerror = () => {
      window.clearInterval(timer)
      reject(new Error('No se pudo cargar el SDK de Meta'))
    }
    document.head.appendChild(script)
  })
}

/* ──── Página ──── */

type EmbeddedPhase = 'idle' | 'loading' | 'sdk' | 'awaiting' | 'exchanging' | 'done' | 'error'

export function WaConnectionsPage() {
  const { user, isAdmin, setView } = useAppStore()
  const [connections, setConnections] = useState<WaConnectionView[]>([])
  const [plan, setPlan] = useState<WaPlanInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Dialog de detalle (eventos)
  const [detailConn, setDetailConn] = useState<(WaConnectionView & { events?: WaEventView[] }) | null>(null)
  const [detailEvents, setDetailEvents] = useState<WaEventView[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  // Desconexión con confirmación
  const [disconnectTarget, setDisconnectTarget] = useState<WaConnectionView | null>(null)
  const [revokeToo, setRevokeToo] = useState(false)

  // Formulario manual
  const [manualOpen, setManualOpen] = useState(false)
  const [form, setForm] = useState<ManualConnectionForm>(manualFormDefaults())
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ManualConnectionForm, string>>>({})
  const [submitting, setSubmitting] = useState(false)

  // Embedded Signup
  const [embeddedPhase, setEmbeddedPhase] = useState<EmbeddedPhase>('idle')
  const [embeddedError, setEmbeddedError] = useState<string | null>(null)
  const [embeddedAvailable, setEmbeddedAvailable] = useState<boolean | null>(null)
  const [manualPhoneIdPrompt, setManualPhoneIdPrompt] = useState<{ code: string; state: string } | null>(null)
  const [promptPhoneId, setPromptPhoneId] = useState('')
  const messageListenerRef = useRef<((e: MessageEvent) => void) | null>(null)

  const loadConnections = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const data = await api.getWaConnections() as { connections: WaConnectionView[]; plan: WaPlanInfo }
      setConnections(data.connections ?? [])
      setPlan(data.plan ?? null)
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : 'No se pudieron cargar las conexiones')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadConnections(true)
    const timer = setInterval(() => { void loadConnections(true) }, 15_000)
    return () => clearInterval(timer)
  }, [loadConnections])

  // Limpieza del listener de mensajes del popup de Meta
  useEffect(() => {
    return () => {
      if (messageListenerRef.current) window.removeEventListener('message', messageListenerRef.current)
    }
  }, [])

  const sorted = useMemo(() => sortConnections(connections), [connections])
  const usage = useMemo(() => planUsageSummary(plan), [plan])
  const activeCount = useMemo(() => connections.filter((c) => isActiveStatus(c.status)).length, [connections])
  const hasActive = activeCount > 0

  const openDetail = async (conn: WaConnectionView) => {
    setDetailConn(conn)
    setDetailEvents([])
    setDetailLoading(true)
    try {
      const data = await api.getWaConnection(conn.id) as WaConnectionView & { events?: WaEventView[] }
      setDetailEvents(data.events ?? [])
      setDetailConn(data)
    } catch {
      toast.error('No se pudo cargar el detalle de la conexión')
    } finally {
      setDetailLoading(false)
    }
  }

  const verifyConnection = async (conn: WaConnectionView) => {
    setBusyId(conn.id)
    try {
      await api.verifyWaConnection(conn.id)
      toast.success(`Número ${conn.phoneNumber} verificado contra Meta`)
      await loadConnections(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verificación fallida')
      await loadConnections(true)
    } finally {
      setBusyId(null)
    }
  }

  const confirmDisconnect = async () => {
    if (!disconnectTarget) return
    setBusyId(disconnectTarget.id)
    try {
      await api.disconnectWaConnection(disconnectTarget.id, { revoked: revokeToo })
      toast.success(`Número ${disconnectTarget.phoneNumber} ${revokeToo ? 'revocado' : 'desconectado'}`)
      setDisconnectTarget(null)
      setRevokeToo(false)
      await loadConnections(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo desconectar')
    } finally {
      setBusyId(null)
    }
  }

  const submitManual = async () => {
    const validation = validateManualForm(form)
    setFormErrors(validation.errors)
    if (!validation.ok) return
    setSubmitting(true)
    try {
      await api.createWaConnection({
        phoneNumberId: form.phoneNumberId.trim(),
        accessToken: form.accessToken.trim(),
        displayName: form.displayName.trim() || undefined,
        wabaId: form.wabaId.trim() || undefined,
        phoneNumber: form.phoneNumber.trim() || undefined,
      })
      toast.success('Conexión registrada y verificada contra Meta')
      setManualOpen(false)
      setForm(manualFormDefaults())
      setFormErrors({})
      await loadConnections(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar la conexión')
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Embedded Signup oficial (flujo preferido) ── */

  const removeMessageListener = () => {
    if (messageListenerRef.current) {
      window.removeEventListener('message', messageListenerRef.current)
      messageListenerRef.current = null
    }
  }

  /** Listener del mensaje WA_EMBEDDED_SIGNUP que Meta envía al completar el flujo. */
  const installMessageListener = (code: string, state: string): Promise<{ phoneNumberId: string; wabaId: string }> => {
    return new Promise((resolve, reject) => {
      removeMessageListener()
      const listener = (e: MessageEvent) => {
        if (e.origin !== 'https://www.facebook.com') return
        const msg = e.data as WaEmbeddedSignupMessage
        if (msg?.type !== 'WA_EMBEDDED_SIGNUP') return
        if (msg.event === 'FINISH' || msg.event === 'FINISH_ONLY_WABA') {
          resolve({
            phoneNumberId: msg.data?.phone_number_id ?? '',
            wabaId: msg.data?.waba_id ?? '',
          })
        } else if (msg.event === 'CANCEL') {
          reject(new Error('Flujo cancelado en la ventana de Meta'))
        }
      }
      messageListenerRef.current = listener
      window.addEventListener('message', listener)
      // Guarda los datos del intent para el callback de FB.login
      window.__waEmbeddedSignupResolve = (payload) => resolve(payload)
      void code; void state
    })
  }

  const startEmbeddedSignup = async () => {
    setEmbeddedPhase('loading')
    setEmbeddedError(null)
    try {
      // Un intento = un state firmado de un solo uso (TTL 15 min). Solo se pide
      // cuando el usuario DECIDE conectar: no se consumen nonces al abrir la página.
      const cfg = await api.getWaEmbeddedSignupConfig() as {
        appId: string; configId?: string; graphVersion: string; state: string
      }
      setEmbeddedAvailable(true)
      setEmbeddedPhase('sdk')
      const FB = await loadFacebookSdk(cfg.appId, cfg.graphVersion)
      setEmbeddedPhase('awaiting')
      const pending = installMessageListener('', cfg.state)
      FB.login((result) => {
        const code = result.authResponse?.code
        if (!code) {
          removeMessageListener()
          setEmbeddedPhase('error')
          setEmbeddedError('No se obtuvo el código de autorización de Meta.')
          return
        }
        // Si Meta ya avisó por postMessage usamos ese phoneNumberId; si no,
        // pedimos el número en un diálogo (fallback seguro).
        const finish = async (phoneNumberId: string, wabaId: string) => {
          if (!phoneNumberId) {
            setManualPhoneIdPrompt({ code, state: cfg.state })
            setEmbeddedPhase('awaiting')
            return
          }
          setEmbeddedPhase('exchanging')
          try {
            await api.completeWaEmbeddedSignup({ code, state: cfg.state, phoneNumberId, wabaId: wabaId || undefined })
            setEmbeddedPhase('done')
            toast.success('Número de WhatsApp conectado por Embedded Signup')
            removeMessageListener()
            await loadConnections(true)
          } catch (err) {
            setEmbeddedPhase('error')
            setEmbeddedError(err instanceof Error ? err.message : 'El canje del código falló')
            removeMessageListener()
          }
        }
        void pending
          .then((payload) => finish(payload.phoneNumberId, payload.wabaId))
          .catch(() => finish('', ''))
      }, {
        config_id: cfg.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
      })
    } catch (err) {
      setEmbeddedPhase('error')
      setEmbeddedError(err instanceof Error ? err.message : 'Embedded Signup no disponible')
      setEmbeddedAvailable(false)
      removeMessageListener()
    }
  }

  const submitPromptedPhoneId = async () => {
    if (!manualPhoneIdPrompt) return
    const phoneNumberId = promptPhoneId.trim()
    if (!/^\d{6,20}$/.test(phoneNumberId)) {
      toast.error('phoneNumberId numérico de 6 a 20 dígitos')
      return
    }
    setEmbeddedPhase('exchanging')
    try {
      await api.completeWaEmbeddedSignup({
        code: manualPhoneIdPrompt.code,
        state: manualPhoneIdPrompt.state,
        phoneNumberId,
      })
      setEmbeddedPhase('done')
      setManualPhoneIdPrompt(null)
      setPromptPhoneId('')
      toast.success('Número de WhatsApp conectado por Embedded Signup')
      await loadConnections(true)
    } catch (err) {
      setEmbeddedPhase('error')
      setEmbeddedError(err instanceof Error ? err.message : 'El canje del código falló')
    }
  }

  const connectRecommended = () => {
    if (embeddedAvailable === false) {
      setManualOpen(isAdmin)
      if (!isAdmin) toast.error('Solo un administrador puede registrar números manualmente')
      return
    }
    void startEmbeddedSignup()
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Link2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Conexiones de WhatsApp</h1>
            <p className="text-xs text-slate-500">
              Conecta los números de la organización por la API oficial de Meta (multi-número).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm" className="h-8 text-xs gap-1.5"
            onClick={() => void loadConnections()} disabled={refreshing}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
          <Button
            size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={connectRecommended}
          >
            {embeddedPhase === 'loading' || embeddedPhase === 'sdk' || embeddedPhase === 'exchanging' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Conectar número
          </Button>
        </div>
      </div>

      {/* Estado del flujo Embedded Signup */}
      {embeddedPhase !== 'idle' && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            {embeddedPhase === 'error' ? (
              <div className="flex items-start gap-2 text-red-700">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold">El flujo de Meta no se completó</p>
                  <p className="text-xs mt-0.5 text-red-600">{embeddedError}</p>
                  {isAdmin && (
                    <p className="text-xs mt-1 text-slate-500">
                      Puedes registrar el número manualmente con el token directo.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-600 text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                {embeddedFlowMessage(embeddedPhase) || 'Procesando…'}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Uso del plan */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Phone className="w-4 h-4 text-emerald-600" /> {usage.text}
            </div>
            {usage.isAtLimit && !usage.isUnlimited && (
              <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">
                Límite del plan alcanzado
              </Badge>
            )}
          </div>
          <Progress value={usage.pct} className="h-2" />
          <p className="text-[11px] text-slate-400 mt-2">
            Cada número conectado ocupa un cupo del plan. Los números desconectados o revocados no ocupan cupo.
          </p>
        </CardContent>
      </Card>

      {/* Lista de conexiones */}
      <div className="space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : sorted.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-emerald-300" />
              </div>
              <h3 className="text-base font-semibold text-slate-800 mb-1">Sin números conectados</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
                Conecta el primer número de WhatsApp de la organización. El flujo oficial de Meta
                entrega la autorización sin compartir contraseñas; el token queda cifrado en el servidor.
              </p>
              <Button
                size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                onClick={connectRecommended}
              >
                <QrCode className="w-3.5 h-3.5" /> Conectar el primer número
              </Button>
              {isAdmin && (
                <button
                  className="block mx-auto mt-3 text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
                  onClick={() => setManualOpen(true)}
                >
                  Registrar manualmente con token directo (admin)
                </button>
              )}
            </CardContent>
          </Card>
        ) : (
          sorted.map((conn) => {
            const meta = statusMeta(conn.status)
            const health = connectionHealth(conn)
            const expiry = tokenExpiryMeta(conn.tokenExpiresAt)
            return (
              <Card key={conn.id} className={`border-0 border-l-4 shadow-sm ${HEALTH_BORDER_CLASS[health]}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full mt-2 flex-shrink-0 ${meta.dotClass}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-900">
                            {conn.displayName || conn.phoneNumber}
                          </span>
                          <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${meta.badgeClass}`}>
                            {meta.label}
                          </Badge>
                          <span className="text-[10px] text-slate-400">{sourceLabel(conn.source)}</span>
                        </div>
                        <p className="text-sm text-slate-600 mt-0.5">{conn.phoneNumber}</p>
                        <p className="text-[11px] text-slate-400 mt-1">{meta.hint}</p>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[11px] text-slate-400">
                          <span>ID: <span className="font-mono">{conn.phoneNumberId}</span></span>
                          {conn.wabaId && (
                            <span className="inline-flex items-center gap-0.5">
                              <Landmark className="w-3 h-3" /> WABA: <span className="font-mono">{conn.wabaId}</span>
                            </span>
                          )}
                          <span>Verificado: {formatMoment(conn.lastVerifiedAt)}</span>
                          <span className={
                            expiry.tone === 'bad' ? 'text-red-600 font-medium'
                              : expiry.tone === 'warn' ? 'text-amber-600 font-medium' : ''
                          }>
                            {expiry.label}
                          </span>
                        </div>
                        {conn.statusDetail && (
                          <p className="text-[11px] text-slate-500 mt-1.5 italic">{conn.statusDetail}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                      <Button
                        variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                        onClick={() => void openDetail(conn)}
                      >
                        <History className="w-3 h-3" /> Detalle
                      </Button>
                      {conn.status !== 'disconnected' && conn.status !== 'revoked' && (
                        <>
                          <Button
                            variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                            onClick={() => void verifyConnection(conn)} disabled={busyId === conn.id}
                          >
                            {busyId === conn.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-3 h-3" />
                            )}
                            Verificar
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="outline" size="sm"
                              className="h-7 text-[11px] gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                              onClick={() => setDisconnectTarget(conn)} disabled={busyId === conn.id}
                            >
                              <Unplug className="w-3 h-3" /> Desconectar
                            </Button>
                          )}
                        </>
                      )}
                      {(conn.status === 'disconnected' || conn.status === 'revoked') && isAdmin && (
                        <Button
                          variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                          onClick={connectRecommended}
                        >
                          <ExternalLink className="w-3 h-3" /> Reconectar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {hasActive && (
        <p className="text-[11px] text-slate-400 text-center">
          Las conversaciones entrantes de estos números aparecen en la bandeja.{' '}
          <button className="underline underline-offset-2 hover:text-slate-600" onClick={() => setView('whatsapp')}>
            Abrir bandeja WhatsApp
          </button>
        </p>
      )}

      {/* Dialog: detalle + eventos */}
      <Dialog open={!!detailConn} onOpenChange={(open) => { if (!open) setDetailConn(null) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {detailConn?.displayName || detailConn?.phoneNumber}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Estado {statusMeta(detailConn?.status).label.toLowerCase()} · {sourceLabel(detailConn?.source)}
            </DialogDescription>
          </DialogHeader>
          {detailConn && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-slate-400">Número</p>
                  <p className="font-medium text-slate-800">{detailConn.phoneNumber}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-slate-400">phoneNumberId</p>
                  <p className="font-mono text-slate-800 break-all">{detailConn.phoneNumberId}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-slate-400">Última verificación</p>
                  <p className="font-medium text-slate-800">{formatMoment(detailConn.lastVerifiedAt)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-slate-400">Creada</p>
                  <p className="font-medium text-slate-800">{formatMoment(detailConn.createdAt)}</p>
                </div>
              </div>
              {detailConn.tokenExpiresAt && (
                <p className={`text-xs ${tokenExpiryMeta(detailConn.tokenExpiresAt).tone === 'bad' ? 'text-red-600' : 'text-slate-500'}`}>
                  {tokenExpiryMeta(detailConn.tokenExpiresAt).label}
                </p>
              )}
              <Separator />
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">Historial reciente (últimos 20 eventos)</p>
                {detailLoading ? (
                  <Skeleton className="h-20 rounded-lg" />
                ) : detailEvents.length === 0 ? (
                  <p className="text-xs text-slate-400">Sin eventos registrados.</p>
                ) : (
                  <div className="space-y-1.5">
                    {detailEvents.map((ev) => {
                      const em = eventMeta(ev.type)
                      return (
                        <div key={ev.id} className="flex items-start gap-2 text-xs">
                          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                            em.tone === 'ok' ? 'bg-emerald-500' : em.tone === 'warn' ? 'bg-amber-500'
                              : em.tone === 'bad' ? 'bg-red-500' : 'bg-slate-300'
                          }`} />
                          <div className="min-w-0">
                            <span className="font-medium text-slate-700">{em.label}</span>
                            <span className="text-slate-400 ml-1.5">{formatMoment(ev.createdAt)}</span>
                            {ev.detail && <p className="text-slate-500 break-words">{ev.detail}</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: desconexión con confirmación */}
      <AlertDialog open={!!disconnectTarget} onOpenChange={(open) => { if (!open) { setDisconnectTarget(null); setRevokeToo(false) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar {disconnectTarget?.phoneNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              El token cifrado se destruye y el número deja de recibir y enviar mensajes.
              La conexión queda como histórico auditable y libera un cupo del plan.
              Esta operación no afecta a los demás números de la organización.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 text-xs text-slate-600 -mt-2">
            <input
              type="checkbox"
              checked={revokeToo}
              onChange={(e) => setRevokeToo(e.target.checked)}
              className="accent-red-600"
            />
            Marcar como revocada (Meta retiró la autorización; requiere reconectar desde cero)
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white text-xs"
              onClick={(e) => { e.preventDefault(); void confirmDisconnect() }}
            >
              {busyId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Desconectar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: registro manual (admin) */}
      <Dialog open={manualOpen} onOpenChange={(open) => { if (!open) { setManualOpen(false); setFormErrors({}) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Registrar número manualmente</DialogTitle>
            <DialogDescription className="text-xs">
              Token de acceso de WhatsApp Cloud API (Meta Business). El token se cifra con
              AES-256-GCM y nunca se vuelve a mostrar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="wa-phone-number-id" className="text-xs">phoneNumberId *</Label>
              <Input
                id="wa-phone-number-id"
                value={form.phoneNumberId}
                onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
                placeholder="123456789012345"
                className="h-8 text-xs"
                inputMode="numeric"
              />
              {formErrors.phoneNumberId && <p className="text-[11px] text-red-600">{formErrors.phoneNumberId}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="wa-access-token" className="text-xs">Token de acceso *</Label>
              <Input
                id="wa-access-token"
                type="password"
                value={form.accessToken}
                onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
                placeholder="EAAG…"
                className="h-8 text-xs font-mono"
              />
              {formErrors.accessToken && <p className="text-[11px] text-red-600">{formErrors.accessToken}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="wa-display-name" className="text-xs">Nombre visible</Label>
                <Input
                  id="wa-display-name"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="ALBRA Ventas"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wa-phone-number" className="text-xs">Número</Label>
                <Input
                  id="wa-phone-number"
                  value={form.phoneNumber}
                  onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                  placeholder="+57 300 000 0000"
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="wa-waba-id" className="text-xs">WABA ID (opcional)</Label>
              <Input
                id="wa-waba-id"
                value={form.wabaId}
                onChange={(e) => setForm({ ...form, wabaId: e.target.value })}
                placeholder="1029384756"
                className="h-8 text-xs"
                inputMode="numeric"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              El servidor valida el token contra Graph API antes de guardar; si Meta lo rechaza,
              la conexión no se crea.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setManualOpen(false); setFormErrors({}) }}>
              Cancelar
            </Button>
            <Button
              size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
              onClick={() => void submitManual()} disabled={submitting}
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: phoneNumberId faltante tras Embedded Signup (fallback) */}
      <Dialog open={!!manualPhoneIdPrompt} onOpenChange={(open) => { if (!open) { setManualPhoneIdPrompt(null); setPromptPhoneId('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Número registrado en Meta</DialogTitle>
            <DialogDescription className="text-xs">
              La ventana de Meta cerró antes de entregar el identificador del número.
              Pégalo desde WhatsApp Manager (Configuración de la API → Números de teléfono).
            </DialogDescription>
          </DialogHeader>
          <Input
            value={promptPhoneId}
            onChange={(e) => setPromptPhoneId(e.target.value)}
            placeholder="123456789012345"
            className="h-8 text-xs"
            inputMode="numeric"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setManualPhoneIdPrompt(null); setPromptPhoneId('') }}>
              Cancelar
            </Button>
            <Button
              size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => void submitPromptedPhoneId()}
            >
              Completar conexión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aviso de permisos para no administradores */}
      {!isAdmin && (
        <p className="text-[11px] text-slate-400 text-center">
          Conectado como {user?.name ?? 'usuario'}: puedes verificar y revisar números,
          pero solo un administrador puede conectar o desconectar números.
        </p>
      )}
    </div>
  )
}
