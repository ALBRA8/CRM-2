# RUNBOOK DEL CRM — Operación sin desarrollador (O2)

**Versión**: 1.0 · **2026-11-20** · Tarea F6-T05 (O2, MODIFICADA) del PLAN DEFINITIVO CRM-ALBRA v2.0

Documento ÚNICO para arrancar, supervisar, respaldar, actualizar y restaurar el CRM.
Los lectores previstos son operadores no desarrolladores: cada sección dice **qué hacer**,
**cómo comprobar que salió bien** y **qué hacer si sale mal**.

> Las secciones de operación de WHATSPOWER (2A) y WHATSPOWER-ULTRA (2B) son
> **DEPENDENCIA EXTERNA**: se operan en sus propios repos. Aquí solo está el CRM
> (Capa 0) y su daemon de WhatsApp.

---

## 1. Qué corre (mapa de procesos)

| Proceso | Puerto | Qué es | Cómo se arranca |
| --- | --- | --- | --- |
| **App CRM** | 3000 | Next.js (la web y la API) | `npm start` (producción) o `docker compose up -d` |
| **Daemon WhatsApp** | 3002 | Baileys: QR, envío y recepción por organización | `npm run wa:daemon` (primer plano) o `npm run wa:daemon:detached` (log: `daemon.log`) |
| **Worker de outbox de canales** | — | Empuja la cola de envíos → los mensajes salen solos | Ver §4 (A7 pendiente en tu despliegue) |
| **SQLite** | archivo | `db/*.db` (o volumen Docker `crm-albra_db-data`) | — |

Reglas de oro:

1. El daemon escucha SOLO en `127.0.0.1:3002` con secreto interno. Nunca exponerlo a internet.
2. Los cambios de configuración viven en `.env` — jamás se sobrescribe con una actualización (ver §6).
3. Antes de cualquier actualización: **backup primero** (§5).

---

## 2. Arranque en frío (paso a paso)

Sin Docker (método del instalador):

```bash
cd /opt/crm-albra
./scripts/instalar-crm.sh            # si es la primera vez: crea .env desde .env.example
#  → completa .env (APP_SECRET, APP_ENCRYPTION_KEY, INTERNAL_API_SECRET, PII_PEPPER…) con `openssl rand -hex 32`
npm start &                          # app en :3000 (o PM2/systemd según tu máquina)
npm run wa:daemon:detached           # daemon en :3002, sobrevive al cierre de sesión
```

Con Docker (ver `DEPLOY.md` §1–4 para la instalación inicial):

```bash
cd /opt/crm-albra
docker compose up -d
docker compose ps                    # ambos contenedores "healthy"
```

**Verificación** (las dos deben responder):

```bash
curl -fsS http://localhost:3000/api/health    # estado de la app
curl -fsS http://localhost:3002/status -H "Authorization: Bearer $INTERNAL_API_SECRET"
```

---

## 3. Diagnóstico: la pantalla de Salud

Abre **Salud** en el menú del CRM (owner/admin) o `/health`. El diagnóstico por
organización (`/api/doctor`) dice OK / Atención / Error por ítem y **qué hacer**
en cada caso: base de datos, esquema, secretos, daemon WhatsApp, agente IA,
memoria, automatizaciones y primer envío de canal.

- **Reintentar diagnóstico**: vuelve a ejecutar las comprobaciones.
- **Reparar** (solo aparece con ejecuciones atascadas): marca como fallidas las
  ejecuciones que quedaron a medias. No toca datos comerciales.
- Si un ítem queda en Atención y su acción sugerida no lo resuelve, mira el log
  de la app (`docker compose logs -f app` o el log de tu gestor de procesos).

---

## 4. Cola de envíos (outbox) y su worker

La cola de canales (WhatsApp/Instagram/Telegram/Messenger/TikTok) solo avanza
cuando un proceso llama a la API interna con su secreto:

1. Bandera de despacho real: `CHANNEL_OUTBOUND_DISPATCH_ENABLED` en `.env`
   (activa SOLO en la máquina con permiso para enviar).
2. Proceso que empuja la cola: `POST /api/internal/channel-outbox` con
   `Authorization: Bearer $INTERNAL_API_SECRET`, en bucle (cada pocos segundos).
   **En tu despliegue real este worker falta hasta ejecutar A7** — mientras no
   exista, los mensajes quedan `queued` y salen cuando se ejecute.
3. Monitor pasivo: `npm run ops:monitor-outbox` (también corre programado en
   GitHub Actions, `.github/workflows/outbox-monitor.yml`). Con umbral y
   severidades: `queued` viejos, `sending` estancados, `failed` crecientes.

**Comprobación semanal**: corre el monitor; debe salir sin alertas. Un `unknown`
jamás se reintenta solo: se concilia desde **Ajustes → Envíos** con la evidencia
del proveedor (§7).

---

## 5. Backups (la lección de oro)

Backup ANTES de tocar cualquier cosa. Herramientas del CRM:

```bash
# Backup Online (sin bloquear la app) + integrity_check:
node scripts/sqlite-backup.cjs

# Backup nocturno programado (cron: 3:00 todos los días):
#   0 3 * * * cd /opt/crm-albra && node scripts/sqlite-backup.cjs >> logs/backup.log 2>&1
bash scripts/backup-nightly.sh          # instala/muestra el cron si lo prefieres
```

Con Docker: los volúmenes `crm-albra_db-data` (BD) y `crm-albra_wa-auth`
(sesión WhatsApp) se respaldan con `docker run --rm -v … tar czf …` (DEPLOY.md §8).

**Restauración** (desde la copia más reciente):

```bash
# 1. Detén la app   2. Restaura el archivo .db de la copia   3. Arranca de nuevo
# 4. Verifica integridad: node scripts/sqlite-backup.cjs --verify  (o integrity_check)
```

**Drill trimestral obligatorio** (10 min, sin tocar la BD real):

```bash
bash scripts/backup-restore-drill.sh    # exit 0 = PASS
npm test -- backup-restore-roundtrip    # el test automatizado (E7) corrobora el roundtrip
```

Guarda el resultado (log + fecha) en tu registro de operación; el acta firmada
queda para A8.

---

## 6. Actualizar el CRM

Método sin Docker (idempotente, O3):

```bash
git pull
./scripts/instalar-crm.sh --actualizar
#  → respalda .env y *.db ANTES de tocar nada (backups/<fecha>), npm ci,
#    migraciones versionadas, build, validación /api/health, log en logs/instalar-crm.log
```

Método Docker:

```bash
git pull
docker compose up -d --build
docker compose logs -f app              # mira las migraciones del entrypoint
```

Si algo sale mal: `docker compose down` (o para la app), restaura el backup (§5),
`git checkout <commit-anterior>` y arranca. El runbook se actualiza en cada PR
de operación; si esta página no coincide con lo que ves, manda la versión exacta
(`git log -1`) al soporte.

---

## 7. Emergencias

| Síntoma | Primera acción | Si no se resuelve |
| --- | --- | --- |
| App no responde en :3000 | `curl http://localhost:3000/api/health`; mira el log de arranque | Reinicia el proceso; restaura backup si el log apunta a BD |
| Mensajes que no salen (quedan `queued`) | Verifica `CHANNEL_OUTBOUND_DISPATCH_ENABLED` y que el worker corre (§4) | Corre el monitor y pega su salida al soporte |
| WhatsApp desconectado | **Salud** → WhatsApp → «Conectar un número» (QR nueva) | Si la sesión quedó vinculada a otra organización, avisa al admin de la plataforma |
| Mensaje en estado incierto | **Ajustes → Envíos**: confirma con la lista del proveedor y aplica la conciliación (sin SQL) | Nada: jamás reenvíes a mano desde el proveedor antes de conciliar |
| Ejecuciones atascadas | **Salud** → botón «Reparar» | Si vuelve a pasar, anota la fecha y avisa soporte |
| Base de datos corrupta | Detén la app; restaura la copia más reciente (§5); verifica integridad | Revisa el log del restore antes de arrancar |
| Olvido de contraseña | Usa «¿Olvidaste tu contraseña?» en la pantalla de entrada | El dueño puede resetearla desde Equipo |
| Sospecha de acceso indebido | Cambia secretos (.env) y revisa **Actividad** (auditoría) | Notifica de inmediato; el historial de auditoría es la evidencia |

Contacto de emergencia: registra aquí el teléfono/canal de soporte acordado antes
de poner el sistema en producción (`OWNER_TODO` · pendiente del propietario).

---

## 8. Dependencia externa (fuera de este runbook)

- **WhatsPower (2A)** y **WhatsPower-Ultra (2B)**: se arrancan, supervisan y
  respaldan en sus propios repos. El CRM solo les emite enlaces SSO de un uso y
  firma los puentes HMAC v2 (`docs/INTEGRATION_CONTRACT.md`).
- El botón **Ecosistema** del menú abre ambas capas con sesión de operador; si
  aparecen deshabilitadas, faltan `ECOSYSTEM_SSO_SECRET` y/o las URLs en `.env`.

---

## 9. Checklist de puesta en marcha (una sola vez)

1. ☐ `.env` completo con secretos de 32+ caracteres (`openssl rand -hex 32`)
2. ☐ App en :3000 y daemon en :3002 (§2) — ambos responden
3. ☐ Primer número de WhatsApp conectado (**Ajustes → Canales → Números WA**)
4. ☐ Agente IA configurado (**Ajustes → Inteligencia → IA del CRM**)
5. ☐ Primer envío de prueba sale de la cola (§4 / **Salud** → wizard)
6. ☐ Backup nocturno programado (§5) y drill hecho con acta
7. ☐ Monitor de outbox programado (§4)
8. ☐ `CHANNEL_OUTBOUND_DISPATCH_ENABLED` activa SOLO en la máquina autorizada

El wizard de puesta en marcha del CRM (dashboard o **Salud**) marca 1–5 solo
cuando están hechos de verdad.
