# CHANGELOG — Ecosistema ALBRA

## [repair/produccion-real] 2026-11-15 (sesión sandbox) — Verificación total, E2E de 3 servicios y B2 residual

### Corregido (con prueba que falla antes y pasa después)
- **B2 residual — idempotencia del daemon Baileys:** `/send` leía solo `to`/`text` (ventana real de duplicación). Ahora reserva `idempotencyKey`/`X-Correlation-Id` en tabla aditiva `DaemonSendIdempotency` ANTES del envío: en curso → 409 IN_FLIGHT; lease vencido → 409 UNCERTAIN (jamás reenvío automático); DONE responde messageId original; FAILED permite reintento. 6 pruebas nuevas (`tests/unit/daemon-idempotency.test.ts`).
- **Escáner de historial en verde:** +319 pares (commit,huella) verificados uno a uno como fixtures dummy (0 secretos reales).
- **Artefactos retirados del árbol (38 archivos):** pids, logs, PDFs, capturas, backups + `.gitignore` anti-reintroducción. Historial sin purgar (regla).
- **Credenciales demo:** ya no se versionan (`DEMO_PASSWORD` fail-fast).

### Verificación ejecutada
- Suite **736/736 (92 archivos)** · tsc 0 · eslint 0/0 · `npm audit` 0 vulnerabilidades · `security:scan[:history]` exit 0.
- **E2E de los 3 servicios reales juntos** (`scripts/e2e-3-servicios.mjs`, 18/18 PASS): webhook Meta firmado → CRM → puente → WP flujo → crm_action → cliente creado en CRM real; lock IN_FLOW_2A; campaña ULTRA: LOCK_EXCLUDED / SKIPPED_NO_CONSENT / salvaguarda con SENT=0.
- Studios en navegador real (Playwright 11/11): addNode funcional en Flow Studio, Historial y métricas en Campaign Studio, móvil 390px sin desbordamiento.

## [repair/produccion-real] 2026-11-15 — Preparación para Producción Real

### Fase 1 — Canal Oficial de WhatsApp
- **Meta Cloud API por defecto:** Integración de Meta Cloud API como transporte principal para organizaciones de pago.
- **Ventana de 24 horas y Plantillas:** Control estricto de la ventana de 24 horas (`MessagingWindowStore`) y bloqueo de envíos fuera de ventana sin plantilla aprobada.
- **Clasificación de Errores Meta:** Clasificación explícita de errores (límites, calidad de número, plantilla rechazada) y aislamiento de estados `UNCERTAIN` sin reintentos ciegos.

### Fase 2 — Consentimiento y Cumplimiento Normativo (Ley 1581)
- **Almacenamiento de Consentimiento:** Registro auditable de autorización previa por organización y teléfono (`consent_records` y `consent_audit_log`).
- **Validación JIT:** Bloqueo automático (`SKIPPED_NO_CONSENT`) para cualquier contacto sin consentimiento previo vigente.
- **Importación CSV:** Requisito obligatorio de columna `consent_origin` en importador de audiencias.
- **Bajas y Habeas Data:** Revocación automática de consentimiento ante bajas/STOP; endpoints `/api/compliance/contact-data` para exportación y borrado de datos.
- **Rastreo de Clics Seguro:** Validación estricta `TRUST_PROXY === 'true'` y almacenamiento de IP anonimizada con hash SHA-256 de 16 caracteres.

### Fase 3 — Estabilidad, Versiones y Operaciones
- **Alineación de Entorno:** Node aligned a `>=22.12.0` (engines), `.nvmrc` (`22.14.0`), Dockerfiles (`node:22-alpine`) y CI (`node-version: 22`).
- **Runner de Pruebas Multiplataforma:** `scripts/run-tests.mjs` en WHATSPOWER y ULTRA para evitar cuelgues por `--test-isolation=process` en Windows/Node 22+.
- **Observabilidad Operativa:** Endpoints `/api/health` ampliados con métricas de base de datos, colas, despachos y memoria.
- **Benchmark SQLite:** Capacidad validada de 70,914 inserts/s (batch) y 2,541 claims/s (cola), demostrando soporte para producción en nodo único sin requerir PostgreSQL.
- **Runbooks:** Guías operativas paso a paso en `WHATSPOWER/docs/RUNBOOK.md` y `WHATSPOWER-ULTRA/docs/RUNBOOK.md`.

### Fase 4 — Higiene y Sanitización
- Purgados todos los datos personales sensibles (teléfonos reales, nombres) de CONTEXT, fichas, scripts y tests.
- Retiradas afirmaciones engañosas de paridad 100% ManyChat/WhatsOn.
- Exclusión de binarios residuales, logs y dumps en `.gitignore`.

### Fase 5 — Calidad y Verificación
- TypeScript compilation: 0 errores en CRM-ALBRA, WHATSPOWER y WHATSPOWER-ULTRA.
- Suites de pruebas: 250/250 en WHATSPOWER y 194/194 en WHATSPOWER-ULTRA superadas al 100%.

---

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
