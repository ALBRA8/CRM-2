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
| E4 | Readiness/CHANGELOG | En desarrollo | — |
| D4 | Check de cifras en CI | En desarrollo | — |
| E3 | Análisis | En desarrollo | — |
| M7 | Criterio unificación doble bandeja | Pendiente (siguiente en cola) | — |
| F3 | Filtros canal/cuenta + búsqueda bandeja | Pendiente (depende de M7) | — |
| M8 | Reconciliación operable UNCERTAIN | Pendiente | — |
| F4 | — (fase 3/4) | Pendiente | — |
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
