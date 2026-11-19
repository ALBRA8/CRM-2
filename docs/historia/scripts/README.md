# Historia — scripts e2e-* archivados (S6, 2026-11-20)

Este directorio conserva los 24 scripts `e2e-*` históricos que vivían en
`scripts/` y que **solo corrían en una máquina desaparecida**: rutas absolutas de
otro equipo, secretos dummy de la época y flujos que ya no representan la prueba
oficial del CRM.

**Por qué se archivaron** (tarea S6 / F1-T04 del PLAN DEFINITIVO CRM-ALBRA v2.0):
un solo flujo oficial elimina la pregunta «¿cuál corro?» y reduce la superficie
de fuga de credenciales. Se ARCHIVARON (no se borraron) para conservar la
historia íntegra y poder consultar cualquier detalle operativo antiguo.

**Flujo oficial vigente**: `scripts/e2e-3-servicios.mjs` — autocontenido y
multiplataforma, invocado con `npm run e2e:3`. Documentación:
`docs/MATRIZ-PRODUCCION-REAL.md` y README («E2E de tres servicios»).

## Inventario archivado

| Grupo | Archivos | Origen |
| --- | --- | --- |
| Canales/OAuth por fecha | `e2e-canales-2026-10-31.mjs`, `e2e-google-oauth-2026-10-31.sh`, `e2e-ig-oauth-2026-10-31.sh`, `e2e-tiktok-2026-10-31.sh`, `e2e-messenger-oauth-2026-11-03.sh` | Sesiones puntuales de OAuth por canal |
| Leads / WP Ultra | `e2e-leadstests.sh`, `e2e-leads-pipeline.ts`, `e2e-wp-main.mjs`, `e2e-wp-ultra.mjs`, `e2e-wp-ultra-engine.ts`, `e2e-wp-guard.ts`, `e2e-wp-bridge.mjs`, `e2e-wp-errores.mjs` | Pruebas históricas del puente con las capas 2A/2B |
| Publicación post-B | `e2e-postpub-A.mjs` … `e2e-postpub-D.mjs` | Verificaciones puntuales tras reparaciones |
| Misceláneos | `e2e-crm-battery.sh`, `e2e-errors.sh`, `e2e-final/` (suite completa con sus 12 archivos), `e2e-final.mjs`, `e2e-whatsapp-isolation.mjs`, `e2e-wait.sh`, `e2e-timeout-f.ts` | Baterías antiguas y harness clean-room |

## Cómo restaurar uno si hiciera falta

`git mv docs/historia/scripts/<archivo> scripts/<archivo>` en una rama nueva.
Antes de usarlo: sustituir rutas de la máquina antigua y regenerar los secretos
dummy que contenga (la allowlist `scripts/security/secret-allowlist.json` va
por huella sha256-12 del valor, no por ruta, por lo que el archivo sigue
cubierto tras el traslado — verificado con `npm run security:scan` exit 0).

**Nota de seguridad**: los valores literal que estos scripts contienen son
dummy verificados del e2e (categoría `dummy-verificado` en la allowlist del
escáner). Los hallazgos históricos reales siguen listados en
`scripts/security/secret-baseline.json` con estado `ROTACION-PENDIENTE`
(tarea S1/S2, decisión del propietario).
