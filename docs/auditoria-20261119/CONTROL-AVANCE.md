# CONTROL DE AVANCE — PLAN DEFINITIVO CRM-ALBRA v2.0

**Fecha de actualización:** 2026-11-20 · **Sesiones de construcción:** F2 → M7+F3 → M8 → U2 → F5 → E7 → U3 · **Consolidación:** F4 → U1 → U2/U3/U4 (cadena B) → I3 → O3 → S6 → O2 → E4/D4/E3 → I1+I2 → **U5**
**Repositorio de entrega:** ALBRA8/CRM-2 (todas las ramas verificadas con `git ls-remote`)
**Base canónica de construcción:** `docs/plan-definitivo-crm-2026-11-19` (commit `e9ad9df`)

---

## 1. Estado global de la matriz (48 tareas)

| Estado | Tareas |
|---|---|
| **Terminadas (25 de las 32 construibles)** | M1, S5, E1, E2, E3, E4, D4 · F2, M7, F3, M8, U2, F5, E7, U3 (sesión 1) · **F4, U1, U4, I3, O3, S6, O2, I1, I2** (sesión de consolidación) · **U5** (pulido visual) |
| **Requieren autorización específica del propietario (6)** | S1, S2, F1, D1, O1, D2 |
| **Mejora opcional no construida (1)** | O4 (unidades systemd — opcional; congelada hasta decidir el stack de despliegue del propietario) |
| **Dependencia externa / bloqueadas (13)** | tareas del ecosistema WP/ULTRA |
| **Descartadas (2)** | M5, D3 |
| **Pospuesta (1)** | U6 |

**Tests:** 961/964 en la punta consolidada (`impl/u5-pulido-visual`, commit `285ef2f`). Los 3 fallos (`multitenant-p0` ×2, `whatsapp-daemon-proxy-send` ×1) son **PREEXISTENTES en la base** (verificados con `git stash` en `e9ad9df`) y pertenecen al proxy legacy del daemon — documentados para su arreglo posterior. Verificación triple en la punta: `tsc --noEmit` 0 · eslint 0 · `next build` OK.

---

## 2. Detalle por tarea de esta sesión (2026-11-20)

| ID | Tarea | Rama en CRM-2 | Commit | Archivos clave | Pruebas | Resultado |
|---|---|---|---|---|---|---|
| **F2** | UI de conexiones WhatsApp multi-número | `impl/f2-conexiones-whatsapp` | `e4bec82` | `wa-connections-page.tsx`, `wa-connections-view-model.ts`, `/whatsapp/conexiones`, views+sidebar+AppShell, api.ts | 31 unit | Panel multi-número: estados, plan X/Y, verificar/desconectar/detalle+eventos, Embedded Signup oficial con state de un solo uso, registro manual admin. 1456 líneas. |
| **M7** | Criterio de unificación de la doble bandeja | `impl/m7-f3-bandeja-unica` | `d74028c` | `inbox.ts` (dedup puro), route `/api/inbox` | 21 unit + 8 int | Criterio aprobado y documentado: **canónico primero, legacy como respaldo**. `dedupeInboxConversations` READ-ONLY (sin borrado); `suppressedCount` en la API. |
| **F3** | Filtros canal/cuenta + búsqueda bandeja | (misma rama) | `d74028c` | `inbox.ts` (filtros puros), route, `inbox-page.tsx` | (mismos) | Server-side: channel/account/search/offset + paginación "Cargar más"; UI con debounce 300 ms; compatibilidad `listInbox` preservada. |
| **M8** | Reconciliación operable UNCERTAIN | `impl/m8-reconciliacion-uncertain-v2` | `5c1115e` | `/api/outbox/uncertain`, `/api/outbox/uncertain/[id]/reconcile`, `outbox-page.tsx`, `/outbox` | 9 int | Vista admin sobre la política existente; `providerChecked` + evidencia ≥ 10 chars **auditada** en ChannelConnectionEvent; 404 vs 409; endpoints internos intactos. |
| **U2** (F4-T02) | Dashboard "Requiere atención" | `impl/f4-dashboard-atencion` | `19f5cf4` | `dashboard-attention.ts` (puro), `/api/dashboard/attention`, `attention-card.tsx` | 8 unit + 9 int | Motivos con datos REALES (unread bandeja única, drafts, citas 7 días); sin motivos vacíos; acciones en 1 clic; `overdueTasks` en 0 hasta fusionar PR #6 (sin falsos positivos). |
| **F5** (F6-T02) | Pantalla de Salud + wizard | `impl/f5-salud-wizard-v2` | `8512f78` | `health-view-model.ts`, `/api/health/setup`, `health-page.tsx`, `/health` | 12 unit + 7 int | Doctor consumido **sin cambiar su contrato**; acciones por check; botón Arreglar solo con fix determinista; wizard 4 pasos con validación real; instalación sana NUNCA ve el wizard. |
| **E7** (F6-T04) | Test backup/restore roundtrip | `impl/e7-backup-restore-test-v2` | `dd27852` | `tests/integration/backup-restore-roundtrip.test.ts` | 4 int | Roundtrip completo: script REAL de producción → desastre simulado → restauración fiel al drill → verificación integrity_check + datos byte a byte. |
| **U3** (F4-T03) | Catálogo de errores accionables | `impl/u3-catalogo-errores` | `983b114` | `errores.ts`, `error-alert.tsx`, adopción en F2 | 12 unit (invariantes) | 20+ entradas con solución y pasos; códigos Meta incluidos; **invariante** probado: cero archivos/comandos/SQL en textos de usuario; `resolveError` fail-safe. |

**Verificación de todas las ramas en CRM-2:** `git ls-remote` confirma `e4bec82`, `d74028c`, `5c1115e`, `19f5cf4`, `8512f78`, `dd27852`, `983b114` presentes.

> Nota de nombres: las refs con conflicto de nombre en CRM-2 (trabajo de sesiones anteriores) se subieron con sufijo `-v2` (M8, F5, E7). NINGÚN historial existente fue reescrito.

---

## 3. Sesión de consolidación y cierre UX (2026-11-20, segunda mitad)

Se detectó en CRM-2 una **cadena acumulativa completa** (sesión paralela) que ya contenía los siguientes 10 trabajos encadenados sobre `e9ad9df` — se verificaron en la punta consolidada (`crm2/impl/i2-contratos-fixtures` = `86cc1a8`) y se completó la que faltaba:

| ID | Tarea | Rama en CRM-2 | Commit | Resultado |
|---|---|---|---|---|
| **F4** | Agenda con vistas semana y día | `impl/f4-agenda-semana-dia` | `76564f2` | `agenda-vistas.ts` (170 líneas puras) + 205 pruebas unit; duración visible y huecos libres sobre la API de reservas existente |
| **U1** | Navegación única 5+1, una sola bandeja | `impl/u1-nav-5mas1` | `09f7a4f` | Menú Hoy/Clientes/Bandeja/Comercial/Ajustes + Admin; `/whatsapp` queda accesible desde Ajustes → Canales; `nav.test.ts` (128 líneas) |
| **U2/U3/U4** | (reconstruidos en la cadena consolidada) | misma cadena | `aa5ab3e` → `508a00a` | Dashboard atención, catálogo errores y ajustes por dominio (4 dominios, 2 niveles) integrados EN ORDEN |
| **I3** | Documento único de contratos | `impl/i3-contratos-ecosistema` | `6eb82d8` | `docs/CONTRATOS-ECOSISTEMA.md` (254 líneas, 125 rutas con archivo y protección real) |
| **O3** | Instalador/actualizador idempotente | `impl/o3-instalador` | `71110f0` | `scripts/instalar-crm.sh` (148 líneas): respalda `.env`+`db/`, build+migraciones, valida `/api/health`, log de operación |
| **S6** | Saneamiento de scripts e2e históricos | (en cadena O2) | `5ee2784` | 25 scripts archivados en `docs/historia/scripts/`; queda el flujo oficial `scripts/e2e-3-servicios.mjs` |
| **O2** | Runbook único del CRM | `impl/o2-runbook` | `c3b6659` | `docs/RUNBOOK-CRM.md` (198 líneas): arranque app+daemon+worker, monitor, backups con drill, actualización con O3, diagnóstico con Salud |
| **E4/D4/E3** | Readiness, cifras y limpieza | cadena I2 | `cdc969f` → `4ef4f9f` | Bloque canónico verificado por script; dependencias muertas fuera |
| **I1+I2** | E2E 3 servicios programado + fixtures de contratos | `impl/i2-contratos-fixtures` | `03f6e3b`→`86cc1a8` | `.github/workflows/e2e-3-servicios.yml` (cron diario 04:30 UTC + manual); `tests/contract/` con vector HMAC v2 compartido, SSO TTL 90 s / jti de un solo uso, eco de organización |
| **U5** | **Pulido visual (la última construible)** | `impl/u5-pulido-visual` | **`285ef2f`** | **Tipografía mínima 13px**: token `@utility text-xs` = 13px/1.45 + barrido de 195 clases `text-[9|10|11|12px]` en 30 archivos. **Dark mode COMPLETADO y blindado**: invariante CI de ThemeProvider+ThemeToggle+capa `.dark` de superficies (60 reglas). **Estados vacíos**: componente `empty-state.tsx` (icono+título+descripción+CTA) adoptado en 6 pantallas (Bandeja con CTA «Conectar un número», WhatsApp, Cotizaciones, Automatizaciones, Clientes, Productos). `tests/unit/pulido-visual.test.ts` (9 invariantes) |

---

## 4. Camino restante hacia el piloto (estado FINAL de construcción)

| # | Paso | Tareas | Estado |
|---|---|---|---|
| 1 | Conexiones multi-número visibles | F2 | ✅ HECHO |
| 2 | Bandeja única confiable con filtros | M7+F3 | ✅ HECHO |
| 3 | Operación de envíos inciertos | M8 | ✅ HECHO |
| 4 | Dashboard operativo | U2 | ✅ HECHO |
| 5 | Salud y puesta en marcha | F5 | ✅ HECHO |
| 6 | Garantía de backup | E7 (test) | ✅ test HECHO — drill con acta = A7/A8 del propietario |
| 7 | UX final: errores, ajustes, pulido | U3 · U4 · U5 | ✅ TODO HECHO (U5 `285ef2f`) |
| 8 | Integración y contratos | I1 · I2 · I3 | ✅ HECHO (workflow cron 04:30 UTC; fixtures; documento único) |
| 9 | Seguridad residual | S6 | ✅ HECHO (25 scripts archivados) · S1/S2 = **autorización** |
| 10 | Operación | O2 · O3 | ✅ HECHO (runbook + instalador) · O1/D2 = **autorización/externo** · O4 opcional |

**La construcción de las 32 tareas ejecutables del plan está COMPLETA salvo las 6 que requieren autorización específica (S1, S2, F1, D1, O1, D2) y la opcional O4.**

**Desbloqueos solo del propietario:** revocar token `ghp_w2tw…` expuesto en chat (URGENTE), A1 (PAT+PII_PEPPER en Actions), A3 (fusiones PR #6/#5 — desbloquea F1/D1), A7/A8 (worker en despliegue + drill de backup con acta), credenciales SMTP, decidir O1 (compose) y O4 (systemd) sobre el stack de despliegue.

---

## 5. Evidencia

- Cada tarea: commit con detalle, pruebas nuevas y verificación triple (tsc + eslint + next build).
- Matriz XLSX original intacta en esta rama (`MATRIZ-TRAZABILIDAD-CRM-ALBRA-2026-11-19.xlsx`).
- Este archivo reemplaza al CONTROL-AVANCE.md perdido en el reciclaje del sandbox y sirve como acta de fase para el informe al propietario.
