# MATRIZ DE PRODUCCIÓN REAL — CRM-ALBRA (2026-11-17)

**Rama:** `repair/produccion-real` · **Método:** evidencia EJECUTADA en la sesión.

## Veredicto final transparente (sesión reparación 2026-11-17)

| Área | Veredicto | Evidencia |
|---|---|---|
| Daemon WhatsApp: bind, secreto timing-safe, origen exacto | ✅ CERRADO | 127.0.0.1 default; SHA-256+timingSafeEqual; new URL().origin exacto — 6 pruebas vitest (incluida verificación de bind no-loopback contra la IP real) |
| Aislamiento tenant en rutas sin suite | ✅ CERRADO | 22 pruebas nuevas (OAuth social, team, knowledge, custom-fields, /api/internal): 401/403/404 sin oráculo + efecto cero |
| Defensa en profundidad en updates/deletes por id | ✅ CERRADO | WHERE id AND organization_id explícito en api-keys, custom-fields, knowledge, saved-views, team; auditoría de 122 rutas [id] sin vulnerabilidades restantes |
| Matriz de paridad sincera | ✅ CERRADO | "Rotación de líneas" → No implementada (requiere integración futura) |
| .gitignore (pdf/backups/temp) | ✅ CERRADO | Reglas añadidas; árbol sin artefactos rastreados |
| Suite completa | ✅ LISTO | **764/764** (vitest; cliente Prisma regenerado tras cambiar de rama) |
| Secretos | ✅ LIMPIO | security:scan 0 hallazgos en el árbol |
| Docker compose | ⛔ PENDIENTE (dueño) | Sin docker en el entorno; Dockerfile multi-stage revisado estáticamente |
| Purga de historial git | 🟦 DECISIÓN DEL DUEÑO | NO se reescribe (regla); scan-history sin hallazgos nuevos |

---

# MATRIZ DE PRODUCCIÓN REAL — CRM-ALBRA (histórico 2026-11-15)

**Rama:** `repair/produccion-real` · **Método:** cada casilla con evidencia EJECUTADA en esta sesión (comando y resultado), no declaraciones.
**Regla de oro:** nada se marca listo sin prueba real. Los pendientes del dueño viven en `OWNER_TODO.md`.

## A. Construcción y calidad

| Casilla | Estado | Evidencia ejecutada |
|---|---|---|
| TypeScript `tsc --noEmit` | ✅ LISTO | exit 0, 0 errores |
| Suite completa | ✅ LISTO | **736/736** en 92 archivos (vitest, 92 workers) |
| ESLint | ✅ LISTO | exit 0, 0 errores / 0 avisos |
| `npm audit` | ✅ LISTO | 0 vulnerabilidades |
| Escáner de secretos (árbol) | ✅ LISTO | `npm run security:scan` exit 0: "Sin secretos detectados en el árbol" |
| Escáner de secretos (historial completo) | ✅ LISTO | `npm run security:scan:history` exit 0: sin hallazgos NUEVOS; 400 entradas de baseline (82 históricas ROTACION-PENDIENTE + 318 fixtures dummy verificados uno a uno) |
| Versiones Node alineadas | ✅ LISTO | `engines.node >=22.12.0` + `.nvmrc` 22.14 = igual que WP/ULTRA; CI en Node 22 |
| Docker compose (build+arranque) | ⛔ NO EJECUTADO | Sin docker en el entorno de trabajo. Dockerfile y compose presentes. Tarea del PC (OWNER_TODO §4) |
| Build de producción Next.js | ⚠️ NO RE-EJECUTADO en esta sesión | CI lo ejecuta (runs success previos); el E2E corrió con `next dev`. Re-ejecutar en el PC antes de desplegar |

## B. Seguridad y cumplimiento

| Casilla | Estado | Evidencia ejecutada |
|---|---|---|
| Sin PII real en árbol | ✅ LISTO | Teléfonos reales → dummies 573000000001/2 (commit 1f88101); grep de verificación en 0 |
| Sin secretos versionados | ✅ LISTO | Escáner árbol+historial en verde; credenciales demo parametrizadas fail-fast |
| Artefactos operativos fuera del repo | ✅ LISTO | 38 archivos retirados + .gitignore (commit e509a75) |
| Historial git purgado | ⛔ NO HECHO (regla) | Reportado, no purgado; requiere filter-repo + force-push del dueño (OWNER_TODO §1) |
| Fail-fast de secretos al arranque | ✅ LISTO (preexistente verificado) | `tests/unit/env-guard.test.ts` en suite 736/736 |
| Aislamiento multi-tenant | ✅ LISTO (preexistente verificado) | `dashboard-org-isolation`, `doctor-isolation`, `nicho-isolation`, `multitenancy`, `multitenant-p0` en verde |

## C. Integración con el ecosistema (2A/2B)

| Casilla | Estado | Evidencia ejecutada |
|---|---|---|
| Puente CRM→WP (HMAC v2, inbound y stage-change) | ✅ LISTO | E2E 3 servicios: webhook Meta firmado aceptado (200) y entregado a WP |
| Flujo WP → acción en CRM | ✅ LISTO | E2E: crm_action create_client → cliente creado y encontrado vía `GET /api/clients` |
| Daemon Baileys /send idempotente (B2) | ✅ LISTO | 6 pruebas nuevas (fallaban antes); reserva ANTES del envío; UNCERTAIN sin reenvío |
| Proxy multi-tenant fail-closed | ✅ LISTO | multitenant-p0 + proxy-send 19/19 tras restaurar entorno neutral |
| Cola/outbox canónica | ✅ LISTO (preexistente) | suites scheduler/outbox en 736/736 |

## D. E2E de los 3 servicios juntos (FASE 5)

| Casilla | Estado | Evidencia ejecutada |
|---|---|---|
| 3 servicios levantados en simulación | ✅ LISTO | CRM :3000 (next dev + prisma migrate sobre BD temporal) + WP :3003 + ULTRA :3004, ALLOW_REAL_DISPATCH=false en todos |
| Flujo completo mensaje→flujo→CRM | ✅ LISTO | 18/18 PASS en `scripts/e2e-3-servicios.mjs` |
| Campaña bloqueada por lock | ✅ LISTO | Ítem con lock → `LOCK_EXCLUDED` (checker 2B→2A real) |
| Campaña bloqueada por baja/consentimiento | ✅ LISTO | Sin consentimiento → `SKIPPED_NO_CONSENT` (JIT guard FASE 2) |
| Salvaguarda de envíos reales | ✅ LISTO | Contacto válido → `FAILED_FATAL`, SENT=0 en toda la campaña |

## E. UI (navegador real, Playwright/Chromium)

| Casilla | Estado | Evidencia ejecutada |
|---|---|---|
| Flow Studio carga + login | ✅ LISTO | 200; prompt de secreto atendido (11/11) |
| Paleta + addNode | ✅ LISTO | 7 ítems de paleta; clic añade nodo al lienzo (8→9) |
| Campaign Studio + Historial + métricas | ✅ LISTO | logTbody presente; mSent/mFailed/mSkipped/mTotal presentes |
| Vista móvil 390px | ✅ LISTO | overflow horizontal 0px en ambos studios |

## F. Bloqueos para producción (veredicto)

1. **Cuenta Meta Business + número oficial + plantillas aprobadas** — sin esto la FASE 1 no opera en producción (OWNER_TODO §2).
2. **Rotación del PAT y purga de historial** — credenciales compartidas en chat durante la reparación (OWNER_TODO §1).
3. **Docker/build en el PC** + `.env` reales + `prisma migrate deploy` (OWNER_TODO §4).
4. **Merge autorizado** de `repair/produccion-real` → `main` (nadie autorizó merge ni despliegue).
5. Los scripts E2E viejos (F6-8) deben migrarse o eliminarse antes de operar (no bloquean despliegue, sí bloquean higiene total).
