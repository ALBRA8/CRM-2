# CONTEXTO DEL SISTEMA CRM-ALBRA & ECOSISTEMA UNIFICADO

## 1. Visión General del Producto Multi-Nivel ALBRA

El ecosistema ALBRA opera como un producto SaaS unificado de 3 capas para gestión comercial, automatización y marketing conversacional:

- **Capa 1: CRM-ALBRA (Núcleo Operativo y Multi-Tenant)**
  - Next.js 16 + React 19 + Prisma + SQLite (`custom.db`).
  - Autenticación segura (Argon2id, MFA/TOTP, rate limiting persistente, tokens hasheados con SHA-256).
  - Outbox transaccional multicanal (`channel_outbox`) con reconciliación idempotente.
  - Conexiones de canales oficiales (`channel_connections`) con cifrado de tokens en reposo (`aes-256-gcm`).
  - Daemon Baileys local (`daemon.mjs`) como fallback de desarrollo o plan básico con advertencia explícita.

- **Capa 2A: WHATSPOWER (Chatbot Visual, Automatizaciones y Tráfico Inbound)**
  - Node.js 22 + SQLite privado en WAL mode (`db/agentic.db`).
  - Motor de flujos tipo ManyChat (`FlowEngine`) con nodos interactivos, menús y handoff a humanos.
  - Gestión de bloqueos de conversación (`conversation_locks`) para evitar colisiones agente-humano.
  - Enrutamiento y selección de transporte por plan (`MetaCloudOrgTransport` para pago vs `BaileysProxy` para básico).
  - Ventana de mensajería oficial de 24 horas y registro de plantillas aprobadas.
  - Gestión de consentimiento y cumplimiento (Ley 1581 / Habeas Data).

- **Capa 2B: WHATSPOWER-ULTRA (Motor de Difusión Masiva, Neuromarketing y Anti-Ban)**
  - Node.js 22 + SQLite privado en WAL mode (`db/broadcast.db`).
  - Motor de cola persistente (`PersistentBroadcastWorker`) con claim atómico, pacing durable por organización y enfriamiento de lotes.
  - Integración contractual con Capa 2A: pre-filtrado y comprobación JIT de locks y supresiones por organización (`X-Org-Id`).
  - Ingesta de audiencias CSV con validación estricta de origen de consentimiento (`consent_origin`).
  - Enlaces rastreados con anonimización de IP (SHA-256 hash truncado) y control estricto `TRUST_PROXY`.

---

## 2. Estado de Producción y Fases Ejecutadas

### Fase 1 — Canal Oficial de WhatsApp (Meta Cloud API)
- Meta Cloud API como transporte prioritario y por defecto para organizaciones de pago.
- Baileys desacoplado y degradado a plan básico (`ALLOW_BAILEYS_LEGACY=false` por defecto).
- Control estricto de la ventana de 24 horas (`MessagingWindowStore`): fuera de ventana, solo plantillas registradas en estado `APPROVED`.
- Clasificación de errores Meta: 400/404/412 como rechazos definitivos; 500/502/503/timeout como estados `UNCERTAIN` sin reintentos ciegos.
- Pruebas contractuales y de simulación ejecutadas con `MockMetaServer`.

### Fase 2 — Consentimiento y Cumplimiento Normativo (Ley 1581)
- Almacenamiento auditable de consentimiento (`consent_records` y `consent_audit_log`): quién autorizó, cuándo, canal, texto legal y fuente.
- JIT check en despacho de campañas: contactos sin consentimiento activo transitan a `SKIPPED_NO_CONSENT`.
- Importación de CSV exige obligatoriamente columna `consent_origin`.
- Bajas y opt-outs revocan inmediatamente el consentimiento y quedan auditados.
- Endpoints de cumplimiento disponibles:
  - `GET /api/compliance/contact-data`: exportación de datos personales (Habeas Data).
  - `DELETE /api/compliance/contact-data`: derecho de supresión / olvido.
  - `POST /api/compliance/consent`: registro explícito de consentimiento.
  - `POST /api/compliance/opt-out`: revocación y lista de exclusión.
- Rastreo de enlaces (`/t/:code`): validación de `TRUST_PROXY === 'true'` antes de leer `X-Forwarded-For`; almacenamiento de IP anonimizada mediante hash SHA-256 (16 caracteres hexadecimales).

### Fase 3 — Estabilidad, Versiones, Benchmark y Runbook
- Node aligned: engines `>=22.12.0`, `.nvmrc` fijado en `22.14.0`, workflows de CI en `node-version: 22`, Dockerfiles estandarizados en `node:22-alpine`.
- Script multiplataforma `scripts/run-tests.mjs` en WHATSPOWER y ULTRA, resolviendo el bug de `--test-isolation=process` en Windows y Node 22+.
- Endpoint de monitor `/api/health` en todos los servicios reportando: ping a base de datos, memoria RSS/heap, estado de colas, conteo de despachos y supresiones.
- Benchmark local de SQLite:
  - 4,319 inserciones individuales/seg.
  - 70,914 inserciones en transacción por lote/seg.
  - 2,541 claims atómicos de cola/seg.
  - Conclusión: SQLite en WAL mode soporta >10x la tasa máxima de despacho de WhatsApp por nodo (~80-250 msg/s). Migración a PostgreSQL innecesaria para nodo único.
- Runbooks operativos creados en `WHATSPOWER/docs/RUNBOOK.md` y `WHATSPOWER-ULTRA/docs/RUNBOOK.md`.

### Fase 4 — Higiene y Sanitización
- Purgados todos los datos personales sensibles (teléfonos reales, nombres personales) en código, documentación y suites de prueba.
- Eliminadas afirmaciones engañosas de "Paridad 100% ManyChat/WhatsOn".
- Rutas locales absolutas foráneas reemplazadas por referencias relativas o de configuración.
- Archivos binarios residuales (`*.pid`, capturas viejas, backups temporales) excluidos en `.gitignore`.

### Fase 5 — Calidad y Suites de Pruebas
- **CRM-ALBRA:** `npx tsc --noEmit` limpio (0 errores); suites de integración de auth, outbox, 2FA y conexiones WhatsApp pasando.
- **WHATSPOWER:** `npm run tsc` limpio (0 errores); 38 suites, 250 pruebas ejecutadas, 250 superadas (0 fallos).
- **WHATSPOWER-ULTRA:** `npm run tsc` limpio (0 errores); 36 suites, 194 pruebas ejecutadas, 194 superadas (0 fallos).
- Simulación E2E de los 3 niveles: mensaje entrante ➔ evaluación de flujo en 2A ➔ creación de oportunidad en CRM ➔ bloqueo de despacho outbound por lock/supresión.

---

## 3. Puertos y Variables de Entorno del Entorno Local

| Servicio | Puerto | Comando de Arranque | Variables Clave |
|---|---|---|---|
| **CRM-ALBRA** | `3000` | `npm run dev` | `DATABASE_URL`, `NEXTAUTH_SECRET`, `APP_ENCRYPTION_KEY`, `AGENTIC_2A_WEBHOOK_SECRET` |
| **Daemon WhatsApp** | `3002` | `npm run wa:daemon` | `ALLOW_REAL_DISPATCH=false`, `PORT=3002` |
| **WHATSPOWER** | `3003` | `npm start` | `PORT=3003`, `INTERNAL_API_SECRET`, `INTERNAL_API_KEYS`, `CRM_BASE_URL=http://localhost:3000` |
| **WHATSPOWER-ULTRA** | `3004` | `npm start` | `PORT=3004`, `ADMIN_API_KEYS`, `WHATSPOWER_BASE_URL=http://localhost:3003` |
| **Worker ULTRA** | background | `npm run worker` | `BROADCAST_DB_PATH`, `WORKER_TICK_MS=5000` |
