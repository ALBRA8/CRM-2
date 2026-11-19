# CONTRATOS DEL ECOSISTEMA — CRM-ALBRA (fuente única de verdad)

**Versión**: 1.0 · **Fecha**: 2026-11-20 · **Tarea**: F7-T03 (I3) del PLAN DEFINITIVO CRM-ALBRA v2.0

Este documento consolida TODOS los contratos del CRM que estaban dispersos en
`docs/API_CONTRACT.md`, `docs/INTEGRATION_CONTRACT.md` y `docs/CONTRATO-WHATSAPP-ORG.md`.
Cada endpoint está documentado con su archivo real (la tabla se genera contra el código,
no a mano: el check de D4 revalida las cifras).

## Cómo leer este documento

- **Sesión (JWT)**: cookie httpOnly + `Authorization: Bearer`; el servidor resuelve
  `auth.orgId` del token. **Nunca** se acepta `organizationId` del body/query para autorizar.
- **Org-scoping**: toda query filtra por `organizationId`; recurso de otra org ⇒ **404** sin oráculo.
- **admin (JWT)**: requireAdmin (owner/admin/superadmin). **superadmin (JWT)**: plano de control (`/api/super/*`).
- **Capacidad RBAC**: requirePermission con la capacidad del módulo (p. ej. `automations.write`).
- **Firma HMAC**: webhook verificado timing-safe; rechazo 401. **Secreto interno**: Bearer de
  servidor a servidor (`INTERNAL_API_SECRET` / `INTERNAL_API_KEYS`).
- Mutaciones de negocio registran auditoría + timeline (`auditAndTimeline`) y disparan workflows.
- Errores: `{ error }` con 4xx/5xx; jamás detalles técnicos al cliente (catálogo accionable U3).

Referencias cruzadas: convenciones de respuesta y estilo → `docs/API_CONTRACT.md` ·
contrato cross-repo HMAC v2 y anti-replay → `docs/INTEGRATION_CONTRACT.md` ·
daemon Baileys multi-org → `docs/CONTRATO-WHATSAPP-ORG.md`.

## Operación, administración y plataforma (19 rutas)

| Ruta | Métodos | Protección |
| --- | --- | --- |
| `/activity` — `src/app/api/activity/route.ts` | GET | sesión (JWT) |
| `/admin/outbox/uncertain` — `src/app/api/admin/outbox/uncertain/route.ts` | GET | admin (JWT) |
| `/admin/outbox/uncertain/reconcile` — `src/app/api/admin/outbox/uncertain/reconcile/route.ts` | POST | admin (JWT) |
| `/backup` — `src/app/api/backup/route.ts` | GET,POST | capacidad RBAC |
| `/cron/run` — `src/app/api/cron/run/route.ts` | POST | sesión (JWT) |
| `/dashboard` — `src/app/api/dashboard/route.ts` | GET | sesión (JWT) |
| `/doctor` — `src/app/api/doctor/route.ts` | GET | admin (JWT) + secreto interno |
| `/health` — `src/app/api/health/route.ts` | GET | público controlado |
| `/internal/channel-outbox` — `src/app/api/internal/channel-outbox/route.ts` | GET,POST | público controlado |
| `/internal/channel-outbox/reconcile` — `src/app/api/internal/channel-outbox/reconcile/route.ts` | POST | público controlado |
| `/internal/whatsapp/credentials` — `src/app/api/internal/whatsapp/credentials/route.ts` | GET | secreto interno + secreto por-org |
| `/internal/workflow-outbox` — `src/app/api/internal/workflow-outbox/route.ts` | GET,POST | público controlado |
| `/settings` — `src/app/api/settings/route.ts` | GET,PUT,DELETE | admin (JWT) |
| `/settings/api-keys` — `src/app/api/settings/api-keys/route.ts` | GET,POST | admin (JWT) |
| `/settings/api-keys/[id]` — `src/app/api/settings/api-keys/[id]/route.ts` | DELETE | admin (JWT) |
| `/super/overview` — `src/app/api/super/overview/route.ts` | GET | superadmin (JWT) + secreto interno |
| `/super/switch-organization` — `src/app/api/super/switch-organization/route.ts` | POST | superadmin (JWT) |
| `/team` — `src/app/api/team/route.ts` | GET,POST | admin (JWT) |
| `/team/[id]` — `src/app/api/team/[id]/route.ts` | PUT,DELETE | admin (JWT) |

## Sugerencias, memoria, MCP y notificaciones (11 rutas)

| Ruta | Métodos | Protección |
| --- | --- | --- |
| `/agent-general/status` — `src/app/api/agent-general/status/route.ts` | GET | sesión (JWT) |
| `/crm/actions` — `src/app/api/crm/actions/route.ts` | GET,POST | sesión (JWT) |
| `/mcp` — `src/app/api/mcp/route.ts` | POST,GET,DELETE | público controlado |
| `/memory` — `src/app/api/memory/route.ts` | GET,POST | sesión (JWT) |
| `/memory/vector` — `src/app/api/memory/vector/route.ts` | GET,POST | sesión (JWT) |
| `/notifications` — `src/app/api/notifications/route.ts` | GET,POST | sesión (JWT) |
| `/notifications/[id]` — `src/app/api/notifications/[id]/route.ts` | PUT,DELETE | sesión (JWT) |
| `/notifications/all` — `src/app/api/notifications/all/route.ts` | DELETE | capacidad RBAC |
| `/notifications/read-all` — `src/app/api/notifications/read-all/route.ts` | PUT | sesión (JWT) |
| `/suggestions` — `src/app/api/suggestions/route.ts` | GET | sesión (JWT) |
| `/suggestions/corrections` — `src/app/api/suggestions/corrections/route.ts` | POST | sesión (JWT) |

## Authenticación y sesión (14 rutas)

| Ruta | Métodos | Protección |
| --- | --- | --- |
| `/auth/2fa/disable` — `src/app/api/auth/2fa/disable/route.ts` | POST | sesión (JWT) |
| `/auth/2fa/enable` — `src/app/api/auth/2fa/enable/route.ts` | POST | sesión (JWT) |
| `/auth/2fa/setup` — `src/app/api/auth/2fa/setup/route.ts` | POST | sesión (JWT) |
| `/auth/2fa/status` — `src/app/api/auth/2fa/status/route.ts` | GET | sesión (JWT) |
| `/auth/2fa/verify` — `src/app/api/auth/2fa/verify/route.ts` | POST | público controlado |
| `/auth/demo` — `src/app/api/auth/demo/route.ts` | POST | público controlado |
| `/auth/ecosystem/links` — `src/app/api/auth/ecosystem/links/route.ts` | GET | sesión (JWT) |
| `/auth/forgot-password` — `src/app/api/auth/forgot-password/route.ts` | POST | público controlado |
| `/auth/login` — `src/app/api/auth/login/route.ts` | POST | público controlado |
| `/auth/logout` — `src/app/api/auth/logout/route.ts` | POST | público controlado |
| `/auth/me` — `src/app/api/auth/me/route.ts` | GET | sesión (JWT) |
| `/auth/register` — `src/app/api/auth/register/route.ts` | POST | público controlado |
| `/auth/reset-password` — `src/app/api/auth/reset-password/route.ts` | POST | público controlado |
| `/permissions` — `src/app/api/permissions/route.ts` | GET | sesión (JWT) + capacidad RBAC |

## Automatizaciones, workflows y conocimiento IA (7 rutas)

| Ruta | Métodos | Protección |
| --- | --- | --- |
| `/automations` — `src/app/api/automations/route.ts` | GET,POST | sesión (JWT) + capacidad RBAC |
| `/automations/[id]` — `src/app/api/automations/[id]/route.ts` | PUT,DELETE | capacidad RBAC |
| `/automations/run` — `src/app/api/automations/run/route.ts` | POST | capacidad RBAC |
| `/knowledge` — `src/app/api/knowledge/route.ts` | GET,POST | admin (JWT) |
| `/knowledge/[id]` — `src/app/api/knowledge/[id]/route.ts` | GET,PUT,DELETE | admin (JWT) |
| `/templates` — `src/app/api/templates/route.ts` | GET,POST | sesión (JWT) + capacidad RBAC |
| `/templates/[id]` — `src/app/api/templates/[id]/route.ts` | PUT,DELETE | capacidad RBAC |

## Clientes y ficha 360 (6 rutas)

| Ruta | Métodos | Protección |
| --- | --- | --- |
| `/clients` — `src/app/api/clients/route.ts` | GET,POST | sesión (JWT) |
| `/clients/[id]` — `src/app/api/clients/[id]/route.ts` | GET,PUT,DELETE | sesión (JWT) |
| `/clients/[id]/history` — `src/app/api/clients/[id]/history/route.ts` | GET,POST | sesión (JWT) |
| `/clients/[id]/preferences` — `src/app/api/clients/[id]/preferences/route.ts` | GET,PUT | sesión (JWT) |
| `/custom-fields` — `src/app/api/custom-fields/route.ts` | GET,POST | admin (JWT) |
| `/saved-views` — `src/app/api/saved-views/route.ts` | GET,POST | sesión (JWT) |

## Integraciones (Google, CSV, push, nicho) (20 rutas)

| Ruta | Métodos | Protección |
| --- | --- | --- |
| `` — `src/app/api/route.ts` | GET | público controlado |
| `/custom-fields/[id]` — `src/app/api/custom-fields/[id]/route.ts` | PUT,DELETE | admin (JWT) |
| `/custom-fields/values` — `src/app/api/custom-fields/values/route.ts` | GET,POST | sesión (JWT) |
| `/email/send` — `src/app/api/email/send/route.ts` | POST | sesión (JWT) |
| `/export/csv` — `src/app/api/export/csv/route.ts` | GET | capacidad RBAC |
| `/google/auth` — `src/app/api/google/auth/route.ts` | GET | capacidad RBAC + firma HMAC |
| `/google/calendar/events` — `src/app/api/google/calendar/events/route.ts` | GET,POST | sesión (JWT) |
| `/google/config` — `src/app/api/google/config/route.ts` | GET,PUT,DELETE | admin (JWT) |
| `/google/disconnect` — `src/app/api/google/disconnect/route.ts` | POST | admin (JWT) |
| `/google/gmail/send` — `src/app/api/google/gmail/send/route.ts` | POST | sesión (JWT) |
| `/google/sheets/read` — `src/app/api/google/sheets/read/route.ts` | POST | capacidad RBAC |
| `/import/csv` — `src/app/api/import/csv/route.ts` | POST | capacidad RBAC |
| `/nicho` — `src/app/api/nicho/route.ts` | GET,PUT | admin (JWT) |
| `/push/subscribe` — `src/app/api/push/subscribe/route.ts` | POST | sesión (JWT) |
| `/push/unsubscribe` — `src/app/api/push/unsubscribe/route.ts` | POST | sesión (JWT) |
| `/push/vapid` — `src/app/api/push/vapid/route.ts` | GET | público controlado |
| `/reports` — `src/app/api/reports/route.ts` | GET | capacidad RBAC |
| `/reports/excel` — `src/app/api/reports/excel/route.ts` | GET | capacidad RBAC |
| `/reports/pdf` — `src/app/api/reports/pdf/route.ts` | GET | capacidad RBAC |
| `/saved-views/[id]` — `src/app/api/saved-views/[id]/route.ts` | PUT,DELETE | sesión (JWT) |

## Agenda y transacciones (4 rutas)

| Ruta | Métodos | Protección |
| --- | --- | --- |
| `/download-ticket` — `src/app/api/download-ticket/route.ts` | POST | sesión (JWT) |
| `/reservations` — `src/app/api/reservations/route.ts` | GET,POST | sesión (JWT) |
| `/reservations/[id]` — `src/app/api/reservations/[id]/route.ts` | PUT,DELETE | sesión (JWT) |
| `/transactions` — `src/app/api/transactions/route.ts` | GET,POST | sesión (JWT) |

## Otros canales (Telegram, Instagram, Messenger, TikTok) (22 rutas)

| Ruta | Métodos | Protección |
| --- | --- | --- |
| `/facebook/config` — `src/app/api/facebook/config/route.ts` | GET,PUT,DELETE | admin (JWT) |
| `/facebook/oauth/callback` — `src/app/api/facebook/oauth/callback/route.ts` | GET | admin (JWT) |
| `/facebook/oauth/start` — `src/app/api/facebook/oauth/start/route.ts` | GET,POST | admin (JWT) |
| `/facebook/send` — `src/app/api/facebook/send/route.ts` | POST | sesión (JWT) |
| `/facebook/webhook` — `src/app/api/facebook/webhook/route.ts` | GET,POST | firma HMAC |
| `/instagram/config` — `src/app/api/instagram/config/route.ts` | GET,PUT,DELETE | admin (JWT) |
| `/instagram/connections` — `src/app/api/instagram/connections/route.ts` | GET,POST | admin (JWT) |
| `/instagram/conversations` — `src/app/api/instagram/conversations/route.ts` | GET | sesión (JWT) |
| `/instagram/conversations/[id]` — `src/app/api/instagram/conversations/[id]/route.ts` | GET,PUT | sesión (JWT) |
| `/instagram/oauth/callback` — `src/app/api/instagram/oauth/callback/route.ts` | GET | admin (JWT) + firma HMAC |
| `/instagram/oauth/start` — `src/app/api/instagram/oauth/start/route.ts` | GET | admin (JWT) |
| `/instagram/send` — `src/app/api/instagram/send/route.ts` | POST | sesión (JWT) |
| `/instagram/webhook` — `src/app/api/instagram/webhook/route.ts` | GET,POST | firma HMAC |
| `/telegram/config` — `src/app/api/telegram/config/route.ts` | GET,PUT,DELETE | admin (JWT) + secreto Telegram |
| `/telegram/send` — `src/app/api/telegram/send/route.ts` | POST | sesión (JWT) |
| `/telegram/set-webhook` — `src/app/api/telegram/set-webhook/route.ts` | POST | admin (JWT) |
| `/telegram/webhook` — `src/app/api/telegram/webhook/route.ts` | POST | secreto Telegram |
| `/tiktok/config` — `src/app/api/tiktok/config/route.ts` | GET,PUT,DELETE | admin (JWT) |
| `/tiktok/oauth/callback` — `src/app/api/tiktok/oauth/callback/route.ts` | GET | admin (JWT) + firma HMAC |
| `/tiktok/oauth/start` — `src/app/api/tiktok/oauth/start/route.ts` | GET | admin (JWT) |
| `/tiktok/send` — `src/app/api/tiktok/send/route.ts` | POST | sesión (JWT) |
| `/tiktok/webhook` — `src/app/api/tiktok/webhook/route.ts` | GET,POST | público controlado |

## Bandeja omnicanal (3 rutas)

| Ruta | Métodos | Protección |
| --- | --- | --- |
| `/inbox` — `src/app/api/inbox/route.ts` | GET | sesión (JWT) |
| `/inbox/send` — `src/app/api/inbox/send/route.ts` | POST | sesión (JWT) |
| `/timeline` — `src/app/api/timeline/route.ts` | GET | sesión (JWT) |

## Ventas (oportunidades, cotizaciones, servicios) (8 rutas)

| Ruta | Métodos | Protección |
| --- | --- | --- |
| `/opportunities` — `src/app/api/opportunities/route.ts` | GET,POST | sesión (JWT) |
| `/opportunities/[id]` — `src/app/api/opportunities/[id]/route.ts` | GET,PUT | sesión (JWT) |
| `/opportunities/[id]/ai-suggest` — `src/app/api/opportunities/[id]/ai-suggest/route.ts` | POST | sesión (JWT) |
| `/pipeline` — `src/app/api/pipeline/route.ts` | GET | sesión (JWT) |
| `/quotes` — `src/app/api/quotes/route.ts` | GET,POST | sesión (JWT) |
| `/quotes/[id]` — `src/app/api/quotes/[id]/route.ts` | GET,PUT,DELETE | sesión (JWT) |
| `/quotes/pdf` — `src/app/api/quotes/pdf/route.ts` | GET | sesión (JWT) |
| `/services` — `src/app/api/services/route.ts` | GET,POST,PUT,DELETE | admin (JWT) |

## WhatsApp (conexiones, envío, agente) (11 rutas)

| Ruta | Métodos | Protección |
| --- | --- | --- |
| `/whatsapp/auto-reply` — `src/app/api/whatsapp/auto-reply/route.ts` | POST | secreto interno |
| `/whatsapp/config` — `src/app/api/whatsapp/config/route.ts` | GET,PUT | admin (JWT) |
| `/whatsapp/connections` — `src/app/api/whatsapp/connections/route.ts` | GET,POST | sesión (JWT) |
| `/whatsapp/connections/[id]` — `src/app/api/whatsapp/connections/[id]/route.ts` | GET,DELETE | sesión (JWT) |
| `/whatsapp/connections/[id]/verify` — `src/app/api/whatsapp/connections/[id]/verify/route.ts` | POST | sesión (JWT) |
| `/whatsapp/daemon-proxy` — `src/app/api/whatsapp/daemon-proxy/route.ts` | GET,POST,PUT | sesión (JWT) + capacidad RBAC + secreto interno |
| `/whatsapp/describe-image` — `src/app/api/whatsapp/describe-image/route.ts` | POST | secreto interno |
| `/whatsapp/embedded-signup` — `src/app/api/whatsapp/embedded-signup/route.ts` | GET,POST | sesión (JWT) |
| `/whatsapp/handoff` — `src/app/api/whatsapp/handoff/route.ts` | POST | secreto interno |
| `/whatsapp/transcribe` — `src/app/api/whatsapp/transcribe/route.ts` | POST | secreto interno |
| `/whatsapp/webhook` — `src/app/api/whatsapp/webhook/route.ts` | GET,POST | firma HMAC |

**Total: 125 rutas** (inventario real; verificado por `scripts/verify-doc-figures.mjs`, tarea D4).

## Contratos internos de servicio (server-to-server)

| Contrato | Mecanismo | Implementación |
| --- | --- | --- |
| Worker → outbox de canales | `POST /api/internal/channel-outbox` con `Authorization: Bearer <INTERNAL_API_SECRET>`; bandera `CHANNEL_OUTBOUND_DISPATCH_ENABLED`; claim atómico; `unknown` jamás se reintenta sin evidencia | `src/app/api/internal/channel-outbox/route.ts`, `src/lib/channel-outbox.ts` |
| Worker → reconciliación UNCERTAIN | `POST /api/internal/channel-outbox/reconcile` con `providerChecked: true` + `providerMessageId` | `src/app/api/internal/channel-outbox/reconcile/route.ts` |
| App → daemon Baileys | `WHATSAPP_DAEMON_URL` (127.0.0.1:3002) con `Authorization: Bearer <INTERNAL_API_SECRET>`; sesiones por organización (P0.1); veredicto de sesión propio de la org | `src/app/api/whatsapp/daemon-proxy/route.ts`, `src/lib/whatsapp-session-verdict.ts` (veredicto P0.1) |
| App → outbox de workflows | `POST /api/internal/workflow-outbox` con secreto interno; lease y fencing del scheduler | `src/app/api/internal/workflow-outbox/route.ts`, `src/lib/workflow-outbox.ts` |
| Credenciales WhatsApp por org | `GET/POST /api/internal/whatsapp/credentials` con secreto interno; credenciales cifradas AES-256-GCM por organización | `src/app/api/internal/whatsapp/credentials/route.ts`, `src/lib/crypto.ts` |
| Webhook de leads (AGENTE-LEADS) | Firma HMAC con secreto por organización (`agentLeadsSecretEnc` en Integration): el secreto que valida vincula la org. **Endpoint pendiente en el CRM** (contrato definido; dependencia externa I4) | `prisma/schema.prisma` (Integration.agentLeadsSecretEnc) |
| Webhook WhatsApp (Baileys) | `POST /api/whatsapp/webhook` con secreto por org; idempotencia persistente del daemon | `src/app/api/whatsapp/webhook/route.ts` |
| Webhooks de canales | Telegram (secreto de cabecera), Meta (firma `X-Hub-Signature-256`) | `src/app/api/telegram/webhook/route.ts`, `src/app/api/instagram/webhook/route.ts`, `src/app/api/facebook/webhook/route.ts`, `src/app/api/tiktok/webhook/route.ts` |

## Contratos cross-repo (externos — WHATSPOWER 2A / ULTRA 2B)

La fuente completa es `docs/INTEGRATION_CONTRACT.md` v1.1.0 (HMAC v2 con timestamp
en la MAC, ventana ±300 s, anti-replay persistente, idempotencia `orgId::eventId`,
7 rechazos obligatorios). Resumen del lado CRM:

- **CRM → 2A** (`POST /api/inbound`): `X-Timestamp` + `X-Signature-SHA256 = v2=HMAC(secret, ts + "." + rawBody)`.
  Implementado en `src/lib/whatspower-bridge.ts`. La organización viaja en el payload; 2A la resuelve de la credencial.
- **CRM → 2B**: despacho vía adaptador daemon con gate `ALLOW_REAL_DISPATCH` (fail-closed; jamás activo en pruebas).
- **SSO espejado**: `src/lib/ecosystem-sso.ts` es espejo explícito del mismo módulo en 2A/2B — un cambio
  aquí exige la misma PR en los otros repos (ver matriz de trazabilidad D4).
- Las secciones de operación de WP/ULTRA son DEPENDENCIA EXTERNA: no se ejecutan desde este repositorio.

## Contrato del daemon Baileys (resumen operativo)

Fuente completa: `docs/CONTRATO-WHATSAPP-ORG.md`. Puntos que afectan a los endpoints de arriba:

- Una sesión por organización (`orgId`); el estado QR/conectado de la org NUNCA mezcla sesiones ajenas (P0.1).
- Puerto 3002, escucha solo en 127.0.0.1, autenticación con secreto interno (`timingSafeEqual`).
- La UI de conexiones (F2) consume `/api/whatsapp/connections` y el proxy del daemon;
  la conciliación UNCERTAIN (M8) consume `/api/admin/outbox/uncertain*`.

## Invariantes de seguridad transversales

1. El `organizationId` SIEMPRE viene de la credencial verificada; jamás del cliente.
2. Secretos cifrados con `encryptSecret()` (AES-256-GCM); en la UI solo booleans de configurado.
3. Webhooks: firma timing-safe + idempotencia; sin firma válida ⇒ 401 sin oráculo.
4. Cuerpo máx. 1 MB; rate limiting por ruta; 5xx con mensaje genérico al cliente.
5. Denylist PII con HMAC-SHA256 y pepper `PII_PEPPER` (obligatorio en CI, tarea S5).

---
Historial: 1.0 (2026-11-20) — consolidación inicial (I3); tabla generada contra el código.
Este documento se actualiza en cada PR que toca `src/app/api/**`; el check de D4 vigila sus cifras.

