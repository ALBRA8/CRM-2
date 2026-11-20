# Unidades systemd del CRM — instalación y prueba de recuperación (O4)

**Tarea:** O4 (plan definitivo F6-T06, MODIFICADA: CRM + daemon — MEJORA OPCIONAL, ejecutada)
**Fecha:** 2026-11-20 · **Estado:** unidades listas · kill-test = acción del propietario (systemd no corre en el sandbox)

Unidades incluidas:

| Unidad | Proceso | Puerto | Reinicio |
| --- | --- | --- | --- |
| `crm-app.service` | Next standalone (`scripts/start-standalone.mjs`) | 3000 | `on-failure` (10 s) |
| `crm-daemon.service` | Daemon Baileys multi-org (`src/whatsapp-daemon/daemon.mjs`) | 3002 (solo 127.0.0.1) | `always` (10 s) |
| `crm-outbox-worker.service` | Worker pull de outboxes (`scripts/outbox-worker.mjs`) | — (cliente HTTP del CRM) | `on-failure` (10 s) |
| `crm-outbox-monitor.service` + `.timer` | Chequeo de salud cada 10 min (`scripts/monitor-outbox.mjs`) | — | oneshot + timer `Persistent=false` |

## 1. Requisitos previos

1. Repo desplegado en `/opt/crm` (propietario: `scripts/instalar-crm.sh` de O3 lo hace idempotente) y `npm run build` ejecutado.
2. Usuario del servicio creado: `sudo useradd -r -s /usr/sbin/nologin crm` y dueño de `/opt/crm` (`chown -R crm:crm /opt/crm`).
3. `/etc/crm/crm.env` = el `.env` REAL del servicio (copiar del `.env` validado, permisos `0600 root:crm`). Variables añadidas por O4:
   - `BASE_URL="http://127.0.0.1:3000"` (el worker habla con el CRM por loopback)
   - `CHANNEL_OUTBOX_WORKER_SECRET` y `WORKFLOW_OUTBOX_WORKER_SECRET` (los MISMOS valores que en el servidor; mínimo 32)
   - Kill-switches según política del dueño: `CHANNEL_OUTBOUND_DISPATCH_ENABLED`, `WORKFLOW_OUTBOX_DISPATCH_ENABLED` (`true` solo cuando el propietario autorice envíos reales)
   - `OUTBOX_WORKER_INTERVAL_MS` (default 15000) y `OUTBOX_WORKER_LIMIT` (1..5)
   - `OUTBOX_MONITOR_BASE_URL` + `OUTBOX_ALERT_WEBHOOK_URL` para el monitor (webhook de alerta; sin él el fallo queda en journald)
4. La sesión WhatsApp (`/opt/crm/.wa-auth`) con permisos `0700 crm:crm` — ya cubierta por el backup nocturno (RUNBOOK §backups).

## 2. Instalación

```bash
sudo cp deploy/systemd/*.service deploy/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now crm-app.service crm-daemon.service crm-outbox-worker.service crm-outbox-monitor.timer
systemctl status crm-app crm-daemon crm-outbox-worker crm-outbox-monitor.timer --no-pager
```

## 3. PRUEBA DE RECUPERACIÓN (kill test — evidencia que exige O4)

Ejecutar cada uno y anotar la hora; el servicio debe volver solo en ~10 s y
el estado del daemon (Salud en el CRM) debe reflejar la reconexión:

```bash
sudo systemctl kill --signal=SIGKILL crm-app.service          # app cae → Restart=on-failure
sudo systemctl kill --signal=SIGKILL crm-daemon.service       # daemon cae → Restart=always (sesión Baileys se recupera del disco)
sudo systemctl kill --signal=SIGKILL crm-outbox-worker.service# worker cae → Restart=on-failure
journalctl -u crm-daemon.service -n 20 --no-pager             # evidencia del reinicio
```

**Acta del kill test** (fill-in): fecha/hora × 3 unidades, `systemctl status` y
`journalctl` pegados en `docs/actas/` — queda como pendiente del propietario
(junto con A8, el drill de backup) porque systemd no existe en el sandbox.

## 4. Desactivación / reversión

```bash
sudo systemctl disable --now crm-outbox-monitor.timer crm-outbox-worker.service crm-daemon.service crm-app.service
sudo rm /etc/systemd/system/crm-*.service /etc/systemd/system/crm-outbox-monitor.timer && sudo systemctl daemon-reload
```

El sistema vuelve al arranque manual sin pérdida de datos (las colas de la
outbox son durables en SQLite: nada se pierde mientras nadie despache).

## 5. Ruido de alertas

El umbral vive en el evaluador (`scripts/monitor-outbox.mjs`: envejecimiento
>10 min, desconocidos/fallidos → alerta). Para reducir ruido: ajustar el
webhook de alerta (Slack/Telegram del dueño) o el timer (10→30 min). El
monitor jamás imprime cuerpos de mensajes ni credenciales (solo contadores).
