'use client'

/**
 * connections-tab.tsx — Panel de Conexiones WhatsApp multi-número (F2).
 *
 * Plan definitivo §5.1 F3-T02: "El propietario de cada organización conecta sus
 * números desde Ajustes → Canales: estado, QR o Cloud, desconexión y
 * reconexión, sin tocar la API."
 *
 * El panel LEE el estado agregado de GET /api/whatsapp/connections-panel
 * (veredicto real de sesión Baileys + conexiones Cloud API + plan) y ejecuta
 * las ACCIONES contra las rutas ya existentes y protegidas:
 *   - Conectar por QR  → POST /api/whatsapp/daemon-proxy { path: '/connect' }
 *                        + GET ?path=/qr (el proxy inyecta el orgId del JWT)
 *   - Desconectar QR   → POST /api/whatsapp/daemon-proxy { path: '/disconnect' }
 *   - Alta Cloud API   → POST /api/whatsapp/connections (admin, token cifrado)
 *   - Verificar token  → POST /api/whatsapp/connections/[id]/verify (admin)
 *   - Desconectar Cloud→ DELETE /api/whatsapp/connections/[id] (admin)
 *
 * Reglas de UX/seguridad (criterios de aceptación F2):
 *  - el estado mostrado es el veredicto REAL del daemon: si no se puede
 *    verificar (daemon caído) se muestra "Sin verificar" y nada se finge;
 *  - desconectar SIEMPRE exige confirmación explícita (doble para Cloud);
 *  - el límite del plan se muestra con su motivo accionable cuando bloquea.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Clock, Loader2, Plus, QrCode, RefreshCw, Smartphone, Unplug, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@/lib/api'
import {
  panelActionableError,
  shouldPollPanel,
  type ChannelUiStatus,
  type ConnectionsPanelView,
  type ConnectionCard,
} from '@/lib/wa-connections-view'

const DAEMON_PROXY = '/api/whatsapp/daemon-proxy'
const PANEL_URL = '/api/whatsapp/connections-panel'
const POLL_MS = 15_000

// ---------------------------------------------------------------------------
// Presentación del estado (catálogo único: color + icono + texto)
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<ChannelUiStatus, { className: string; dot: string }> = {
  connected: { className: 'border-emerald-200 text-emerald-700 bg-emerald-50', dot: 'bg-emerald-500' },
  waiting_qr: { className: 'border-amber-200 text-amber-700 bg-amber-50', dot: 'bg-amber-500' },
  connecting: { className: 'border-sky-200 text-sky-700 bg-sky-50', dot: 'bg-sky-500' },
  disconnected: { className: 'border-slate-200 text-slate-600 bg-slate-50', dot: 'bg-slate-400' },
  revoked: { className: 'border-rose-200 text-rose-700 bg-rose-50', dot: 'bg-rose-500' },
  error: { className: 'border-red-200 text-red-700 bg-red-50', dot: 'bg-red-500' },
  unknown: { className: 'border-slate-200 text-slate-500 bg-slate-50', dot: 'bg-slate-300' },
}

function StatusBadge({ status, label }: { status: ChannelUiStatus; label: string }) {
  const s = STATUS_BADGE[status]
  return (
    <Badge variant="outline" className={`${s.className} gap-1.5`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === 'connecting' ? 'animate-pulse' : ''}`} />
      {label}
    </Badge>
  )
}

function CardIcon({ status }: { status: ChannelUiStatus }) {
  if (status === 'connected') {
    return <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
  }
  if (status === 'waiting_qr' || status === 'connecting') {
    return <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center"><QrCode className="w-5 h-5 text-amber-600" /></div>
  }
  if (status === 'error' || status === 'revoked') {
    return <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
  }
  return <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center"><Smartphone className="w-5 h-5 text-slate-400" /></div>
}

// ---------------------------------------------------------------------------
// Panel principal
// ---------------------------------------------------------------------------

export function ConnectionsTab() {
  const [view, setView] = useState<ConnectionsPanelView | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  // QR de la sesión Baileys (solo cuando el usuario pide conectar)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrVisible, setQrVisible] = useState(false)
  const [qrSecondsLeft, setQrSecondsLeft] = useState(0)

  // Alta de conexión Cloud API (admin)
  const [showAddCloud, setShowAddCloud] = useState(false)
  const [cloudForm, setCloudForm] = useState({ phoneNumberId: '', accessToken: '', displayName: '' })

  // Confirmaciones de desconexión (Baileys simple; Cloud doble)
  const [confirmBaileys, setConfirmBaileys] = useState(false)
  const [confirmCloudFirst, setConfirmCloudFirst] = useState<ConnectionCard | null>(null)
  const [confirmCloudSecond, setConfirmCloudSecond] = useState<ConnectionCard | null>(null)

  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadPanel = useCallback(async () => {
    try {
      const data = (await api.request(PANEL_URL)) as ConnectionsPanelView
      setView(data)
      setLastError(null)
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'Error al cargar conexiones')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadPanel() }, [loadPanel])

  // Sondeo automático SOLO mientras algo espera QR/conexión (criterio F2:
  // reflejar la conexión sin exigir clicks), con limpieza del timer.
  useEffect(() => {
    if (!view || !shouldPollPanel(view)) return
    const t = setInterval(() => { void loadPanel() }, POLL_MS)
    return () => clearInterval(t)
  }, [view, loadPanel])

  // Contador visual de expiración del QR (60 s, como el resto de la app)
  useEffect(() => {
    if (!qrVisible) {
      if (qrTimerRef.current) { clearInterval(qrTimerRef.current); qrTimerRef.current = null }
      return
    }
    setQrSecondsLeft(60)
    qrTimerRef.current = setInterval(() => {
      setQrSecondsLeft((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => { if (qrTimerRef.current) { clearInterval(qrTimerRef.current); qrTimerRef.current = null } }
  }, [qrVisible])

  const loadQr = useCallback(async () => {
    try {
      const res = await fetch(`${DAEMON_PROXY}?path=/qr`, {
        headers: api.getToken() ? { Authorization: `Bearer ${api.getToken()}` } : undefined,
      })
      const data = (await res.json().catch(() => null)) as { qr?: string } | null
      setQrDataUrl(data?.qr ?? null)
    } catch {
      setQrDataUrl(null)
    }
  }, [])

  const handleConnectQr = async () => {
    setActionLoading('baileys-connect')
    try {
      const data = (await api.request(DAEMON_PROXY, {
        method: 'POST',
        body: JSON.stringify({ path: '/connect', force: false }),
      })) as { success?: boolean; note?: string; error?: string }
      if (data && (data.success === false || data.note || data.error)) {
        throw new Error(data.note || data.error || 'El daemon no pudo iniciar la conexión')
      }
      setQrVisible(true)
      toast.success('Generando código QR...')
      await new Promise((r) => setTimeout(r, 2000))
      await loadQr()
      await loadPanel()
    } catch (err) {
      toast.error(panelActionableError(null, err instanceof Error ? err.message : 'Error al conectar'))
    } finally {
      setActionLoading(null)
    }
  }

  const handleDisconnectBaileys = async () => {
    setActionLoading('baileys-disconnect')
    try {
      await api.request(DAEMON_PROXY, {
        method: 'POST',
        body: JSON.stringify({ path: '/disconnect' }),
      })
      toast.success('Sesión de WhatsApp desconectada')
      setConfirmBaileys(false)
      setQrVisible(false)
      setQrDataUrl(null)
      await loadPanel()
    } catch (err) {
      toast.error(panelActionableError('daemon_down', err instanceof Error ? err.message : 'Error al desconectar'))
    } finally {
      setActionLoading(null)
    }
  }

  const handleAddCloud = async () => {
    setActionLoading('cloud-add')
    try {
      await api.request('/api/whatsapp/connections', {
        method: 'POST',
        body: JSON.stringify({
          phoneNumberId: cloudForm.phoneNumberId.trim(),
          accessToken: cloudForm.accessToken.trim(),
          displayName: cloudForm.displayName.trim() || undefined,
        }),
      })
      toast.success('Número de WhatsApp Cloud conectado y credenciales cifradas')
      setShowAddCloud(false)
      setCloudForm({ phoneNumberId: '', accessToken: '', displayName: '' })
      await loadPanel()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al conectar el número'
      toast.error(msg)
    } finally {
      setActionLoading(null)
    }
  }

  const handleVerifyCloud = async (id: string) => {
    setActionLoading(`verify-${id}`)
    try {
      await api.request(`/api/whatsapp/connections/${id}/verify`, { method: 'POST' })
      toast.success('Token verificado contra Graph API')
      await loadPanel()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al verificar'
      toast.error(msg)
      await loadPanel()
    } finally {
      setActionLoading(null)
    }
  }

  const handleDisconnectCloud = async (id: string) => {
    setActionLoading(`disconnect-${id}`)
    try {
      await api.request(`/api/whatsapp/connections/${id}`, { method: 'DELETE', body: JSON.stringify({}) })
      toast.success('Número desconectado; el cupo del plan queda liberado')
      setConfirmCloudSecond(null)
      setConfirmCloudFirst(null)
      await loadPanel()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al desconectar')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="text-sm text-slate-500 ml-3">Cargando conexiones...</span>
      </div>
    )
  }

  if (!view) {
    return (
      <Card className="border-0 shadow-sm bg-red-50/50">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">No se pudo cargar el panel de conexiones</p>
              <p className="text-xs text-red-700 mt-1">{lastError ?? 'Error desconocido'}</p>
              <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => { setLoading(true); void loadPanel() }}>
                <RefreshCw className="w-3.5 h-3.5" /> Reintentar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const baileysCard = view.cards.find((c) => c.kind === 'baileys')
  const cloudCards = view.cards.filter((c) => c.kind === 'meta_cloud')

  return (
    <div className="space-y-4" data-testid="connections-panel">
      {/* --- Consumo del plan --- */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-800">
                Números activos: {view.plan.activeConnections} de {view.plan.maxConnections}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Plan {view.plan.label}. Las desconexiones liberan cupo; el límite lo aplica el servidor.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setLoading(true); void loadPanel() }}>
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
              </Button>
              {view.canAddCloud ? (
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={() => setShowAddCloud(true)}>
                  <Plus className="w-3.5 h-3.5" /> Conectar Cloud API
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Plan completo
                </Button>
              )}
            </div>
          </div>
          {view.addBlockReason && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-3">
              {view.addBlockReason}
            </p>
          )}
        </CardContent>
      </Card>

      {/* --- Sesión Baileys (QR) --- */}
      {baileysCard && (
        <Card className="border-0 shadow-sm" data-testid="baileys-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CardIcon status={baileysCard.status} />
                <div>
                  <CardTitle className="text-base">{baileysCard.title}</CardTitle>
                  <CardDescription>
                    {baileysCard.subtitle ? `Conectado como ${baileysCard.subtitle}` : 'Sesión por código QR, gestionada por el daemon del servidor'}
                  </CardDescription>
                </div>
              </div>
              <StatusBadge status={baileysCard.status} label={baileysCard.statusLabel} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!view.baileys.available && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                {baileysCard.detail ?? 'No se pudo verificar el estado del daemon de WhatsApp.'}
              </p>
            )}
            {baileysCard.status === 'connected' && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 gap-1.5"
                  onClick={() => setConfirmBaileys(true)}
                  disabled={actionLoading !== null}
                  data-testid="baileys-disconnect"
                >
                  <Unplug className="w-3.5 h-3.5" /> Desconectar
                </Button>
              </div>
            )}
            {(baileysCard.status === 'disconnected' || baileysCard.status === 'unknown') && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  onClick={() => void handleConnectQr()}
                  disabled={actionLoading !== null}
                  data-testid="baileys-connect"
                >
                  {actionLoading === 'baileys-connect' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                  Conectar por QR
                </Button>
              </div>
            )}
            {(baileysCard.status === 'waiting_qr' || baileysCard.status === 'connecting') && (
              <div className="flex flex-col items-center py-2">
                {qrVisible && qrDataUrl ? (
                  <>
                    <div className={`bg-white p-3 rounded-xl shadow border border-slate-200 ${qrSecondsLeft <= 0 ? 'opacity-20' : ''}`}>
                      <img src={qrDataUrl} alt="Código QR de WhatsApp" className="w-56 h-56 pointer-events-none select-none" />
                    </div>
                    {qrSecondsLeft > 0 ? (
                      <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" /> Escanea con WhatsApp ({qrSecondsLeft}s) · el panel se refresca solo
                      </p>
                    ) : (
                      <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={() => { void loadQr() }}>
                        <RefreshCw className="w-3.5 h-3.5" /> Regenerar QR
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-600 my-2" />
                    <p className="text-xs text-slate-500">Esperando código QR del daemon...</p>
                    <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={() => { setQrVisible(true); void loadQr() }}>
                      <QrCode className="w-3.5 h-3.5" /> Mostrar QR
                    </Button>
                  </>
                )}
              </div>
            )}
            {baileysCard.lastVerifiedAt && baileysCard.status === 'connected' && (
              <p className="text-xs text-slate-400">
                Última actividad de sesión: {new Date(baileysCard.lastVerifiedAt).toLocaleString('es')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* --- Conexiones Cloud API --- */}
      {cloudCards.length === 0 ? (
        <Card className="border-0 shadow-sm bg-slate-50/60">
          <CardContent className="p-5 text-center">
            <Smartphone className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-600 font-medium">Sin números de WhatsApp Cloud API</p>
            <p className="text-xs text-slate-500 mt-1">
              Conecta un número con Embedded Signup o manualmente con un token de administrador de Meta.
            </p>
            {view.canAddCloud && (
              <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => setShowAddCloud(true)}>
                <Plus className="w-3.5 h-3.5" /> Conectar número Cloud
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        cloudCards.map((card) => (
          <Card key={card.id} className="border-0 shadow-sm" data-testid={`cloud-card-${card.id}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <CardIcon status={card.status} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{card.title}</p>
                    <p className="text-xs text-slate-500 truncate">{card.subtitle}</p>
                  </div>
                </div>
                <StatusBadge status={card.status} label={card.statusLabel} />
              </div>
              {card.detail && <p className="text-xs text-slate-500 mt-2">{card.detail}</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                {card.canVerify && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void handleVerifyCloud(card.id)} disabled={actionLoading !== null}>
                    {actionLoading === `verify-${card.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Verificar token
                  </Button>
                )}
                {card.canDisconnect && (
                  <Button
                    size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 gap-1.5"
                    onClick={() => setConfirmCloudFirst(card)}
                    disabled={actionLoading !== null}
                    data-testid={`cloud-disconnect-${card.id}`}
                  >
                    <Unplug className="w-3.5 h-3.5" /> Desconectar
                  </Button>
                )}
                {card.lastVerifiedAt && (
                  <span className="text-xs text-slate-400 self-center ml-1">
                    Verificado: {new Date(card.lastVerifiedAt).toLocaleString('es')}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* --- Diálogo: confirmación desconexión Baileys --- */}
      <Dialog open={confirmBaileys} onOpenChange={setConfirmBaileys}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desconectar la sesión de WhatsApp</DialogTitle>
            <DialogDescription>
              El CRM dejará de recibir y enviar mensajes por esta sesión QR. Podrás reconectarla escaneando un nuevo QR.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBaileys(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => void handleDisconnectBaileys()} disabled={actionLoading !== null}>
              {actionLoading === 'baileys-disconnect' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Unplug className="w-4 h-4 mr-2" />}
              Sí, desconectar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Diálogos: doble confirmación desconexión Cloud --- */}
      <Dialog open={confirmCloudFirst !== null} onOpenChange={(o) => { if (!o) setConfirmCloudFirst(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desconectar {confirmCloudFirst?.subtitle ?? 'el número'}</DialogTitle>
            <DialogDescription>
              Se destruirá el token cifrado de esta conexión y dejará de operar. Esta acción queda registrada en el historial de eventos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCloudFirst(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => { setConfirmCloudSecond(confirmCloudFirst); setConfirmCloudFirst(null) }}>
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmCloudSecond !== null} onOpenChange={(o) => { if (!o) setConfirmCloudSecond(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmación final</DialogTitle>
            <DialogDescription>
              ¿Seguro que quieres desconectar <strong>{confirmCloudSecond?.subtitle}</strong>? Los mensajes en cola de esta conexión no se enviarán.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCloudSecond(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => confirmCloudSecond && void handleDisconnectCloud(confirmCloudSecond.id)}
              disabled={actionLoading !== null}
            >
              {actionLoading === `disconnect-${confirmCloudSecond?.id}` ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Sí, desconectar definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Diálogo: alta de conexión Cloud API --- */}
      <Dialog open={showAddCloud} onOpenChange={setShowAddCloud}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar número de WhatsApp Cloud API</DialogTitle>
            <DialogDescription>
              Introduce el phoneNumberId y el token de acceso de Meta Business. El token se valida contra Graph API,
              se cifra (AES-256-GCM) y queda asociado exclusivamente a esta organización.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="cloud-phone-number-id">phoneNumberId</Label>
              <Input
                id="cloud-phone-number-id"
                placeholder="Ej. 123456789012345"
                value={cloudForm.phoneNumberId}
                onChange={(e) => setCloudForm((f) => ({ ...f, phoneNumberId: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cloud-access-token">Token de acceso (se cifra al guardar)</Label>
              <Input
                id="cloud-access-token"
                type="password"
                placeholder="EAAG..."
                value={cloudForm.accessToken}
                onChange={(e) => setCloudForm((f) => ({ ...f, accessToken: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cloud-display-name">Nombre visible (opcional)</Label>
              <Input
                id="cloud-display-name"
                placeholder="Ej. Ventas ALBRA"
                value={cloudForm.displayName}
                onChange={(e) => setCloudForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCloud(false)} disabled={actionLoading === 'cloud-add'}>
              <X className="w-4 h-4 mr-1.5" /> Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => void handleAddCloud()}
              disabled={actionLoading === 'cloud-add' || cloudForm.phoneNumberId.trim().length < 6 || cloudForm.accessToken.trim().length < 16}
            >
              {actionLoading === 'cloud-add' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Conectar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
