# Historial

## Alta de CONTEXTO CRM
- Fecha: 2026-10-31.
- Repositorio: ALBRA8/CRM-ALBRA.
- Rama predeterminada confirmada: main.
- Cambio: documentación del estado, arquitectura, decisiones, plan, auditorías y pendientes.
- No se modificó intencionalmente código de aplicación.

## Referencias históricas previas (no revalidadas aquí)
- ea87cc279aa04ca2fd0bfac56b1b06b307087830: corrección de routing del remitente Baileys para JIDs modernos, según revisión anterior.
- 9b32591aa73fc3c07c450509e1159de1a12354ab: puente WHATSPOWER con HMAC-SHA256/anti-replay y notificaciones de cambio de etapa, según revisión anterior.

Se mencionaron previamente ramas saas-development y stable-production; confirmar su existencia/estado antes de usarlas. Esta tarea no creó ramas. Registrar nuevos hitos con fecha, rama, commit, impacto y pruebas.

## Actualización de contexto — 2026-11-05
- Se recibió informe de implementación P0.1 para aislamiento multi-organización de WhatsApp Baileys.
- Commit y ramas reportados: c2f4001 en main y fix/saas-security-and-stabilization.
- stable-production reportada intacta en ea87cc2.
- Pruebas reportadas: 17 unitarias nuevas, suite 422/422, TypeScript 0 errores y smoke 13/13 con prueba de denegación entre organizaciones.
- Documentación de implementación reportada: docs/P0.1-aislamiento-whatsapp-multiorg.md.
- Estos datos se registran como reportados, pendientes de verificación independiente del código, remoto y despliegue.

## Registro de compatibilidad Windows — 2026-11-05
- Se informó de un commit local 658740b con correcciones de aislamiento de variables .env, encoding UTF-8 y mock de os.symlink.
- Se informó de 434/434 pruebas en tres escenarios.
- El push fue reportado como bloqueado por falta de credenciales en el sandbox.
- No se ha confirmado a cuál de los tres repositorios activos pertenece el commit; no atribuirlo a CRM-ALBRA ni integrarlo hasta verificar repositorio y rama.
- El trabajo simultáneo en CRM-ALBRA, WHATSPOWER y WHATSPOWER-ULTRA debe mantenerse separado, sin copiar patches ni alterar ramas entre proyectos.

## Cierre de seguridad CP-Sec-01 — 2026-11-06
- Rama: main (base 2cbae0c; remoto verificado con ls-remote antes y después del push). stable-production intacta en ea87cc2.
- **Eliminados del árbol** los 5 artefactos E2E con credenciales (e2e-token.txt, e2e-wp-token.txt, e2e-wp-apikey.json, e2e-apikey.txt, e2e-wp-key.txt) + reglas .gitignore preventivas. Valores históricos verificados MUERTOS (tabla ApiKey vacía; JWTs no firman con secretos vivos; daemon 401 al valor antiguo). Ver AUDITORIAS.md A-005.
- **Secreto de daemon antiguo purgado** de 5 scripts (e2e-wp-guard.ts, e2e-wp-ultra.mjs, e2e-wp-ultra-engine.ts, bootstrap-e2e-postpub.sh, bateria-rotacion.sh) → fail-fast por entorno.
- **Escáner de secretos nuevo** `scripts/scan-secrets.mjs` con 11 pruebas (`npm run security:scan` / `security:scan:history`); árbol LIMPIO al cierre.
- **Eliminado** `scripts/start-whatspower-detached.mjs` (código operativo de otro repositorio con ruta absoluta). Imports absolutos `/home/z/repos/...` corregidos a rutas relativas en scripts E2E.
- **P0.1–P0.4 verificados directamente** (commits en main; suites de aislamiento en verde). Suite completa 464/464 en 51 archivos (74s); tsc 0 errores; build OK; lint con baseline preexistente de 358 errores (0 en archivos de esta sesión).
- Servicios :3000 y :3002 operativos durante toda la sesión, sin interrupciones.

## 2026-11-06 — FUSIÓN de ramas de reparación (repair/integral + fix/b1)
Ambas líneas de trabajo se conservan en el historial:

### Línea repair/integral-20261106
## Reparación General Integral — 2026-11-06 (rama repair/integral-20261106, B1→B9)

- **B1**: JWT restringido fuera de URLs — `?token=` SOLO en endpoints de descarga con opt-in (`DOWNLOAD_AUTH_OPTS`), download-tokens de 5 min (purpose='download') y `Referrer-Policy: no-referrer`. Antes el JWT de 7 días se aceptaba por query en TODAS las rutas.
- **B2**: rate limiting transversal (login 10/min IP + 5/15min email, forgot 3/15min, reset 10/15min, register 5/h, demo 5/h, MCP 60/min, crm-actions 120/min, email/send 20/h + permiso admin; notifications/all con permiso de exportación).
- **B3**: tokens de reset hasheados con sha256 (un solo uso, 1 h) + revocación al resetear (tokenVersion).
- **B4**: revocación de sesiones — `User.tokenVersion`; logout, reset de contraseña y desactivación invalidan el JWT ya emitido. Caché en proceso con prewarm (instrumentation) y refresh con debounce. Tests REV-01/REV-02.
- **B5**: restauración de backup ATÓMICA (`db.$transaction`), tope 25 MB → 413, reporte `transactional:true` + restored/skipped por entidad; jamás introduce registros en otra organización. Tests BKP-01..03.
- **B6**: errores 500 genéricos (jamás `err.message` al cliente; HttpError 5xx también).
- **B7**: escáner de secretos reforzado (DUMMY_HINTS exactos, huellas sha256-12, allowlist `scripts/security/secret-allowlist.json` y baseline histórico `secret-baseline.json` VERIFICABLES, historial COMPLETO sin tope de 400 ni solo-líneas-añadidas; CI bloqueante solo para hallazgos NUEVOS) + lint con baseline de reducción progresiva (`npm run lint:baseline`, bloquea errores nuevos) + auditoría de dependencias en CI.
- **B8**: observabilidad de seguridad transversal (`auth.login_failed`, `rbac.denied` vía security-log).
- **B9**: puente CRM→WHATSPOWER actualizado al contrato HMAC v2 (`timestamp.body` — mismo timestamp firmado y enviado) coordinado con 2A y 2B; `docs/INTEGRATION_CONTRACT.md` v1.1.0.
- **Verificación**: suite local 501/506 (los 5 fallos restantes son del trabajo CONCURRENTE de terceros en archivos sin seguimiento — chat/agent WIP; en checkout limpio `harness-independence` pasa 4/4, verificado con worktree temporal). tsc limpio en el árbol versionado. `security:scan` y `security:scan:history` exit 0 (33 dummies en allowlist explícita; 78 hallazgos históricos en baseline con estado ROTACION-PENDIENTE).
- **NOTA de concurrencia**: durante la ejecución, un agente de terceros operaba el mismo repositorio (WIP sin seguimiento de chat/agent y checkouts de rama). La reparación se preservó íntegra en `repair/integral-20261106` sin tocar su trabajo.

### Línea fix/b1-dashboard-org-isolation (absorbida)
## Bloqueos B1–B4 publicados — 2026-11-06

- CRM-ALBRA: rama `fix/b1-dashboard-org-isolation`, commit `f9e36f2f7dbe02f22809615910be1f5c8f3af7cf`; saneamiento de clientes ajenos invocado en dashboard. CI [42314688847](https://github.com/ALBRA8/CRM-ALBRA/actions/runs/42314688847): success.
- WHATSPOWER: rama `fix/b2-uncertain-b3-org-identity`, commit `618bcba95db95304ee2abf84f0458a76597393a0`; transporte ambiguo a UNCERTAIN y credencial interna vinculada a organización. CI [42314696590](https://github.com/ALBRA8/WHATSPOWER/actions/runs/42314696590): success.
- WHATSPOWER-ULTRA: rama `fix/b3-org-identity-b4-null-org`, commit `d6d0cc2dd28ad3c3dd86e7c73596a139add3264d`; identidad por organización y cuarentena/rechazo de ítems sin organización verificable. CI [42314700665](https://github.com/ALBRA8/WHATSPOWER-ULTRA/actions/runs/42314700665): success.
- Los tres heads y runs se verificaron directamente en GitHub. Los conteos de tests/build e integración 15/15 son resultados comunicados por la ejecución correctiva y quedan etiquetados como tales hasta revisión independiente de sus artefactos.
- Riesgo pendiente de confirmación: idempotencia realmente aplicada por el daemon Baileys; no se afirma exactly-once. Sin PR, merge ni despliegue; main y stable-production no se tocaron.
- Próximo hito: revisión independiente final de diffs y evidencias; después preparar tres PR para revisión humana, sin abrirlos hasta autorización expresa.


## Revisión independiente final — B2 sigue bloqueado (2026-11-06)

- CRM B1 y ULTRA B4 revisados en código y pruebas; CI success en sus SHA de código.
- WHATSPOWER B2 no queda cerrado: el daemon Baileys no consume ni persiste la clave de idempotencia que le transmite el transporte. El journal puede re-ejecutar un efecto PENDING tras expirar el lease; la reconciliación vuelve a ejecutar el pendiente. La prueba actual no simula aceptación externa seguida de pérdida de respuesta.
- B3 tiene validación por organización en el servidor 2A y credenciales por org en ULTRA, pero no se acreditó una prueba entre procesos reales en esta rama.
- `contracts-integration.test.ts` usa stubs para daemon y 2A; no es integración real de los tres servicios. No se certifica 15/15 real.
- Próximo paso: corregir B2 en daemon + journal con deduplicación durable scoped por org y comportamiento no-reenvío para PENDING/UNCERTAIN; agregar crash-window test y luego ejecutar integración real multi-proceso. No abrir PR hasta cerrar el bloqueo.

## 2026-11-13 — Selector multiempresa y auditoría de sesión superadmin (PR #3)

- Repositorio: `ALBRA8/CRM-ALBRA`.
- Rama de trabajo: `fix/migration-safety-audit`; destino previsto: `main`.
- Pull Request: [#3 — feat(super-admin): conectar selector de organizaciones](https://github.com/ALBRA8/CRM-ALBRA/pull/3). Estado registrado: abierta/en draft; no integrada.
- Autenticación (`src/lib/auth.ts`): se reforzó la validación de la sesión contra la base de datos, usuario activo, `tokenVersion`, rol vigente y organización activa. El contexto entre organizaciones queda reservado al superadmin.
- Endpoint (`src/app/api/super/switch-organization/route.ts`): se incorporó el cambio protegido de organización para superadmin y emisión de un token de sesión actualizado.
- Cliente API (`src/lib/api.ts`): se añadió `switchSuperOrganization(organizationId)`.
- Interfaz (`src/components/super/super-page.tsx`): se conectó la acción **Ingresar** en la tabla de organizaciones; sincroniza el token con el cliente API y el store, vuelve a consultar `/me`, actualiza el usuario y navega al dashboard. Se bloquea el cambio simultáneo y no se permite ingresar a organizaciones inactivas.
- Pruebas (`tests/integration/superadmin-organization-switch.test.ts`): se añadieron escenarios para cambio de organización, denegación a usuario normal y organización inexistente (404).
- La PR #3 incluye además cambios previos de esta rama: workflow CI, Docker/entrypoint, guardas de BD, documentación de migraciones e índices de auditoría, y pruebas de `db-guard`. El conjunto reportado en la PR fue de 15 archivos.
- Verificación de CI consultada para el SHA `27870abcc9b6c27e843ff17a48dde18068c0c0d6`: no se encontraron statuses ni ejecuciones de workflow asociadas en esa consulta. No equivale a una ejecución satisfactoria.
- **Estado de validación:** build y pruebas de esta versión aún no verificados de forma reproducible en esta sesión. No declarar funcionalidad al 100 %.
- **Estado de entrega:** cambios publicados en la rama y contenidos en la PR; no integrados en `main`, no desplegados en producción. No se modificó producción.
- Siguiente paso: verificar el head actual de la PR, ejecutar CI/build/pruebas, corregir fallos y revisar aislamiento positivo/negativo antes de integrar. No hacer merge ni despliegue sin validación y autorización.


## 2026-11-13 — Corrección de los nueve fallos de CI

- Inspeccionado el run fallido `43378623273`: 9 fallos en pruebas multi-tenant, conexiones WhatsApp/Embedded Signup y reporte PDF.
- Causa común de 8 fallos: JWT de pruebas con rol `owner` que no coincidía con el rol `member` persistido para user B. Se mantuvo la comprobación de rol en servidor y se corrigieron los fixtures de `tests/integration/multitenant-p0.test.ts`, `tests/integration/wa-connections.test.ts` y `tests/integration/reports-pdf.test.ts` para cambiar el rol en BD durante el escenario y restaurarlo al terminar.
- El noveno fallo del PDF era secundario al 401: el test intentaba extraer cifras de un PDF no generado por la autenticación rechazada.
- Commit final de la corrección/validación: `040d8875ff9b10b5179313bbc374a5e7795af8ed`.
- CI run `43379605573`: **success**, 64 archivos / 580 pruebas aprobadas; TypeScript, lint, migraciones, escáner y build aprobados.
- Pruebas automatizadas del selector Super Admin pasaron dentro de la suite.
- No se hizo merge ni despliegue. La validación visual del selector en navegador/staging y la comprobación integral de aislamiento en un entorno desplegado siguen pendientes.


## 2026-11-13 — Cierre de validación automatizada del selector

- Hallazgo adicional en revisión de UI: `/api/auth/me` filtraba siempre por la organización base del usuario, por lo que el superadmin podía cambiar token pero no completar la recarga de sesión en otra organización.
- Corrección: `src/app/api/auth/me/route.ts` permite que el superadmin consulte su usuario por ID y proyecta el contexto activo del token en `user.organizationId`; no cambia la organización base en BD. Los usuarios normales siguen filtrados por su organización asignada.
- Prueba añadida: tras cambiar a org B, `/api/auth/me` devuelve org B; se conserva org A como organización base persistida.
- Head final `5c1e73e0c99c488c843d42aff6fe8cef6928bf23`; CI run `43380198626` **success**, 64 archivos y 580 pruebas aprobadas, build incluido.
- No merge, no despliegue. Pendiente verificación visual/manual en staging y prueba de regreso al panel Super Admin.

## 2026-11-15 — Memoria técnica y operativa del Webinar oficial de WhatsON
- Transcripción y análisis íntegro del webinar de Roberto Valverde (`rcvalverde.com`) documentados en `CONTEXTO CRM/INGENIERIA_INVERSA_WHATSON_WEBINAR.md`.
- Documentadas reglas antispam de WhatsApp: umbral de 5 bloqueos en <20 min, bloqueo de enlaces en frío, warm-up de chips, y la estrategia "Saludos múltiples y respuesta única".
- Parámetros técnicos del motor de WhatsON mapeados: Spintax combinatorio 5×5×5×5 (625 variantes), rotación multi-cuenta con emuladores, pacing con jitter, control de lotes y automatización de listas de difusión.
- Tabla comparativa de paridad y modernización hacia el ecosistema SaaS multi-tenant ALBRA (Capa 1 CRM, Capa 2A WhatsPower, Capa 2B WhatsPower-Ultra).

## 2026-11-16 — Cierre de Paridad 100% WhatsON & WATI, Retiro de Páginas de Venta y Dashboard Único en WhatsPower-Ultra (Capa 2B)
- **Repositorio:** `ALBRA8/WHATSPOWER-ULTRA`.
- **Ramas actualizadas:** `repair/produccion-real` y `main` sincronizadas en commit `6a68b86` y posterior `c7bf070`.
- **Cierre de Paridad WhatsON & WATI:** Alcanzada paridad técnica al 100% y superioridad arquitectónica SaaS frente al software de escritorio WhatsON monousuario. Implementado escudo anti-ban de 5 capas (throttler, enfriamiento por lotes `PAUSED_COOLDOWN`, fatiga, spintax recursivo determinista y chequeos JIT contra Capa 2A).
- **Retiro de Páginas de Venta:** Eliminadas las carpetas `web/site/` y `web/sitio/` del árbol de código (archivadas en backup seguro fuera del repo).
- **Dashboard Único y Modo Demo:** La raíz `/` y `/campaigns` sirven exclusivamente el Dashboard SPA interactivo. Incorporado botón *"Entrar sin registro (demo)"* (`POST /studio/login-demo` protegido por `DEMO_MODE=true` en `.env`), toggle de tema claro/oscuro (☀️/🌙) y favicon SVG. Rutas legadas (`/app`, `/panel`, `/sitio`, `/inicio`) redirigen con HTTP 302 hacia `/`.
- **4 Detalles de Remate Implementados:**
  1. Paginación de hilo de chat con botón *"Cargar mensajes anteriores"* (`limit` y `before`).
  2. Tooltip con motivo real de fallo de entrega en el icono de error `✗`.
  3. Salto directo de página ("Ir a página N") en la tabla de Contactos.
  4. Buscador instantáneo con debounce en el tablero Kanban (`pkSearch`).
- **Verificación de Calidad (4 Puertas en Verde):**
  - Pruebas unitarias y de integración: 239/239 pasadas (50 suites, 0 fallos).
  - TypeScript: 0 errores (`tsc --noEmit`).
  - Seguridad: Escáner de secretos limpio (0 secretos expuestos).
  - Build: Generación de bundle de producción con salida limpia.
- **Documentación:** Creado `CONTEXTO CRM/PARIDAD_WHATSON_WHATSPOWER_ULTRA.md`.

## 2026-11-17 — Reparación técnica y auditoría de producción (FASE 1–5) en los tres repositorios

Ejecución del encargo de reparación técnica en las tres capas del ecosistema, sobre la rama `repair/produccion-real` de cada repositorio: `main` intacto, sin force-push, sin reescritura de historial, cero datos reales (solo `+573000000000`, `user@example.com`, `org_test`) y Baileys se mantiene como canal principal de WhatsApp (NO se migró a Meta Cloud API; los adaptadores existentes no se tocaron). Método: TDD (cada reparación precedida de una prueba que falla antes y pasa después) + verificación real (suites completas, escáner de secretos y simulación E2E de los 3 servicios con `ALLOW_REAL_DISPATCH=false`). Auditoría consolidada en [AUDITORIAS.md](AUDITORIAS.md) A-007; tareas del dueño en [PENDIENTES.md](PENDIENTES.md). Detalle completo por repositorio en sus `AUDIT_REPORT.md`, `CHANGELOG.md` y `OWNER_TODO.md`.

### CRM-ALBRA (6 commits, `4284687` → `d7ad0bb`)
- `4284687` fix(daemon): bind por defecto en `127.0.0.1` (configurable por `HOST`), secreto comparado con `crypto.timingSafeEqual` (SHA-256 de longitud fija) y validación EXACTA de origen con `new URL().origin` (se elimina `.startsWith()`, que admitía bypass tipo `crm.albra.co.attacker.com`; orígenes malformados rechazados). Prueba: `tests/integration/daemon-security.test.ts` (6, incluye bind no-loopback contra la IP real).
- `057511b` fix(security): aislamiento multi-tenant en rutas que no tenían suite dedicada (OAuth social Instagram/Facebook/Telegram/TikTok, Google OAuth, `/api/team/:id`, `/api/knowledge/:id`, `/api/custom-fields/:id`, `/api/internal/*` — anónimo/sin permiso/cross-tenant → 401/403/404 con efecto cero) y condición `WHERE id AND organization_id` explícita en mutaciones por id (api-keys, custom-fields, knowledge, saved-views, team; auditoría de las 122 rutas `[id]`). Prueba: `tests/integration/tenant-route-hardening.test.ts` (22).
- `2ae7f9f` docs(hygiene): aviso de canal no oficial Baileys en README y dummy marcado en la prueba del daemon.
- `5089356` docs(parity): matriz de paridad WhatsON sincerada — "Rotación multi-cuenta automática" dejada de declarar al 100% y registrada como NO implementada (requiere integración futura).
- `0368299` chore: limpieza de artefactos operativos y `.gitignore` global (`*.pdf`, `backups/`, `storage/temp/`).
- `d7ad0bb` docs(audit): CHANGELOG, AUDIT_REPORT, OWNER_TODO y matriz de producción de la sesión.
- Puertas verificadas: suite 764/764 (93 archivos, vitest), escáner de secretos del árbol limpio (allowlist con 50 dummies verificados) y escáner de historial sin hallazgos NUEVOS.

### WHATSPOWER (4 commits, `53cb61f` → `4b06118`)
- `53cb61f` fix(ai): IA desactivada por defecto — `isAiEnabled()`: sin credencial se realizan CERO llamadas HTTP a terceros y `AI_ENABLED=false` manda sobre la credencial presente; documentación explícita de que, al activarla, el texto de las conversaciones de clientes se transmite al proveedor externo (`.env.example` y README §2.b). Prueba: `tests/ai-disabled-by-default.test.ts` (6).
- `acd532f` docs(hygiene): aviso Baileys en la cabecera del README, documentación del motor de automatización (`automation_rules`, `automation_events`, `stage_change_dedup`, `/api/crm/stage-change`) en `FICHA.md` §7.b y sustitución de conteos de pruebas hard-coded.
- `a6cf359` docs(architecture): postura sobre `node:sqlite` y `--experimental-strip-types` con mitigaciones y plan de migración (`DOCS/DECISION_SQLITE_TYPES.md`).
- `4b06118` docs(audit): CHANGELOG, AUDIT_REPORT, OWNER_TODO y matriz de producción de la sesión.
- Puertas verificadas: suite 316/316 (`npm test`), escáner de secretos del árbol limpio.

### WHATSPOWER-ULTRA (8 commits, `4794444` → `56a0653`)
- `4794444` fix(worker): `ConsentStore` OBLIGATORIO en `BroadcastEngine` (fail-closed `CONSENT_STORE_REQUIRED`) y cableado en `worker-main.ts` (también en `LocalSuppressionStore`): el chequeo JIT de consentimiento (Ley 1581) ya no puede saltarse y un opt-out revoca el consentimiento en el store. Prueba: `tests/worker-consent.test.ts` (5).
- `ab524ce` fix(auth): `/studio/login-demo` devuelve 403 cuando `NODE_ENV=production`; `DEMO_MODE=true` en producción es problema fatal en `productionConfigProblems`; el rate limiter de login ya NO borra el contador tras cada éxito (acumula, anti fuerza bruta); IP desde `req.socket.remoteAddress` salvo `TRUST_PROXY=true`. Prueba: `tests/login-demo-hardening.test.ts` (6).
- `df13523` fix(worker): `WORKER_DISABLE_PACING` prohibido en producción (problema fatal en `productionConfigProblems` + guard en `worker-main.ts` con exit 1; legítimo solo en desarrollo). Prueba: `tests/pacing-guard.test.ts` (4, con proceso hijo real).
- `4ac7996` fix(tracking): la IP de los clics (`/t/:code`) jamás se almacena en crudo — solo `sha256(ip+salt)`; `X-Forwarded-For` condicionado a `TRUST_PROXY=true`. Prueba: `tests/tracking-ip-hash.test.ts` (6).
- `aa81718` docs(hygiene): aviso de canal no oficial Baileys en README y en la caja de aviso de Integraciones → Transporte.
- `b261f5f` build: `engines` y `.nvmrc` alineados a Node 22; decisión documentada de `node:sqlite`/strip-types (`DOCS/DECISION_SQLITE_TYPES.md`); `scripts/backup-db.ts` y `scripts/restore-db.ts` creados y probados con datos ficticios; RUNBOOK §3.1–3.2 (healthcheck/systemd y respaldo).
- `9cbd4d0` fix(suppression): normalización canónica del teléfono en la lista de bajas (una baja `+57…` ahora coincide con el contacto `573…`; el guardia JIT comparaba formatos distintos) + simulación E2E de flujo cruzado. Prueba: `tests/e2e-cross-flow.test.ts` (7: mensaje entrante → flujo → evento CRM → campaña ULTRA con `LOCK_EXCLUDED`, `SKIPPED_NO_CONSENT` y salvaguarda; `SENT=0`).
- `56a0653` docs(audit): CHANGELOG, AUDIT_REPORT, OWNER_TODO y matriz de producción de la sesión.
- Puertas verificadas: suite 269/269 (50 suites, node:test), test de seguridad 2/2, escáner de árbol limpio, TypeScript 0 errores y E2E cruzado 7/7.

### Publicación
- Las tres ramas `repair/produccion-real` se envían a `origin` al cierre de esta sesión con un PAT nuevo provisto por el dueño (push por rama; `main` intacto; verificación posterior con `ls-remote` registrada en AUDITORIAS A-007).

## 2026-11-17 (bis) — Acceso directo al ecosistema desde el "demo" (SSO de un solo uso, 3 repositorios)

A petición del dueño: el acceso demo ahora abre el ECOSISTEMA COMPLETO (CRM + WhatsPower + WhatsPower-Ultra), no solo el CRM. Implementado como SSO firmado de un solo uso entre las tres capas, sin debilitar las puertas endurecidas de la reparación:

- **CRM (capa 1, commit `9276e22`)**: botón **Ecosistema** en el sidebar (desktop y móvil) visible en cualquier sesión autenticada — incluida la demo. `GET /api/auth/ecosystem/links` emite un enlace por capa con token `v1.<payload>.<hmac>` (HMAC-SHA256 con `ECOSYSTEM_SSO_SECRET` compartido, TTL 90 s, `jti` de un solo uso). Fail-closed: sin secreto o sin `WHATSPOWER_STUDIO_URL`/`ULTRA_STUDIO_URL` el enlace se declara `available:false` y JAMÁS se emite token. Prueba: `tests/integration/ecosystem-links.test.ts` (9). Suite: **773/773** (95 archivos).
- **WHATSPOWER (capa 2A, commit `84d7232`)**: `GET /studio/login-ecosystem` canjea el enlace (verificación timing-safe, jti único, rate limit compartido con el login del studio) y concede la sesión del Studio con cookie HttpOnly (302 a `/`). Sin secreto → 404 (la ruta NO existe). Prueba: `tests/ecosystem-login.test.ts` (8). Suite: **318/318**.
- **WHATSPOWER-ULTRA (capa 2B, commit `9c00ad2`)**: misma ruta de canje hacia el dashboard `/`. SSO CONSCIENTE del dueño: funciona en producción SOLO con el secreto configurado; el login-demo ANÓNIMO conserva su bloqueo total en producción (regla H-2 intacta). Prueba: `tests/ecosystem-login.test.ts` (9). Suite: **278/278**.
- **Contrato compartido**: módulo `ecosystem-sso.ts` idéntico en los tres repos (formato, TTL, jti); documentado en los tres README y `.env.example`. `ALLOW_REAL_DISPATCH=false`, Baileys como canal principal y todas las reglas del encargo siguen intactas.
- **Verificación pre-subida (commit CRM `bb2bd1c`)**: reejecución de las tres suites completas antes de subir. WP 318/318 y ULTRA 278/278 verdes a la primera; CRM detectó que la allowlist de higiene de `.env.example` (test P0.4-H3) no reconocía los dos puertos locales nuevos del SSO (`127.0.0.1:3003`/`3004`) — corrección en la allowlist del test (las URLs loopback son legítimamente no-secretas según el propio contrato del test). Suite final CRM: **773/773**. Los tres repos verificados con `git ls-remote`: SHA remoto = SHA local en `repair/produccion-real`.

## 2026-11-17 (ter) — Blindaje y resolución de handshake de WhatsApp Baileys (Código 428) y sincronización

- **Causa raíz del fallo de vinculación (código 428)**: Baileys utilizaba un descriptor de navegador no estándar `['CRM ALBRA', 'Chrome', '1.0.0']` y `fetchLatestBaileysVersion()` obsoleto. Los servidores multi-device de WhatsApp cerraban el socket WebSocket con error 428 (`connectionClosed` / `Connection Terminated`) durante el registro.
- **Solución implementada (`daemon.mjs`, commits `6f2ca35` y `78151c8`)**:
  - Se configuró `Browsers.ubuntu('Chrome')` (firma oficial de navegador web soportada por WhatsApp).
  - Se reemplazó por `fetchLatestWaWebVersion()` dinámico con timeout de 3.5s y fallback seguro.
  - Limpieza preventiva de sesiones huérfanas en `.wa-auth/<orgId>`: si `creds.json` existe pero carece de `me.id` (sesión no emparejada o abandonada), se purgan los archivos residuales antes de `useMultiFileAuthState(dir)` para garantizar un estado criptográfico limpio.
  - Límite de reintentos: el daemon limita a 3 reintentos el ciclo de reconexión si no hay credenciales vinculadas, pasando a estado `qr_expired` para no saturar los servidores de WhatsApp.
  - TTL y frescura del QR: se añadieron `ttlSeconds: 25`, `qrGeneratedAt` y `qrExpiresAt` en `GET /qr` y soporte de `POST /connect { force: true }` para regeneración manual inmediata.
- **Frontend endurecido (`settings-page.tsx`)**:
  - Cuenta regresiva visible `Activo (Xs)` de 25 segundos para el código QR.
  - Desenfoque visual y overlay interactivo al expirar (`qrSecondsLeft <= 0`) con botón `"Generar nuevo QR"` que dispara `handleWaConnect(true)` de forma forzada.
  - El botón "Refrescar QR" ahora invoca la reconexión forzada en lugar de solo consultar la imagen caducada en memoria.
  - Prevención de parpadeo de imagen durante la expiración.
- **Sincronización remota y merge limpio (commit `ac2f3ee`)**:
  - Se hizo pull de `origin/repair/produccion-real` en los 3 repositorios (WHATSPOWER y ULTRA avanzaron fast-forward; CRM-ALBRA integró los endpoints de SSO de ecosistema sin conflictos con commit de merge `ac2f3ee`).
  - Suite de pruebas completa verificada.

## 2026-11-17 (cuarta) — corrección del ecosistema demo: pantalla de acceso, demo de 2A, arranque y aceptación completa

Diagnóstico del dueño (Windows, 03:40-03:55 America/Bogota): solo el 3000 escuchaba; el canje SSO no llegaba a probarse; los studios pedían el secreto con `window.prompt` bloqueante y borraban el body al cancelar; 2A pedía además la organización con un segundo prompt; `INICIAR_ECOSISTEMA.bat` no esperaba salud ni avisaba fallos; la cookie del CRM con Secure no se guarda por IP de LAN.

- **Causa raíz del arranque**: las capas 2A/2B simplemente no estaban arriba (el código arranca limpio en primer plano — verificado en Linux con stderr capturado). El "Acceso denegado" de PowerShell al crear `.log` dentro de WHATSPOWER/WHATSPOWER-ULTRA es ACL de Windows heredada de esas subcarpetas, no un fallo del servidor. Los `.bat` nuevos ya no escriben archivos de log (cada capa muestra sus logs en su propia ventana).
- **2A y 2B (commits en sus repos)**: pantalla de acceso real (secreto clásico + botón demo condicionado + "Volver al CRM" desde `CRM_BASE_URL`); sin `window.prompt` ni body vacío; la organización solo se pide en el login clásico (SSO/demo → `default` sin preguntar); los fallos del canje SSO (403/404/429) ahora responden página HTML (`src/studio/ecosystem-error-html.ts` en ambos repos, contrato espejo) con el motivo — caducado / ya usado / no configurado — y enlace para reintentar desde el CRM.
- **2A — entrada demo**: nueva `POST /studio/login-demo` con la dureza exacta de 2B (403 SIEMPRE en producción; exige `DEMO_MODE=true` e `INTERNAL_API_SECRET`; mismo rate limiter que el login clásico; misma cookie HttpOnly de sesión).
- **CRM**: cookie `albra_session` con Secure condicional (`SESSION_COOKIE_SECURE=false` como escape explícito documentado para IP de LAN sin HTTPS; por defecto Secure solo en producción). Nuevos `INICIAR_ECOSISTEMA.bat` (orden daemon→CRM→2A→2B con espera de salud y reporte de fallos por capa) y `DIAGNOSTICO_ECOSISTEMA.bat` (puertos + HTTP + presencia/igualdad de `ECOSYSTEM_SSO_SECRET` en los tres `.env` sin imprimir el valor).
- **Aceptación**: pasos 1-7 del guion en verde contra los 4 servicios reales (CRM standalone producción, daemon, 2A, 2B) y paso 8 en navegador real (Chrome headless): landing → INICIAR DEMO → sidebar Ecosistema → Abrir WhatsPower (nueva pestaña con Flow Studio y el flujo ManyChat cargado, sin gate) → Abrir WhatsPower-Ultra (dashboard con métricas y onboarding, sin login). Capturas en `download/`.
- Suites finales: CRM **778/778** (96 archivos; +5 pruebas de cookie), 2A **321/321** (+3: cadena de aceptación, páginas de error SSO, login-demo dev/producción), 2B **280/280** (+2: cadena de aceptación y páginas de error SSO). Reglas intactas: login-demo anónimo 403 en producción, nada de secretos en JS/sessionStorage/URLs, comparación timing-safe, jti de un uso, `ALLOW_REAL_DISPATCH=false`, Baileys como canal principal, `.env` jamás commiteado.
