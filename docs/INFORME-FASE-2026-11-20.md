# INFORME DE FASE — Sesión de construcción 2026-11-20

**Alcance**: continuidad de la construcción del PLAN DEFINITIVO CRM-ALBRA v2.0 tras la auditoría y la subida de las 25 ramas a `github.com/ALBRA8/CRM-2`.
**Resultado**: **5 tareas terminadas** (F2, M7, F3, M8, E7) — 5 ramas nuevas subidas y verificadas — **sin incidencias de seguridad ni operaciones autorizadas-pendientes ejecutadas**.

## 1. Estado de partida

- Repo re-clonado en el sandbox tras reciclaje del entorno; árbol limpio (416 "cambios" eran solo bits de modo del sandbox, ignorados con `core.fileMode false`).
- Baseline verde: **781/781 pruebas** (96 archivos).
- Las 26 refs ya estaban verificadas en CRM-2, incluida la rama de auditoría `7b62551`.

## 2. Tareas construidas (en orden de ejecución)

### F2 — UI de conexiones WhatsApp multi-número (`c2b20cc`, 1243 líneas)
La API `wa-connections` existía probada pero sin ninguna pantalla. Se construyó la pantalla **Ajustes → Canales → Números WA** sobre un **modelo puro** (`wa-connections-ui.ts`, regla 9 del repo): metadatos de estado fail-closed, gating de acciones por rol, cupo del plan, máquina de confirmación doble de desconexión (auto-cancelada a los 6 s), badge de sesión QR derivado del veredicto P0.1 con payloads stub del daemon multi-org. Alta manual Cloud API (token pegado una vez y cifrado server-side), botón de Embedded Signup (flujo oficial de Meta), verificación contra Graph, desconexión con destrucción de token, historial de eventos de auditoría. No-admins: solo lectura. +28 pruebas unitarias.

### M7 — Unificación de la doble bandeja (`1fe8041`, +283 líneas)
`listInbox` concatenaba 5 fuentes sin deduplicar: un contacto podía aparecer dos veces (legacy daemon/timeline vs canónica). Criterio implementado como función pura `dedupeInboxConversations` — **«canónico primero, legacy como respaldo»** (opción recomendada del plan, pendiente de firma A10): identidad por canal+handle normalizado (el `+` del webhook y el E.164 del daemon colisionan), canónicas nunca colapsadas entre sí (dos números conectados = dos hilos reales), fail-open sin identidad. **Sin borrados de datos ni modelos**; historial íntegro en ficha 360. Documentado en `docs/CRITERIO-BANDEJA-UNICA.md` con reglas de reversibilidad. +10 pruebas.

### F3 — Filtros por canal/cuenta + búsqueda en la bandeja (`9e0d271`, +385 líneas)
Corrige dos cosas a la vez: la UX (con varios números y canales no había búsqueda) y la corrección del recorte — el filtrado client-side previo se aplicaba DESPUÉS del `slice(100)`, dejando ventanas medio vacías. Ahora `GET /api/inbox` acepta `?channel` (lista cerrada, canal desconocido → 400), `?connection` (solo canónicas; las legacy no se atribuyen a cuentas sin evidencia) y `?q` (nombre, handle y último mensaje, sin acentos ni case). UI: búsqueda con debounce de 300 ms, selector de cuenta con catálogo que no se encoge al filtrar, botón «Limpiar», polling de 12 s que respeta los filtros. +10 unitarios y +6 de integración. `next build` verificado.

### M8 — Conciliación operable de envíos UNCERTAIN (`c108b40`, +727 líneas)
La política («unknown jamás reintentado; conciliar exige evidencia») existía pero exigía SQL manual. Nueva pantalla **Ajustes → Envíos** (solo admins): conteos de la outbox de la organización, lista de inciertos con contexto (canal, cuenta, contacto, cuerpo, código del proveedor, antigüedad), resolución `sent`/`failed` con **evidencia obligatoria** (`providerChecked` + `providerMessageId` cuando se confirma envío). Rutas nuevas `/api/admin/outbox/uncertain[+/reconcile]` con sesión JWT, `requireAdmin` y aislamiento por organización (gate de propiedad ANTES de la lib; cross-org → 404; carrera → 409). **Los endpoints internos con secreto de worker no cambian de contrato.** Nunca vuelve a `queued`, nunca llama a la red; el caso queda auditado (`outbound_manually_reconciled_*`). +10 pruebas de integración con el ciclo real (claim → sending → unknown → conciliación).

### E7 — Test automatizado de backup/restore (`6d2a617`, +180 líneas)
Roundtrip completo con la mecánica exacta de producción: BD sintética en WAL → snapshot Online Backup API + `integrity_check` → escrituras post-snapshot → destrucción controlada → restauración → verificación de integridad, conteos EXACTOS, contenido idéntico y ausencia de filas post-snapshot. Además `scripts/sqlite-backup.cjs` se ejecuta como subproceso real: exit 0 con BD sana y **exit 2 con fuente dañada** (un backup silenciosamente dañado no pasa). No toca la BD real. La parte restante de E7 (drill con acta firmada) es del propietario (decisión A8) y no cambia.

## 3. Calidad

| Métrica | Inicio | Fin |
| --- | --- | --- |
| Pruebas Vitest | 781/781 (96 archivos) | **850/850 (99 archivos)** |
| `tsc --noEmit` | 0 errores | **0 errores** |
| eslint | limpio | **limpio** |
| `next build` | OK | **OK** (verificado tras F3 y M8) |

Cada tarea se construyó en rama propia, se verificó en verde ANTES de commitear y se subió a CRM-2 con verificación de ref remota.

## 4. Decisiones por defecto adoptadas (documentadas y reversibles)

| Decisión | Tarea | Qué se adoptó | Cómo se revierte |
| --- | --- | --- | --- |
| A10 (criterio de bandeja) | M7 | «Canónico primero, legacy como respaldo» | Invertir reglas en `dedupeInboxConversations` o no llamarla; `git revert` limpio |
| Evidencia mínima de conciliación | M8 | `sent` exige `providerMessageId` (el endpoint interno lo deja opcional) | Ajustar un guard en la ruta admin |
| Ubicación de M8 | M8 | Tab «Envíos» en Ajustes (F5 construirá la pantalla de Salud completa; se puede mover tal cual) | Mover el componente |

## 5. Riesgos y observaciones

- **Artefacto de renderizado en el chat**: varias lecturas de código mostraban corchetes `[m` «comidos» (p. ej. `const [messages` → `const essages]`). Verificado con `od`/`grep -c` en tres casos: el contenido real de los archivos SIEMPRE estuvo íntegro; `tsc` 0 errores y la suite completa en verde lo confirman. Ningún archivo quedó dañado.
- La tarea **E7 queda parcial**: el test está en CI; falta el drill con acta (A8, máquina del propietario).
- El token PAT de GitHub sigue expuesto en el historial del chat: **revocarlo ya** (S1).

## 6. Siguiente ola recomendada (sin autorización adicional)

1. **F4** — Agenda con vistas semana/día (2 d)
2. **F5** — Pantalla de Salud y puesta en marcha guiada (1,5 d)
3. **U1** — Navegación única 5+1 y una sola bandeja (1,5 d)
4. **U2–U5** — Dashboard de atención, catálogo de errores, ajustes agrupados, pulido visual
5. **I3 + O3 + S6 + O2** — contratos documentados, instalador idempotente, saneamiento de 26 scripts, runbook único
6. Cierre de **E4/D4/E3**

Total estimado de la ola: ~9 d de trabajo constructivo sin bloqueos.
