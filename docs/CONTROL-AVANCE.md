# CONTROL DE AVANCE — PLAN DEFINITIVO CRM-ALBRA v2.0

**Fecha de actualización**: 2026-11-20 (sesión 2) · **Sesión**: F4 → F5 → U1 → U2 → U3 → U4 → I3 → O3 → S6 → O2 → E4 → D4 → E3 → I2+I1
**Documento rector**: `docs/plan-definitivo-2026-11-19/PLAN-DEFINITIVO-CRM-ALBRA.md` (48 tareas, 7 fases)
**Matriz de trazabilidad**: `docs/MATRIZ-TRAZABILIDAD.md` · **Informe de la sesión**: `docs/INFORME-FASE-2-2026-11-20.md`

## Resumen por estado (48 tareas)

| Estado | Cantidad | Tareas |
| --- | --- | --- |
| ✅ Terminadas | **22** | M1, S5, E1, E2 · F2, M7, F3, M8, E7 (sesión 1) · **F4, F5, U1, U2, U3, U4, I3, O3, S6, O2, E4, D4, E3, I2** (sesión 2) |
| 🔧 Parciales (construidas; falta decisión/ejecución del propietario) | 2 | I1 (workflow E2E listo; corrida real requiere A7), E7 (test listo; drill con acta requiere A8) |
| ⏳ Pendientes | 3 | U5 (pulido visual, OPCIONAL), O4 (systemd, OPCIONAL), U6 (semillas sectoriales, pospuesta por decisión) |
| 🔐 Requieren autorización específica | 6 | S1, S2, F1, D1, O1, D2 |
| 🌐 Dependencia externa | 13 | S3, S4, S7, M2, M3, M4, M6, I4, I5, I6, E5, E6, F6 |
| ❌ Descartadas | 2 | M5 (obsoleta), D3 (duplicada en E4) |

**Suite**: 955/955 pruebas en 107 archivos · `tsc --noEmit` 0 errores · eslint limpio · `next build` OK ·
`node scripts/verify-doc-figures.mjs` en verde (integrado a CI).

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

## Camino al piloto (recalculado tras la sesión 2)

```
Hecho (22 de 48, todas las de producto y operación del lado CRM) ──────
Sesión 1: F2 → M7 → F3 → M8 → E7
Sesión 2: F4 → F5 → U1 → U2 → U3 → U4 → I3 → O3 → S6 → O2 → E4 → D4 → E3 → I2(+I1 parcial)

Solo quedan, del lado construible: U5 y O4 (MEJORAS OPCIONALES)
Todo lo demás es: autorización del propietario (S1,S2,F1,D1,O1,D2,A1,A3,A7,A8)
o dependencia externa (13 tareas en repos/máquinas externas)
```

**El producto está completo en su lado construible**: bandeja única con filtros, conexiones
multi-número con UI, agenda semana/día, dashboard de atención, Salud con wizard, errores
accionables, ajustes por dominios, instalador idempotente, runbook, contratos documentados,
cifras verificadas en CI y 955 pruebas en verde.

## Desbloqueos que solo el propietario puede hacer

1. **URGENTE — revocar el token `ghp_w2tw…`** expuesto en el chat (tarea S1).
2. A1: PAT + `PII_PEPPER` como secretos de GitHub Actions.
3. A3: destino de ramas de integración / merge de PR #6 (F1) y PR #5 (E1).
4. A7: PAT de lectura `E2E_REPOS_TOKEN` para el E2E programado (I1) y worker de outbox en el despliegue.
5. A8: `docker compose build/up` en su máquina + drill de backup con acta (O1/E7).
6. A4/A9: si desea eliminar (y no solo archivar) scripts históricos o ramas antiguas.
7. Credenciales SMTP reales (opcional).

## Reglas de esta construcción (cumplidas)

- Prohibido tocar WhatsPower/WhatsPower-Ultra ✓ (todo el trabajo en CRM-ALBRA)
- Sin migraciones destructivas, sin despliegues, sin WhatsApp real, sin rotación de credenciales, sin operaciones Git destructivas ✓
- Cada tarea: rama propia, pruebas en verde antes de commitear, push verificado a CRM-2 ✓
- Decisiones por defecto documentadas como reversibles (M7/A10, U1/A10, S6 archivo en vez de borrado) ✓
- Evidencia por tarea en esta matriz y en `docs/MATRIZ-TRAZABILIDAD.md` ✓
