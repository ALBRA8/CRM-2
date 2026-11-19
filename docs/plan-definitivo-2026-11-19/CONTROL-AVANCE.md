# Control de avance — Plan Definitivo CRM-ALBRA v2.0

Rama de construcción: `impl/construccion-fase3-20261120` (base `docs/plan-definitivo-crm-2026-11-19` @ `e9ad9df`).
Este documento se actualiza por tarea al cerrarla, con estado, archivos y pruebas.

## Estado por tarea (fases construibles)

| ID | Tarea | Estado | Evidencia |
| --- | --- | --- | --- |
| M1 | Worker outbox de canales en despliegue | Terminada (sesión previa, en PR #5) | worker + monitor; despliegue pendiente de A7 |
| S5 | Pepper PII en CI | Terminada (sesión previa) | CI verde |
| E1 | Diagnóstico CI PR #5 | Terminada (sesión previa) | PR #5 |
| E2 | Renumeración migraciones | Terminada (sesión previa) | migraciones renumeradas |
| F2 | UI de conexiones WhatsApp multi-número | **Terminada 2026-11-20** | commit F2; 803/803 tests |
| M7 | Criterio unificación doble bandeja | **Terminada 2026-11-20** | CRITERIO-BANDEJA-UNICA-M7.md; dedup + 14 tests |
| F3 | Filtros canal/cuenta + búsqueda bandeja | **Terminada 2026-11-20** | API + UI + 24 tests (unit 15, integ 9) |
| M8 | Reconciliación operable UNCERTAIN | **Terminada 2026-11-20** | vista operador + API + 22 tests |
| E4 | Readiness/CHANGELOG | En desarrollo | — |
| D4 | Check de cifras en CI | En desarrollo | — |
| E3 | Análisis | En desarrollo | — |
| F4 | — (fase 3/4) | Pendiente (siguiente en cola) | — |
| F5 | Salud / monitor de conexiones | Pendiente (orden recomendado tras F2/M7) | — |
| U1–U5 | Experiencia de usuario | Pendiente | U1 nav 5+1 aprobada por instrucción global |
| I1–I3 | Comerciales/instalación | Pendiente | — |
| E7 | E2E final | Pendiente | — |
| O2–O4 | Operación | Pendiente | — |
| S6 | Seguridad restante | Pendiente | — |
| S1, S2, F1, D1, O1, D2 | — | Requieren autorización específica del propietario | parte preparable se construye sin ejecutar efectos reales |
| M5, D3 | — | Descartadas (plan v2.0 §5.4) | — |
| U6 | — | Pospuesta (1 d; reactivable) | — |
| S3/S4/S7, M2/M3/M4/M6, I4/I5/I6, E5/E6, F6 | — | Dependencia externa | credenciales/despliegues del propietario |

## F2 — UI de conexiones WhatsApp multi-número (cerrada 2026-11-20)

**Alcance.** Nueva pestaña “Conexiones” en Ajustes (`src/components/settings/connections-tab.tsx`)
sobre la API ya probada de `WhatsAppConnection`, sin tocar la pestaña legacy “WhatsApp” (QR único).

- Lista de números por organización con estado real (pending/connected/disconnected/revoked/error),
  detalle (estado + motivo), fuente, última verificación y aviso de token por vencer (<7 d).
- Uso del plan: “N de M conexiones activas” + bloqueo del formulario al agotarse (la API responde 402).
- Conectar: formulario manual Cloud API (phoneNumberId + token; validación previa en cliente) y
  flujo oficial Embedded Signup de Meta (SDK dinámico + estado firmado anti-CSRF; deshabilitado
  fail-closed si el servidor no tiene META_APP_ID/SECRET).
- Desconectar: solo admin, con **doble confirmación** (hay que teclear `DESCONECTAR`).
- Verificar: revalida el token contra Graph API (`POST /[id]/verify`) y refleja el veredicto.
- Historial: diálogo con el registro de eventos (últimos 20) por conexión.
- Refresco pasivo cada 30 s + botón manual; permisos RBAC respetados (no-admin solo lectura).

**Archivos.** Nuevos: `src/lib/wa-connections-ui.ts` (helpers puros), `src/components/settings/connections-tab.tsx`,
`tests/unit/wa-connections-ui.test.ts`. Modificados: `src/lib/api.ts` (7 métodos nuevos),
`src/components/settings/settings-page.tsx` (pestaña “Conexiones”).

**Pruebas.** `npx tsc --noEmit` limpio; ESLint limpio; suite completa **803/803** (781 base + 22 nuevos:
badges de estado, etiquetas de eventos/fuente, uso del plan, validación de formulario, doble confirmación,
fechas/expiración, parseo del evento `WA_EMBEDDED_SIGNUP`, URL del SDK). Arranque de desarrollo verificado
(`/` 200; `/settings` 307 a login; servidor sin errores por el código nuevo).

**Criterios de aceptación.** Conectar, desconectar y ver estado desde la UI sin API manual — cumplido
(el estado refleja el veredicto real tras Verificar). Pendiente de validación visual con QR/daemon real:
queda para F5/prueba de punta con E2E.

**Reversión.** Componente y helpers aditivos; `git revert` del PR no toca API ni datos.

## M7 — Criterio de unificación de la doble bandeja (cerrada 2026-11-20)

**Criterio aplicado** (documentado en `docs/plan-definitivo-2026-11-19/CRITERIO-BANDEJA-UNICA-M7.md`):
canónico primero con respaldo del daemon.

- Las conversaciones canónicas (`cc:`) NUNCA se ocultan entre sí: mismo teléfono por dos números
  distintos = dos conversaciones legítimas (multi-número).
- Una fila legacy (`wa:/tg:/ig:/fb:`) cuya identidad (canal + contacto normalizado) coincide con
  cualquier canónica se OCULTA de la lista unificada; sus no leídos se SUMAN al canónico más
  reciente de esa identidad (ninguna señal de atención se pierda).
- Identidad: WhatsApp por teléfono normalizado a dígitos (daemon `57300…` vs Cloud `+57300…`);
  TG/IG/FB por handle exacto; filas sin identidad fiable no participan (fail-closed).
- CERO borrado de datos: dedup READ-ONLY; el historial legacy sigue íntegro en la ficha 360.

**Archivos.** `src/lib/inbox.ts` (función pura `dedupeInboxConversations` + aplicación en `listInbox`
+ cabecera actualizada con el criterio), `docs/plan-definitivo-2026-11-19/CRITERIO-BANDEJA-UNICA-M7.md`,
`tests/unit/inbox-dedup.test.ts` (14 pruebas nuevas).

**Pruebas.** tsc limpio; 14/14 dedup + 9/9 inbox existente; suite completa en verde.

**Criterios de aceptación.** Un contacto aparece una sola vez con canal y cuenta claros; el historial
completo sigue visible en la ficha — cumplido.

**Reversión.** `git revert` del commit; sin migraciones ni borrados, la vuelta atrás es limpia.

## F3 — Filtros por canal y cuenta + búsqueda en la bandeja (cerrada 2026-11-20)

**Alcance.** Extensión de `GET /api/inbox` con tres parámetros y controles en la bandeja:

- `channel=` con allowlist (whatsapp/telegram/instagram/facebook/tiktok; valor desconocido → 400).
- `connection=` cuenta conectada (displayName canónico); las filas legacy sin cuenta quedan excluidas.
- `q=` búsqueda libre por nombre, teléfono (normalizado a dígitos: '+57 300…', '57300…' y '300…'
  encuentran lo mismo) y último mensaje; insensible a mayúsculas.
- Los filtros se aplican DESPUÉS del dedup M7: la bandeja filtrada nunca muestra duplicados.
- Respuesta añade `accounts` (cuentas conectadas únicas) para el selector de la UI.

**UI.** `src/components/inbox/inbox-page.tsx`: chips de canal ahora filtran en servidor; caja de
búsqueda con debounce (300 ms) y selector “Todas las cuentas” por conexión; polling cada 12 s
conserva los filtros activos.

**Archivos.** `src/lib/inbox.ts` (`InboxFilters`, `filterInboxConversations` puro,
`listInboxAccounts`, `listInbox` con filtros), `src/app/api/inbox/route.ts`,
`src/components/inbox/inbox-page.tsx`; tests `tests/unit/inbox-filters.test.ts` (15) y
`tests/integration/inbox-filters.test.ts` (9).

**Pruebas.** tsc y ESLint limpios; suite completa **841/841**.

**Criterios de aceptación.** El filtro por conexión devuelve solo esa cuenta; la búsqueda encuentra
por nombre y teléfono — cumplido (verificado en integración con semilla multi-cuenta + legacy).

**Reversión.** Parámetros aditivos a la API; `git revert` limpia.

## M8 — Reconciliación operable de envíos UNCERTAIN (cerrada 2026-11-20)

**Alcance.** El operador resuelve un envío `unknown` desde la UI, sin SQL manual y con la MISMA
política de evidencia del endpoint interno (contrato del worker sin cambios):

- `GET /api/crm/outbox/uncertain` (JWT + admin, por organización): inciertos y `sending`
  sospechosos (≥3 intentos), con canal, contacto, cuerpo truncado, intentos y código del proveedor.
- `POST /api/crm/outbox/uncertain` (JWT + admin): concilia UN intento reutilizando
  `reconcileUnknownChannelOutboundMessage` (CAS anti-doble-conciliación + verificación de eco).
  Evidencia obligatoria: `providerMessageId` (4-256 chars, sin saltos) O nota ≥10 caracteres.
  Sin evidencia → 400; ya resuelto → 409; de otra organización → 404 sin revelar nada.
- Auditoría: la librería registra `outbound_manually_reconciled_sent/failed` en la conexión.
- Vista admin: nueva pestaña “Envíos” en Ajustes (`outbox-tab.tsx`) con diálogo de conciliación;
  el botón queda deshabilitado sin evidencia (misma validación en cliente y servidor).

**Archivos.** `src/lib/outbox-ui.ts` (helpers puros), `src/app/api/crm/outbox/uncertain/route.ts`,
`src/components/settings/outbox-tab.tsx`, `src/lib/api.ts` (2 métodos), settings-page (pestaña);
tests `tests/unit/outbox-ui.test.ts` (11) y `tests/integration/outbox-uncertain.test.ts` (11).

**Pruebas.** tsc y ESLint limpios; suite completa **863/863**. Flujo probado de punta a punta con
BD efímera: unknown → evidencia → sent/failed auditado; denegación sin evidencia; 409/404/403.

**Criterios de aceptación.** El operador resuelve un incierto sin SQL manual, con auditoría del
caso — cumplido.

**Reversión.** Vista y ruta aditivas; endpoints internos intactos; `git revert` limpia.
Nota de dependencia externa: los inciertos que solo existen dentro de WP (fuera de CRM-ALBRA)
quedan fuera de esta vista, según el plan.
