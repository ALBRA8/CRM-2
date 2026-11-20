# CONTROL DE AVANCE — PLAN DEFINITIVO CRM-ALBRA v2.0

**Fecha de actualización**: 2026-11-20 · **Sesión 4**: D1 (integración PR #4 + tests multiproceso) + D2 (consolidación de ramas con etiquetas) + O1 (verificación estática)
**Documento rector**: `docs/plan-definitivo-2026-11-19/PLAN-DEFINITIVO-CRM-ALBRA.md` (48 tareas, 7 fases)
**Línea maestra**: `impl/integracion-maestra-20261120` — cadena sesiones 1+2+3 + D1 de la sesión 4 · Suite **1008/1008** en 114 archivos
**Matriz de trazabilidad**: `docs/MATRIZ-TRAZABILIDAD.md` (D4, con check en CI)

## Resumen por estado (48 tareas) — tras la sesión 4

| Estado | Cantidad | Tareas |
| --- | --- | --- |
| ✅ Terminadas | **29** | M1, S5, E1, E2 · F2, M7, F3, M8, E7 · F4, F5, U1, U2, U3, U4, I3, O3, S6, O2, E4, D4, E3, I2 · F1, U5, O4 (sesión 3) · **D1, D2** (sesión 4) |
| 🔧 Parciales (construidas; falta decisión/ejecución del propietario) | 5 | **S1** (acta lista; revocación de PAT = propietario), **S2** (runbook+generador validados; ventana gated a S1), I1 (workflow E2E listo; corrida real requiere A7), E7 (test listo; drill con acta requiere A8), **O1** (verificación estática completa; build+healthchecks reales en la máquina del propietario) |
| ⏳ Pendientes | 0 | (ninguna del lado construible) |
| 🔐 Requieren autorización específica | 0 | (D1, O1, D2 autorizadas y ejecutadas/archivadas en la sesión 4) |
| 🌐 Dependencia externa | 13 | S3, S4, S7, M2, M3, M4, M6, I4, I5, I6, E5, E6, F6 |
| ❌ Descartadas | 2 | M5 (obsoleta), D3 (duplicada en E4) |
| ⏸ Pospuesta | 1 | U6 (semillas sectoriales, ~1 d al activarla) |

## Detalle de la SESIÓN 3 (2026-11-20) — sobre la línea maestra

| ID | Tarea | Rama / commit | Archivos clave | Pruebas | Evidencia |
| --- | --- | --- | --- | --- | --- |
| **S1** | Acta de rotación de credenciales (F1-T01) | `impl/s1-registro-rotacion` + maestra · `639b2f3` | `docs/actas/ROTACION-CREDENCIALES-2026-11-20.md`, `OWNER_TODO.md` §0/§1 | security:scan exit 0 | Inventario de PATs expuestos (`…bnhik` 2026-11-20 y `ghp_M9w5…` 2026-11-17) + procedimiento de revocación paso a paso + secretos Actions (A1). **Pendiente del dueño**: revocar (el PAT clásico no se auto-revoca vía API) |
| **S2** | Purga de historial — preparación validada, GATED (F1-T02) | `impl/s2-preparacion-purga` + maestra · `5575afa`,`cd399a0` | `scripts/security/build-purge-replace-text.mjs`, `docs/actas/VENTANA-PURGA-HISTORIAL-S2.md`, `.gitignore` | cobertura 35/35 huellas · dry-run completo: 0 pendientes post-purga · baseline reclasificada 310/0 · scan:history exit 0 | Dry-run real en clon desechable (filter-repo 2.47.0, ~1,6 s). **GATED**: el plan ordena purgar SOLO tras revocar los PAT (S1) y con bundle de respaldo del dueño |
| **F1** | Integración del PR #6 (F2-T03) | `impl/f1-tareas-quickactions-v2` + maestra · `39f9a99`,`4077fd6` | `src/app/api/tasks/*`, `src/components/dashboard/tasks-card.tsx`, quick-actions ficha 360, migración `zzzzzz_tareas`, CI `cierre/**` | +6 integración · 986/986 · tsc 0 · build OK | Tareas/recordatorios operables desde dashboard y ficha; `defaultTime` (F4) y `defaultClientId` (PR #6) conviven; instalación limpia con orden z verificado |
| **F2+** | Endpoint agregado del panel (mejora F2) | maestra · `8c459ac` | `GET /api/whatsapp/connections-panel`, `src/lib/wa-connections-view.ts` | +25 (unit + integración con stub del daemon) | Una llamada entrega Cloud + veredicto real Baileys + plan; fail-closed (UNKNOWN si daemon caído); aislamiento cross-org verificado; material sensible jamás expuesto |
| **U5** | Pulido visual (F4-T05, OPCIONAL) — tipografía 13px token, dark mode con invariante CI, EmptyState en 6 pantallas | `impl/u5-pulido-visual` + maestra | `globals.css`, `empty-state.tsx`, `pulido-visual.test.ts` (9 invariantes) | +9 · 1006/1006 | Cero texto sub-13px en `src/`; tema completo no rompible sin que CI falle |
| **O4** | Observabilidad + unidades systemd (F6-T06, OPCIONAL) | maestra | `scripts/outbox-worker.mjs` (+11 pruebas), `deploy/systemd/` (4 unidades + timer + README) | 1006/1006 · build OK | Worker pull con backoff y cierre limpio; daemon `Restart=always`; kill test = pendiente del dueño (sin systemd en sandbox) |
| **Consol.** | Línea maestra única (base para D1/A3) | `impl/integracion-maestra-20261120` | CHANGELOG, PRODUCTION_READINESS (bloque canónico 128/110/47/18/105), CONTRATOS-ECOSISTEMA (128 rutas), MATRIZ-TRAZABILIDAD | 986/986 · verify-doc-figures verde · build OK | Las dos líneas paralelas de las sesiones 1+2 quedan fusionadas por MERGE (sin reescritura); cifras canónicas recalculadas y re-verificadas |

## Camino al piloto (recalculado tras la sesión 4)

```
Terminadas 29/48 (todo el producto construible del lado CRM) ────────────
Sesión 1: F2 → M7 → F3 → M8 → E7
Sesión 2: F4 → F5 → U1 → U2 → U3 → U4 → I3 → O3 → S6 → O2 → E4 → D4 → E3 → I2(+I1 parcial)
Sesión 3: S1 (acta) · S2 (runbook GATED) · F1 (PR #6) · F2 endpoint · U5 · O4 · LÍNEA MAESTRA
Sesión 4: D1 (PR #4 + tests multiproceso en la maestra) · D2 (32→11 ramas, 22 etiquetas) · O1 (estática)

Resta construible: nada · U6 (pospuesta, opcional)
Resto: propietario (revocar PAT→S1, ventana S2, docker compose O1, A1/A3/A7/A8, SMTP)
       o dependencia externa (13 tareas en repos/máquinas externas)
```

## Detalle de la SESIÓN 4 (2026-11-20) — sobre la línea maestra

| ID | Tarea | Rama / commit | Archivos clave | Pruebas | Evidencia |
| --- | --- | --- | --- | --- | --- |
| **D1** | Resolver integración pendiente (F2-T04) | `impl/d1-integracion-final` · `dde4207` | `tests/integration/workflow-outbox-ambiguous-ack.test.ts` (PR #4), `tests/integration/scheduler-multiprocess.test.ts` + `tests/fixtures/scheduler-worker.spec.mts` + `vitest.worker.config.mts` (de `fix/migration-safety-audit`), `PRODUCTION_READINESS.md` (bloque canónico 112→114) | +2 · **1008/1008** · verify-doc-figures verde | ACK ambiguo: envío aceptado queda en cuarentena y NUNCA se reenvía (trigger SQLite). Scheduler: 2 procesos compiten → exactamente 1 run durable. Decisión escrita PR #4/#6 en `docs/actas/CIERRE-D1-D2-O1-2026-11-20.md` |
| **D2** | Consolidación de ramas remotas (F7-T05) | etiquetas `archive/20261120-*` en CRM-ALBRA | 22 etiquetas de archivo (SHAs verificados en servidor) | verificación recuperabilidad 22/22 | Repo canónico: 32 → **11 ramas**; CRM-2 queda como espejo completo de respaldo. Detalle en el acta de cierre |
| **O1** | Docker compose + healthchecks (F6-T01) — PARCIAL | verificación estática en el acta | `docker-compose.yml` (YAML válido, 2 servicios con healthcheck), `Dockerfile` (3 etapas), `scripts/docker-entrypoint.sh` (wait-db + migrate deploy con guardarrails) | estática completa | Runbook exacto para la máquina del propietario en `docs/actas/CIERRE-D1-D2-O1-2026-11-20.md` §O1; Docker no existe en el sandbox (limitación declarada) |

## Detalle de las tareas terminadas EN LA SESIÓN 1 (2026-11-20)

Cada tarea: rama de construcción → pruebas locales (Vitest completo, tsc, eslint, next build) → commit → push verificado a `github.com/ALBRA8/CRM-2`.

| ID | Tarea | Rama / commit | Archivos clave | Pruebas | Evidencia |
| --- | --- | --- | --- | --- | --- |
| **F2** | UI de conexiones WhatsApp multi-número (F3-T02) | `impl/f2-conexiones-whatsapp-ui` · `c2b20cc` | `src/lib/wa-connections-ui.ts` (modelo puro), `src/components/settings/connections-tab.tsx`, `src/lib/api.ts`, `settings-page.tsx` (tab «Números WA») | +28 unitarios (estados, permisos, cupo, doble confirmación, payload STUB del daemon) · 809/809 | Tab en Ajustes→Canales→Números WA: alta manual Cloud API, Embedded Signup, verificar, desconectar con confirmación doble, historial de eventos, QR Baileys con veredicto P0.1 |
| **M7** | Criterio de unificación de la doble bandeja (F3-T03) | `impl/m7-unificacion-bandeja` · `1fe8041` | `src/lib/inbox.ts` (`dedupeInboxConversations`, `inboxIdentity`), `docs/CRITERIO-BANDEJA-UNICA.md` | +10 unitarios (contacto en AMBAS fuentes, respaldo, fail-open, inmutabilidad) · 821/821 | Criterio «canónico primero, legacy como respaldo» documentado y reversible (A10 pendiente de firma); sin borrados; historial íntegro en ficha 360 |
| **F3** | Filtros por canal/cuenta + búsqueda en bandeja (F3-T04) | `impl/f3-filtros-bandeja` · `9e0d271` | `src/lib/inbox.ts` (`InboxFilters`, `filterInboxConversations`, `normalizeSearchText`), `src/app/api/inbox/route.ts`, `src/components/inbox/inbox-page.tsx` | +10 unitarios y +6 integración (canal inválido 400, cross-org, combinados) · 837/837 · build OK | Filtros SERVER-SIDE antes del recorte: `?channel` `?connection` `?q` (sin acentos); búsqueda con debounce, selector de cuenta, polling que respeta filtros |
| **M8** | Conciliación operable de envíos UNCERTAIN (F3-T05, MODIFICADA) | `impl/m8-reconciliacion-uncertain` · `c108b40` | `src/app/api/admin/outbox/uncertain/*`, `src/components/settings/outbox-tab.tsx`, `settings-page.tsx` (tab «Envíos») | +10 integración (flujo completo con evidencia, denegaciones, 409 de carrera, 404 cross-org) · 847/847 · build OK | El operador resuelve unknown sin SQL: lista de inciertos por org, evidencia obligatoria (`providerChecked` + `providerMessageId` en sent), auditoría del caso. Endpoints internos sin cambios de contrato |
| **E7** | Test automatizado backup/restore roundtrip (F6-T04, MODIFICADA) | `impl/e7-backup-restore-test` · `6d2a617` | `tests/integration/backup-restore-roundtrip.test.ts` | +3 (roundtrip íntegro, script real exit 0, fuente dañada exit 2) · 850/850 · tsc 0 | Restaure verificado por test (integridad + conteos + contenido exacto). El drill con acta queda para el propietario (A8) — **parcial**: falta esa evidencia |

**Estado de la suite al cierre de la sesión 1**: 850/850 pruebas en 99 archivos (registro de su fecha; hoy: 986/986).

## Detalle de las tareas terminadas EN LA SESIÓN 2 (2026-11-20)

Cada tarea: rama de construcción → pruebas en verde (Vitest completo, tsc, eslint, build) → commit → push a `github.com/ALBRA8/CRM-2`.

| ID | Tarea | Rama / commit | Archivos clave | Pruebas | Evidencia |
| --- | --- | --- | --- | --- | --- |
| **F4** | Agenda con vistas semana/día (F5-T01) | `impl/f4-agenda-semana-dia` · `76564f2` | `src/lib/agenda-vistas.ts`, `calendar-page.tsx` (3 vistas), `reservation-form-dialog.tsx` (+defaultTime) | +18 unitarios · 868/868 · build OK | Vista Semana (7 columnas) y Día (línea de tiempo 07–21h) con duración visible y chips de hueco libre; crear cita en 2 clics; canceladas no bloquean; unión de solapes |
| **F5** | Pantalla de Salud + wizard (F6-T02) | `impl/f5-salud-wizard` · `9b65a2f` | `src/lib/health-ui.ts`, `src/app/health/page.tsx`, `onboarding-wizard.tsx`, `/api/doctor` (+check test-send), dashboard | +16 · 884/884 · build OK | Veredicto OK/Atención/Error con acción por ítem; wizard de 4 pasos validado contra el doctor real (organización, número conectado, IA, primer envío); reparación determinista con confirmación doble |
| **U1** | Navegación única 5+1 (F4-T01) | `impl/u1-nav-5mas1` · `09f7a4f` | `src/lib/nav.ts`, `sidebar.tsx` (secciones), `views.ts`, Ajustes→Canales (+botón QR clásica) | +14 · 898/898 · build OK | Hoy·Clientes·Bandeja·Comercial·Ajustes(+Admin); `/inbox` única bandeja; `/whatsapp` fuera del menú pero routable (PWA/links intactos); A10 tratada como aprobada, reversible |
| **U2** | Dashboard «Requiere atención» (F4-T02) | `impl/u2-atencion-dashboard` · `aa5ab3e` | `src/lib/atencion.ts`, `/api/dashboard` (+attention), `dashboard-page.tsx` | +9 · 907/907 · build OK | 5 motivos reales (sin contestar, citas de hoy, cotizaciones por enviar/seguir, vencidos), severidad y 1 clic; sin motivos vacíos; configurable |
| **U3** | Catálogo de errores accionables (F4-T03) | `impl/u3-errores-accionables` · `821f867` | `src/lib/errores.ts` (21 entradas + códigos Meta 131047/131049/131030/133016), `error-alert.tsx`, 4 componentes cableados | +13 · 920/920 · build OK | INVARIANTE testeado: ningún texto nombra archivos/comandos/rutas; el mensaje técnico jamás se muestra; soporte marcado explícito |
| **U4** | Ajustes por dominio (F4-T04) | `impl/u4-ajustes-dominios` · `508a00a` | `src/lib/settings-dominios.ts`, `settings-page.tsx` (2 niveles) | +10 · 930/930 · build OK | 4 dominios (Negocio/Canales/Inteligencia/Seguridad y equipo); cero tabs huérfanos; deep-links `?tab=` y OAuth preservados; `envios` sigue admin-only |
| **I3** | Contratos del ecosistema (F7-T03) | `impl/i3-contratos-ecosistema` · `6eb82d8` | `docs/CONTRATOS-ECOSISTEMA.md` (125 rutas con archivo y protección real), README | revisión cruzada | Tabla generada contra el código (`scripts/gen_contratos_ecosistema.py`); contratos internos S2S y cross-repo; webhook leads marcado honestamente como pendiente (I4) |
| **O3** | Instalador idempotente (F6-T03) | `impl/o3-instalador` · `71110f0` | `scripts/instalar-crm.sh`, `DEPLOY.md` (§8b) | doble pasada real | Respaldo OBLIGATORIO de `.env`+`*.db` antes de tocar; jamás sobrescribe `.env`; `prisma migrate deploy` (no db push); IDEMPOTENCIA VERIFICADA: hashes `.env`/BD idénticos tras 2 pasadas; log en `logs/instalar-crm.log` |
| **S6** | Saneamiento scripts e2e (F1-T04) | `impl/s6-saneamiento-e2e` · `5ee2784` | `docs/historia/scripts/` (24 scripts + README índice), OWNER_TODO | security:scan exit 0 · build · suite | Archivo con `git mv` (historial íntegro, nada borrado); flujo oficial único `npm run e2e:3`; allowlist por huella sigue cubriendo; NO se regeneró la baseline histórica (registros ROTACION-PENDIENTE preservados para S2) |
| **O2** | Runbook único (F6-T05) | `impl/o2-runbook` · `c3b6659` | `docs/RUNBOOK-CRM.md`, README | checklist alineado al wizard | Mapa de procesos, arranque frío, Salud, outbox/monitor (A7 marcado), backups+drill, actualización (O3), emergencias, WP/ULTRA como dependencia externa |
| **E4** | Cifras conciliadas (F2-T06) | `impl/e4-readiness-cifras` · `cdc969f` | `scripts/verify-doc-figures.mjs`, `PRODUCTION_READINESS.md` (bloque canónico), CHANGELOG | caso negativo probado (exit 1) | 125 rutas · 107 archivos de prueba · 46 modelos · 17 migraciones · 104 componentes; cifras viejas corregidas; historia NO reescrita |
| **D4** | Matriz trazabilidad + CI (F7-T04) | `impl/d4-matriz-trazabilidad` · `0146561` | `docs/MATRIZ-TRAZABILIDAD.md` (25 filas), `ci.yml` (+paso cifras), `tests/unit/verify-doc-figures.test.ts` | +5 · 935/935 | Cada afirmación estructural con su evidencia real; CI falla si las cifras se desalinean; caso negativo testeado; tsconfig excluye `docs/historia` |
| **E3** | Limpieza de muertos (F2-T05) | `impl/e3-limpieza-dependencias` · `4ef4f9f` | `package.json` (−9 deps), `package-lock.json`, −`whatsapp-daemon-supervisor.ts` | 935/935 · tsc · build OK | Sin referencias verificadas por grep antes de eliminar; `@hapi/boom` restante = transitivo de Baileys; `dotenv` añadido como devDep explícita (lo importaba el setup de tests) |
| **I2** | Fixtures de contratos (F7-T02) | `impl/i2-contratos-fixtures` · `03f6e3b` | `tests/contract/contratos-ecosistema.test.ts` (vector HMAC v2 compartido) | +20 · 955/955 · build OK | Vector fijo copiable a WP/ULTRA; SSO TTL 90 s estricto, jti de un solo uso, eco de org, tamper rechazado; eventId sin colisión cross-org |
| **I1** | E2E programado (F7-T01) — PARCIAL | `impl/i2-contratos-fixtures` · `03f6e3b` | `.github/workflows/e2e-3-servicios.yml` | skip con aviso sin token | Cron diario + manual; clona WP/ULTRA en MODO LECTURA (push disabled); `ALLOW_REAL_DISPATCH=false` siempre; la corrida real requiere A7 (PAT de lectura) |

## Desbloqueos que solo el propietario puede hacer

1. **URGENTE — revocar el token `ghp_w2tw…`** (re-expuesto en el chat de la sesión 3) y el de la sesión 2026-11-17 (`ghp_M9w5…`): procedimiento exacto en `docs/actas/ROTACION-CREDENCIALES-2026-11-20.md` (S1). Entregar el token nuevo por variable de entorno, jamás por el chat.
2. **A1**: PAT + `PII_PEPPER` como secretos de GitHub Actions.
3. **A2 (S2)**: acordar la ventana y crear el bundle de respaldo; luego ejecutar `docs/actas/VENTANA-PURGA-HISTORIAL-S2.md` (GATED: solo tras revocar los PAT).
4. **A3**: revisar y fusionar la línea maestra `impl/integracion-maestra-20261120` hacia `main` (D1 y D2 ya ejecutadas: PR #4/#6 integrados con decisión escrita; 22 ramas archivadas con etiquetas; destino de `fix/migration-safety-audit` y `fix/whatsapp-production-media` documentado en el acta — revisión del propietario pendiente).
5. **A7/A8**: worker de outbox en el despliegue real y drill de backup con acta firmada (E7).
6. Credenciales SMTP reales (notificaciones) — opcional para el piloto.

## Reglas de esta construcción (cumplidas)

- Prohibido tocar WhatsPower/WhatsPower-Ultra ✓ (todo el trabajo en CRM-ALBRA)
- Sin migraciones destructivas, sin despliegues, sin WhatsApp real, sin rotación de credenciales, sin operaciones Git destructivas ✓
- Cada tarea: rama propia, pruebas en verde antes de commitear, push verificado a CRM-2 ✓
- Criterios por defecto cuando el plan deja decisión abierta: documentados como reversibles (M7/A10) ✓
