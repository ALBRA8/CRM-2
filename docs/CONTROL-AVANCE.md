# CONTROL DE AVANCE — PLAN DEFINITIVO CRM-ALBRA v2.0

**Fecha de actualización**: 2026-11-20 · **Sesión de construcción**: F2 → M7 → F3 → M8 → E7
**Documento rector**: `docs/plan-definitivo-2026-11-19/PLAN-DEFINITIVO-CRM-ALBRA.md` (48 tareas, 7 fases)
**Matriz de trazabilidad** (auditoría previa): rama `auditoria/matriz-trazabilidad-2026-11-19`

## Resumen por estado (48 tareas)

| Estado | Cantidad | Tareas |
| --- | --- | --- |
| ✅ Terminadas | **9** | M1, S5, E1, E2 · **F2, M7, F3, M8, E7** (esta sesión) |
| 🔄 En desarrollo | 2 | E4 (readiness/CHANGELOG), D4 (check de cifras en CI) |
| 🔍 En análisis | 1 | E3 (limpieza de código muerto: 8 dependencias sin uso identificadas) |
| ⏳ Pendientes | **14** | F4, F5, U1, U2, U3, U4, U5, I1, I2, I3, O2, O3, O4, S6 |
| 🔐 Requieren autorización específica | 6 | S1, S2, F1, D1, O1, D2 |
| 🌐 Dependencia externa | 13 | S3, S4, S7, M2, M3, M4, M6, I4, I5, I6, E5, E6, F6 |
| ❌ Descartadas | 2 | M5 (obsoleta: ya en base), D3 (duplicada en E4) |
| ⏸ Pospuesta | 1 | U6 (semillas sectoriales, ~1 d al activarla) |

## Detalle de las tareas terminadas ESTA SESIÓN (2026-11-20)

Cada tarea: rama de construcción → pruebas locales (Vitest completo, tsc, eslint, next build) → commit → push verificado a `github.com/ALBRA8/CRM-2`.

| ID | Tarea | Rama / commit | Archivos clave | Pruebas | Evidencia |
| --- | --- | --- | --- | --- | --- |
| **F2** | UI de conexiones WhatsApp multi-número (F3-T02) | `impl/f2-conexiones-whatsapp-ui` · `c2b20cc` | `src/lib/wa-connections-ui.ts` (modelo puro), `src/components/settings/connections-tab.tsx`, `src/lib/api.ts`, `settings-page.tsx` (tab «Números WA») | +28 unitarios (estados, permisos, cupo, doble confirmación, payload STUB del daemon) · 809/809 | Tab en Ajustes→Canales→Números WA: alta manual Cloud API, Embedded Signup, verificar, desconectar con confirmación doble, historial de eventos, QR Baileys con veredicto P0.1 |
| **M7** | Criterio de unificación de la doble bandeja (F3-T03) | `impl/m7-unificacion-bandeja` · `1fe8041` | `src/lib/inbox.ts` (`dedupeInboxConversations`, `inboxIdentity`), `docs/CRITERIO-BANDEJA-UNICA.md` | +10 unitarios (contacto en AMBAS fuentes, respaldo, fail-open, inmutabilidad) · 821/821 | Criterio «canónico primero, legacy como respaldo» documentado y reversible (A10 pendiente de firma); sin borrados; historial íntegro en ficha 360 |
| **F3** | Filtros por canal/cuenta + búsqueda en bandeja (F3-T04) | `impl/f3-filtros-bandeja` · `9e0d271` | `src/lib/inbox.ts` (`InboxFilters`, `filterInboxConversations`, `normalizeSearchText`), `src/app/api/inbox/route.ts`, `src/components/inbox/inbox-page.tsx` | +10 unitarios y +6 integración (canal inválido 400, cross-org, combinados) · 837/837 · build OK | Filtros SERVER-SIDE antes del recorte: `?channel` `?connection` `?q` (sin acentos); búsqueda con debounce, selector de cuenta, polling que respeta filtros |
| **M8** | Conciliación operable de envíos UNCERTAIN (F3-T05, MODIFICADA) | `impl/m8-reconciliacion-uncertain` · `c108b40` | `src/app/api/admin/outbox/uncertain/*`, `src/components/settings/outbox-tab.tsx`, `settings-page.tsx` (tab «Envíos») | +10 integración (flujo completo con evidencia, denegaciones, 409 de carrera, 404 cross-org) · 847/847 · build OK | El operador resuelve unknown sin SQL: lista de inciertos por org, evidencia obligatoria (`providerChecked` + `providerMessageId` en sent), auditoría del caso. Endpoints internos sin cambios de contrato |
| **E7** | Test automatizado backup/restore roundtrip (F6-T04, MODIFICADA) | `impl/e7-backup-restore-test` · `6d2a617` | `tests/integration/backup-restore-roundtrip.test.ts` | +3 (roundtrip íntegro, script real exit 0, fuente dañada exit 2) · 850/850 · tsc 0 | Restaure verificado por test (integridad + conteos + contenido exacto). El drill con acta queda para el propietario (A8) — **parcial**: falta esa evidencia |

**Estado de la suite**: 850/850 pruebas en 99 archivos · `tsc --noEmit` 0 errores · eslint limpio · `next build` OK.

## Camino al piloto (recalculado tras esta sesión)

```
Hecho ──────────────────────────────────────────────────────
F2 ✔ → M7 ✔ → F3 ✔ → M8 ✔ → E7 ✔
Siguiente ola (sin autorización, ~4-5 d):
  F4 (agenda semana/día) → F5 (pantalla de Salud) → U1 (nav 5+1)
  → U2-U5 (dashboard atención, catálogo errores, ajustes, pulido)
  → I3 + O3 (contratos doc, instalador) → S6 (saneamiento scripts) → O2 (runbook)
Cierra E4/D4/E3 (en desarrollo/análisis)
Requieren autorización específica del propietario (preparadas, no ejecutadas):
  S1 (rotar token expuesto en chat) · S2 (purga historial) · F1 (merge PR #6)
  · D1 (destino de ramas de integración) · O1 (compose en su máquina) · D2 (consolidar ramas)
```

## Desbloqueos que solo el propietario puede hacer

1. **URGENTE — revocar el token `ghp_w2tw…`** que quedó expuesto en el chat (tarea S1; mientras viva, cualquier lector del chat puede escribir en CRM-2).
2. A1: PAT + `PII_PEPPER` como secretos de GitHub Actions.
3. A3: destino de las ramas de integración / merge de PR #6 (F1) y PR #5 (E1).
4. A7/A8: worker de outbox en el despliegue real y drill de backup con acta firmada (E7).
5. Credenciales SMTP reales (notificaciones) — opcional para el piloto.

## Reglas de esta construcción (cumplidas)

- Prohibido tocar WhatsPower/WhatsPower-Ultra ✓ (todo el trabajo en CRM-ALBRA)
- Sin migraciones destructivas, sin despliegues, sin WhatsApp real, sin rotación de credenciales, sin operaciones Git destructivas ✓
- Cada tarea: rama propia, pruebas en verde antes de commitear, push verificado a CRM-2 ✓
- Criterios por defecto cuando el plan deja decisión abierta: documentados como reversibles (M7/A10) ✓
