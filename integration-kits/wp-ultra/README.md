# Kits de integración WP/ULTRA — construcción del lado CRM

Esta carpeta concentra el trabajo del lado CRM-ALBRA para las **13 tareas del plan
clasificadas como dependencia externa** (S3, S4, S7, M2, M3, M4, M6, I4, I5, I6, E5,
E6, F6): las soluciones viven en los repos WHATSPOWER / WHATSPOWER-ULTRA, cuyo
código este proyecto **no toca** (regla transversal del plan).

Lo que aporta cada kit:

1. **Código portable probado**: la lógica dura (crypto, pacing, guards, políticas)
   está extraída como módulo `.mjs` sin dependencias del CRM y con suite propia
   en `tests/kits/`. Se copia al repo destino tal cual.
2. **README de aplicación**: dónde va el código, qué migración/variable exige,
   cómo validarlo y cómo revertirlo.
3. **Paquetes de decisión** (`decisiones/`): para I4/I5/E5/E6, donde lo que falta
   no es código sino una decisión de diseño del propietario; el kit deja el
   análisis y el checklist listos para decidir en minutos.

## Regla de oro de aplicación

- El CRM **jamás** push hacia WP/ULTRA. Se aplica en un clone del repo destino,
  con rama propia (`impl/kit-<nombre>`), suite del repo destino en verde y PR
  para el propietario.
- Cada kit es **autocontenido**: si el README indica dependencias (p. ej.
  `better-sqlite3` en S4), se declara en el PR del repo destino.
- Los kits son **fail-closed por diseño**: ante falta de configuración devuelven
  error tipado o rechazan la operación — nunca degradan en silencio a un modo
  menos seguro.

## Mapa de kits

| Kit | Tareas del plan | Contenido |
| --- | --- | --- |
| `s4-durable-replay-cache/` | S4 (WP+ULTRA) | jti de un solo uso + rate limit PERSISTENTES en SQLite (sobreviven reinicios) |
| `s7-org-credentials-encrypted/` | S7 (WP+ULTRA) | AES-256-GCM v1 para credenciales por organización + migración de legacy |
| `s3-org-service-credentials/` | S3 (WP) | Bearer por organización timing-safe, fin del secreto operador global |
| `m2-bulk-consent/` | M2 (ULTRA) | Alta masiva de consentimiento (Ley 1581) con `consent_origin` auditable |
| `m3-meta-dispatch-guard/` | M3 (WP+ULTRA) | Ventana 24 h + plantillas + clasificador antes del despacho real |
| `m4-durable-pacing/` | M4 (ULTRA) | Pacing durable para `/step` manual (lease por campaña) |
| `m6-smoke-live-guard/` | M6 (ULTRA) | Guard destructivo: smoke-live no borra campañas ajenas |
| `i6-transport-policy/` | I6 (WP+ULTRA) | Selector de transporte por política por organización |
| `f6-payment-gateway/` | F6 (WP) | Adaptador WOMPI/MP/Stripe fail-closed sobre el simulador blindado |
| `decisiones/` | I4, I5, E5, E6 | Paquetes de decisión y checklists de reconciliación de ramas |

## Estado de las 13 tareas mientras el propietario no aplique

Cada kit convierte su tarea de «solo diagnosis» a «código listo para aplicar».
La tarea NO se declara terminada (la aplicación es en los repos externos y la
evidencia la da la suite del repo destino); `docs/CONTROL-AVANCE.md` mantiene
el estado `🌐 con kit listo` hasta que exista el PR aplicado en WP/ULTRA.
