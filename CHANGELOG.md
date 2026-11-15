# CHANGELOG

## 2026-11-15 — Producción real: higiene, E2E de 3 servicios y B2 residual (rama repair/produccion-real)

### Corregido (cada ítem con su prueba ejecutada)
- **B2 residual — idempotencia del daemon Baileys:** `/send` del daemon leía solo `to`/`text` (ventana real de duplicación). Ahora reserva `idempotencyKey`/`X-Correlation-Id` en tabla aditiva `DaemonSendIdempotency` ANTES del envío: claves en curso → 409 IN_FLIGHT sin reenvío; lease vencido → 409 UNCERTAIN permanente (jamás reenvío automático); DONE responde el messageId original sin reenviar; FAILED permite reintento. Pruebas `tests/unit/daemon-idempotency.test.ts` (6, fallaban antes del fix, pasan después).
- **Higiene PII:** teléfonos reales del negocio/destinatario sustituidos por dummies 573000000001/2 en `worklog.md`, `handoff.mjs` y `handoff.test.ts` (45/45 en verde); contraseña demo ya no se versiona (`DEMO_PASSWORD` fail-fast en 2 scripts).
- **Artefactos retirados del árbol (38 archivos):** pids, logs, PDFs, capturas, backups y respuestas E2E viejos + `.gitignore` anti-reintroducción. Historial NO purgado (regla).
- **Versiones:** `engines.node >=22.12.0` + `.nvmrc` 22.14 (igual que WP/ULTRA; CI ya usaba Node 22).
- **Baseline de secretos del historial:** +319 pares (commit,huella) verificados uno a uno como fixtures dummy de test (0 secretos reales) → `security:scan` y `security:scan:history` en verde (exit 0).

### Pruebas y evidencia
- Suite: **736/736 (92 archivos)** · tsc 0 errores · eslint 0/0 · `npm audit` 0 vulnerabilidades.
- **E2E de los 3 servicios reales juntos** (`scripts/e2e-3-servicios.mjs`, 18/18 PASS, ALLOW_REAL_DISPATCH=false): webhook Meta firmado → CRM valida → puente → WP procesa → flujo ejecuta crm_action → CLIENTE creado en el CRM real; lock IN_FLOW_2A verificado en WP; campaña ULTRA con contacto con lock (LOCK_EXCLUDED), sin consentimiento (SKIPPED_NO_CONSENT) y válido (FAILED_FATAL por salvaguarda, jamás SENT; SENT=0).
- Studios probados en navegador real (Playwright/Chromium 11/11): Flow Studio carga, paleta 7 nodos, addNode añade nodo al lienzo (nodos 8→9), Campaign Studio con Historial y métricas, vista móvil 390px sin desbordamiento.

### Límites honestos
- Docker compose NO se ejecutó (sin docker en el entorno de trabajo; tarea del PC en OWNER_TODO).
- El flujo E2E corre con servicios reales en simulación: ningún mensaje real, ninguna sesión Baileys conectada.

# CHANGELOG — Reparación Integral 2026-11-06

## [fix/reparacion-integral] CRM-ALBRA

### Seguridad
- **JWT-in-URL eliminado**: descargas directas con tickets de un solo uso (60 s, SHA-256) vía `POST /api/download-ticket` + `?ticket=`; `?token=` ya no autentica.
- Puente CRM→WhatsPower en **HMAC v2** (timestamp ligado al cuerpo) y stage-change con Bearer (los Stage Triggers morían en 401 silencioso).
- Lifecycle: rate limiting (login 10/min cuenta + 30/min IP; forgot 5/h; reset 10/h), resetToken **solo como SHA-256**, revocación de sesiones (cutoff `iat`) al cambiar contraseña, desactivar o degradar.
- 4 rutas daemon→CRM con comparación timing-safe; `handle()` mapea P2002→409 / P2025→404 y devuelve 500 genérico sin fuga de SQL.

### Tests
- 464 → **475 tests** (L1–L6: tickets, revocación, hasheo de reset, HMAC v2, rate limit). Scanner de secretos limpio.

## [fix/reparacion-integral] WHATSPOWER

### Seguridad
- `/qr` y `/qr/data` tras puerta Bearer (el QR de WhatsApp permitía secuestrar la sesión); visor reescrito como shell con clave en sessionStorage (jamás en URL).
- Webhook de pagos: `eventId` único + **idempotencia durable** (`payment_webhook_events`), validación `amount/currency/reference`, **máquina de estados legal** (terminales inmutables), auditoría completa (`payment_audit`), transición **atómica** (`BEGIN IMMEDIATE` + changes), simulator bloqueado en producción salvo decisión explícita.
- HMAC **v2** (`${ts}.${body}`) + rotación `actual|previo` + anti-replay **durable** (SQLite, sobrevive reinicios y multi-réplica).
- Servidor en `127.0.0.1` por defecto.

### Funcionalidad
- Flow Studio operativo tras el endurecimiento (puerta de clave + Bearer automático en `/api/*`).

### Tests
- 86 → **104 tests** (PAY-01..07, 7 negativas de pagos, QR-01..03, replay durable).

## [fix/reparacion-integral] WHATSPOWER-ULTRA

### Seguridad
- HMAC **v2 con secretos por organización** (`WEBHOOK_LEAD_SECRETS="org:sec|prev"`, org reservada `_legacy`); firma liga `org+timestamp+body` (cierra replay con ts fresco); huellas anti-replay por organización (sin colisión cross-org).
- Inyección cross-org cerrada: webhook-lead 403 si la campaña no pertenece a la org autenticada; el secreto v1 no puede ligar leads a campañas.
- Anti-replay **durable** (SQLite) sobrevive reinicios; `REPLAY_DB_PATH` para réplicas.

### Cola de despacho
- **Claim atómico** `PENDING→DISPATCHING` (UPDATE condicional + `claimed_by/claimed_at`): un ítem, un worker; fin del doble despacho concurrente.
- `reconcileStaleClaims()` controlado → `UNCERTAIN_DISPATCH` (nunca reintento ciego); `recoverFromCrash` solo toca claims stale; updates post-claim con guard `claimed_by` (multi-réplica).
- `PAUSED*` no despacha; idempotencia unificada con el importador CSV; `ALLOW_REAL_DISPATCH` con paridad en ambos adaptadores (la salvaguarda queda intacta).

### Funcionalidad
- Campaign Studio operativo (puerta de clave + Bearer automático); 5 rutas con body limitado (413); checkers 2A con Bearer (la integración anti-ban vuelve a funcionar).

### Tests
- 60 → **76 tests** (7 negativas HMAC obligatorias, ORG-WH-01..03, REPLAY-DUR-01, CLAIM-01..05).


## 2026-11-11/12 — Auditoría integral: ciclos 1 y 2 (rama impl/audit-20261111)

### Corregido
- Seguridad: rate limiting durable en BD; fail-closed de secretos; HMAC timing-safe;
  secretos Telegram cifrados con lookup por hash; JWT jamás en URLs de export; errores
  genéricos (sin filtrar e.message); P2002→409 / P2025→404.
- Fiabilidad: idempotencia extremo a extremo con eventId determinista; dedup de webhooks
  (waMessageId/mid) incl. statuses; liberación de dedup on-throw; transacciones atómicas
  (registro, conexiones con límite de plan, cliente+timeline); WAL + busy_timeout.
- Frontend (CRM): deep-links reales, reset de formulario corregido, TabsList wrap,
  JSON.parse blindado, vista /chat muerta eliminada.
- Pruebas: suites en verde al cierre de cada ciclo; pruebas nuevas para cada corrección
  (rate limit durable, dedup, dual-formato, release-on-throw, etc.).

### Rerequisito de despliegue
- Ejecutar `npx prisma migrate deploy` (incluye migración 4_audit_indexes con respaldo
  reversible) y `node scripts/migrate-telegram-secrets.mjs` (backfill idempotente).
- NO desplegar sin autorización expresa del propietario.
