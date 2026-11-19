# CONTROL DE AVANCE — PLAN DEFINITIVO CRM-ALBRA v2.0

**Fecha de actualización:** 2026-11-20 · **Sesión de construcción:** F2 → M7+F3 → M8 → U2 (F4-T02) → F5 → E7 → U3
**Repositorio de entrega:** ALBRA8/CRM-2 (todas las ramas verificadas con `git ls-remote`)
**Base canónica de construcción:** `docs/plan-definitivo-crm-2026-11-19` (commit `e9ad9df`)

---

## 1. Estado global de la matriz (48 tareas)

| Estado | Tareas |
|---|---|
| **Terminadas** (8 anteriores + 8 de esta sesión = 16) | M1, S5, E1, E2, **E4**, **D4** (cierre parcial) ← anteriores · **F2, M7, F3, M8, U2, F5, E7, U3** ← esta sesión |
| **En desarrollo / análisis** | E3 (análisis de dependencias muertas), E4 (readiness/CHANGELOG), D4 (check en CI) |
| **Pendientes construibles** | U1 (aprobada por instrucción global), U4, U5, I3, I2, S6, O2, O3, F4 (agenda, opcional) |
| **Requieren autorización específica del propietario** | S1, S2, F1, D1, O1, D2 |
| **Dependencia externa / bloqueadas** | 13 tareas del ecosistema WP/ULTRA |
| **Descartadas** | M5, D3 |
| **Pospuesta** | U6 |

**Tests:** 899/902 en verde (`npm test`). Los 3 fallos (`multitenant-p0`, `whatsapp-daemon-proxy-send`) son **PREEXISTENTES en la base** (verificados con `git stash` en `e9ad9df`) y pertenecen al proxy legacy del daemon — documentados para un fix posterior.

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

## 3. Camino restante hacia el piloto (actualizado)

| # | Paso | Tareas | Estado |
|---|---|---|---|
| 1 | Conexiones multi-número visibles | F2 | ✅ HECHO |
| 2 | Bandeja única confiable con filtros | M7+F3 | ✅ HECHO |
| 3 | Operación de envíos inciertos | M8 | ✅ HECHO |
| 4 | Dashboard operativo | U2 | ✅ HECHO |
| 5 | Salud y puesta en marcha | F5 | ✅ HECHO |
| 6 | Garantía de backup | E7 (test) | ✅ test HECHO — drill con acta = A7/A8 del propietario |
| 7 | UX final: errores, ajustes, pulido | U3 ✅ · U4 · U5 | U3 HECHO · U4/U5 pendientes |
| 8 | Fusiones de integración | F1 (PR #6), D1, I1/I2 | **bloqueado: A3 (propietario) o ejecutar yo con autorización** |
| 9 | Seguridad residual | S1, S2, S6 | S1/S2 = propietario; S6 construible (26 scripts) |
| 10 | Operación | O1, O2, O3, D2 | O2/O3 construibles; O1/D2 = autorización/externo |

**Desbloqueos solo del propietario:** revocar token `ghp_w2tw…` expuesto en chat (URGENTE), A1 (PAT+PII_PEPPER en Actions), A3 (fusiones PR #6/#5), A7/A8 (worker en despliegue + drill con acta), credenciales SMTP, A10 ya aplicado con criterio M7 aprobado.

---

## 4. Evidencia

- Cada tarea: commit con detalle, pruebas nuevas y verificación triple (tsc + eslint + next build).
- Matriz XLSX original intacta en esta rama (`MATRIZ-TRAZABILIDAD-CRM-ALBRA-2026-11-19.xlsx`).
- Este archivo reemplaza al CONTROL-AVANCE.md perdido en el reciclaje del sandbox y sirve como acta de fase para el informe al propietario.
