# ACTA DE CIERRE FINAL — SESIÓN 6 (2026-11-20): consolidación total de ramas (A3/D2) + kits de integración WP/ULTRA

**Rama**: `impl/integracion-maestra-20261120` · **Estado inicial**: `8a9e08f` (sesión 5, U6) · **Estado final**: ver §6
**Mandato**: «implementar todo el plan por completo hasta terminar las 48 tareas» — se ejecuta todo lo construible en CRM-ALBRA; las piezas que viven fuera (repos WP/ULTRA, máquina del propietario) quedan en estado **código listo para aplicar** con evidencia de validación local.

---

## 1. Alcance de la sesión

1. **A3/D2 — revisión e integración de las 6 ramas con contenido único** que el acta de la sesión 4 dejó «para decisión del propietario».
2. **Kits de integración** para las 13 tareas clasificadas como dependencia externa (S3, S4, S7, M2, M3, M4, M6, I4, I5, I6, E5, E6, F6): el código portable se construye y se prueba en el CRM; los repos WP/ULTRA **no se tocan** (regla transversal del plan).
3. Cierre documental y de repositorio (archivo de las 6 ramas con etiquetas; consolidación 32→5 ramas en CRM-ALBRA).

## 2. Integración de las 6 ramas — decisión por rama con evidencia

### 2.1 `fix/whatsapp-production-media` (56 commits, +814/−55) → **PORT INTEGRADO** · commit `b934eec`

Verificación archivo por archivo contra la maestra; las partes superadas se descartaron con decisión escrita:

| Valor de la rama | Decisión | Evidencia en la maestra |
| --- | --- | --- |
| `src/lib/asr.ts`: validación base64 canónica + proveedor ASR por organización (`ASR_API_KEY` dedicada > LLM de la org > adaptador nativo) | **PORT** | `src/lib/asr.ts` (firma `(base64, orgId?, mime?)`, multipart `audio/transcriptions`) |
| `/api/whatsapp/transcribe`: header `X-WhatsApp-Org-Id` obligatorio + allowlist MIME (415) | **PORT** | `src/app/api/whatsapp/transcribe/route.ts` |
| Protecciones de visión (magic bytes, allowlist imagen, base64 canónico, techo 40 MP con sharp) | **PORT** sobre `describe-image` (no sobre la ruta analyze-image de la rama) | `src/lib/vision.ts` (`verifyImageSignature`, `IMAGE_MIME_TYPES`, `MAX_IMAGE_PIXELS`) + `src/app/api/whatsapp/describe-image/route.ts` |
| `daemon.mjs`: techos duros de descarga (25 MiB audio / 8 MiB imagen) + pipeline de imágenes + header de org | **PORT** | `src/whatsapp-daemon/daemon.mjs` + **nuevo** `src/whatsapp-daemon/media-guard.mjs` (módulo puro testeado) |
| `.env.example`: variables `ASR_*` | **PORT** | `.env.example` (sección nueva, pasada por el guard de higiene `env-example-hygiene`) |
| `docs/WHATSAPP_PRODUCTION_CHECKLIST.md` | **PORT adaptado** | doc creado con la realidad de la maestra (la sección «reliability boundary still open» de la rama quedó OBSOLETA: la outbox durable y el ledger de webhook YA existen) |
| `WhatsAppOutboundDelivery` (modelo + lib + endpoint worker) | **DESCARTADO — superado** | la maestra tiene `ChannelOutboundMessage` (lease, `unknown` jamás reenviado, reconciliación por operador) |
| `WhatsAppWebhookEvent` (ledger de dedupe de webhook) | **DESCARTADO — superado** | la maestra tiene dedupe durable por conexión+eventKey en el webhook de canal |
| `src/app/api/whatsapp/analyze-image/route.ts` + `analyzeImageBase64` en `ai.ts` | **DESCARTADO — superado** | `describe-image` dual-path (LLM de org + SDK) con caption; mayor cobertura |
| Tests de la rama (`whatsapp-outbox`, `whatsapp-image-analysis`) | **DESCARTADOS/SUPERADOS** | outbox → suite de channel-outbox; image-analysis → 5 casos nuevos en `describe-image.test.ts` + `tests/unit/vision-signature.test.ts` |

**Pruebas nuevas**: `tests/unit/daemon-media-guard.test.ts` (6), `tests/unit/vision-signature.test.ts` (6), voice.test.ts +4 casos (org requerida, 415 MIME, base64 inválido), describe-image.test.ts +4 casos (415 allowlist, 400 base64, 415 firma, 415 corrupto con sharp).

### 2.2 `fix/migration-safety-audit` (11 commits) → **PORT INTEGRADO** · commits `dde4207` (sesión 4) + `b855b9a`

- Los tests multiproceso del scheduler ya se portaron en D1. Esta sesión portó el **test concurrente en-proceso** faltante en `workflow-run-lease.test.ts` («allows only one database winner when identical triggers arrive concurrently»).
- **DESCARTADO — superado**: los 4 docs de auditoría de la rama (`CONTEXTO CRM/HISTORIAL_CAMBIOS.md`, `PENDIENTES.md`, `docs/CRM_CONTEXT.md`, `docs/STAGING_READINESS_CHECKLIST.md`): snapshots del 2026-11-19 con 107–207 líneas de desfase frente a la maestra; los documentos vivos (CONTROL-AVANCE, PRODUCTION_READINESS, actas) los superan.

### 2.3 `cierre/a-estabilizacion-y-deuda` (PR #5, +203/−3416) → **PORT INTEGRADO** · commit `b855b9a`

- La limpieza de dependencias ya se ejecutó como E3 (sesión 2). Faltaba la **migración de backfill** y su test: `prisma/migrations/zzzzzzz_quoteitem_org_backfill/migration.sql` (UPDATE puramente aditivo: `QuoteItem.organizationId` NULL hereda la org de su Quote padre) con numeración `zzz…` del estándar E2 + `tests/integration/quote-item-org-backfill.test.ts` (3 casos: reparación org-a/org-b, idempotencia de doble pasada, cero NULLs post-backfill; ejecuta EXACTAMENTE el SQL de la migración).

### 2.4 `fix/fase-correctiva-final` (+361/−36, 16 archivos) → **PORT INTEGRADO** · commit `c3665ab`

- El patrón B1 (`stripForeignClients`, allowlist con UNA query) existía en la maestra pero SOLO protegía `/api/dashboard`. Se portó a las **9 rutas restantes**: opportunities (list+detail+PUT), pipeline, quotes (list+detail+PUT+pdf), reservations (list+PUT+DELETE), export/csv (quotes y transactions).
- **No se añadió** la lib `multitenant.ts` de la rama (duplicaría el patrón); se usó la lib de la maestra (mejor: 1 query en vez de validación por fila).
- `tests/integration/historical-references.test.ts` (6 casos) portado y ampliado (kanban, reservas y CSV añadidos al alcance de la rama).
- **DESCARTADO — superado**: `docs/EVIDENCIA-CUARTA-FASE.md`, `docs/MATRIZ-TRAZABILIDAD-FASE3.md`, `MATRIZ-TRAZABILIDAD.xlsx`, `results-cuarta-fase.json` (documenos de fase antigua; la matriz viva es `docs/MATRIZ-TRAZABILIDAD.md` con check en CI).

### 2.5 `docs/plan-maestro-cierre-2026-11-19` (2 commits, +433) → **INTEGRADO por cherry-pick** · commits `677f4cc` + `828b49f`

Contenido puramente aditivo (plan v1: MD + xlsx + docx + pdf + 2 png en `docs/plan-maestro-2026-11-19/`), sin conflicto con la maestra. Valor: preserva el documento rector anterior para trazabilidad histórica.

### 2.6 `docs/context-crm-reorganization-20261107` (25 commits, +399/−16) → **NO SE FUSIONA (decisión escrita)**

- La rama reestructura `CONTEXTO CRM/` en subcarpetas numeradas (00_MASTER…11_KNOWLEDGE) desde una base con **876 commits de desfase**; un merge reescribiría archivos que las sesiones 1–5 modificaron (HISTORIAL_CAMBIOS, PENDIENTES, etc.).
- La arquitectura documental viva de la maestra (docs/ raíz: RUNBOOK, CONTRATOS, MATRIZ, actas, PRODUCTION_READINESS + `docs/historia/` para scripts e2e) cumple la MISMA función (índice por dominio, historial separado).
- **El contenido queda preservado e íntegro en la etiqueta** `archive/20261120-docs-context-crm-reorganization-20261107`; si el propietario quiere la estructura numerada, es un trabajo de reorganización futuro sobre el estado actual, no un merge.

## 3. Archivo de las 6 ramas (completa D2)

Etiquetas nuevas (SHA verificados con `git ls-remote` ANTES de crear cada tag):

| Etiqueta | SHA archivado |
| --- | --- |
| `archive/20261120-cierre-a-estabilizacion-y-deuda` | `1e5c9ae` |
| `archive/20261120-docs-context-crm-reorganization-20261107` | `3b9f311` |
| `archive/20261120-docs-plan-maestro-cierre-2026-11-19` | `a6fea94` |
| `archive/20261120-fix-fase-correctiva-final` | `e298eb9` |
| `archive/20261120-fix-migration-safety-audit` | `3074cae` |
| `archive/20261120-fix-whatsapp-production-media` | `c34988c` |

Tras crear las etiquetas y verificarlas en servidor, las 6 ramas se eliminaron de CRM-ALBRA. **Resultado**: el repo canónico queda en **5 ramas** (`main`, `impl/integracion-maestra-20261120`, `auditoria/matriz-trazabilidad-2026-11-19`, `backup-version-anterior`, `snapshot-v2.3`) + **28 etiquetas de archivo**. CRM-2 se conserva como espejo completo (no se toca) y recibe las etiquetas nuevas.

## 4. Kits de integración WP/ULTRA (13 dependencias externas) · commit `a920ba6`

`integration-kits/wp-ultra/` — código portable probado + README de aplicación por kit (dónde va, cableado, validación, reversión) + paquete de decisiones:

| Kit | Tarea | Garantía probada (51 tests de kits) |
| --- | --- | --- |
| `s4-durable-replay-cache` | S4 | jti único durable (replay tras «reinicio» bloqueado), rate limit atómico compartido entre instancias, TTL con re-canje tras expiración |
| `s7-org-credentials-encrypted` | S7 | AES-256-GCM v1: roundtrip, IV aleatorio, tamper → null, clave distinta → null, sin clave → error tipado, migración legacy idempotente |
| `s3-org-service-credentials` | S3 | org deducida de la credencial timing-safe; cross-org rechazada; config ausente → fail-closed |
| `m2-bulk-consent` | M2 | Ley 1581: 5 orígenes con evidencia por origen, fecha no futura, canal válido, duplicados, revocación tombstone |
| `m3-meta-dispatch-guard` | M3 | ventana 24 h + estados de plantilla; fail-closed sin último entrante (rechazos 131047/131048 evitados) |
| `m4-durable-pacing` | M4 | lease exclusivo por campaña, intervalo, cap diario, durabilidad al reabrir la BD |
| `m6-smoke-live-guard` | M6 | fail-closed sin tag; org ajena SIEMPRE protegida; force solo sobre propios de la corrida |
| `i6-transport-policy` | I6 | política por org con fail-fast en carga; fin de la variable global TRANSPORT |
| `f6-payment-gateway` | F6 | simulador EXPLÍCITO; proveedor real sin credenciales → error con variables faltantes; guardas de monto/moneda |
| `decisiones/` | I4, I5, E5, E6 | checklists de reconciliación pieza a pieza (patrón probado en §2) y opciones A/B/C para E5 |

Regla de aplicación (README raíz): jamás push desde el CRM; se aplica en clone del repo destino con rama propia y suite destino en verde.

## 5. Verificación final de la sesión

- **Suite**: **1104/1104 pruebas en 128 archivos** (1024 → 1104: +80).
- `tsc --noEmit`: 0 errores · `next build`: OK · `verify-doc-figures`: verde (bloque canónico 128/128/47/19/106).
- Guard de higiene `.env.example` (H3): verde con la sección ASR añadida.
- Sintaxis del daemon (`node --check`): OK tras el port de media.

## 6. Commits de la sesión (orden)

| Commit | Contenido |
| --- | --- |
| `b934eec` | Port de fix/whatsapp-production-media (ASR por org, transcribe endurecido, visión con firma binaria, media-guard del daemon, checklist, +22 pruebas) |
| `c3665ab` | Endurecimiento de referencias históricas cross-org en 9 rutas + test histórico (6 casos) |
| `b855b9a` | Backfill QuoteItem.org (PR #5) + test concurrente de lease (migration-safety-audit) + cifras |
| `ac3f642` | Allowlist de higiene para ASR_BASE_URL/ASR_MODEL + docs(plan v1) archivado |
| `a920ba6` | Kits de integración WP/ULTRA (9 libs + 9 README + decisiones + 51 pruebas) |
| `97c0b85` | Tipado JSDoc de kits + cifras canónicas 119→128 |

## 7. Estado del plan tras esta sesión

- **30 tareas terminadas** (incl. U6) + **D2 ampliada**: consolidación completa 32→5 ramas.
- **5 parciales** (S1, S2, I1, E7, O1): bloqueadas SOLO en acciones del propietario (revocar PAT, ventana de purga, PAT de lectura A7, drill con acta, `docker compose` en su máquina).
- **13 dependencias externas**: todas pasan de «solo diagnosis» a **kit listo para aplicar** (§4); la tarea se cierra cuando el PR exista en el repo destino.
- **2 descartadas** (M5, D3) con evidencia.
- **Resta construible en CRM-ALBRA: nada.**

## 8. Deuda declarada (ninguna nueva)

- La aplicación de los kits en WP/ULTRA y las acciones del propietario (S1/S2/A1/A3/A7/A8/O1/SMTP/F6-credenciales) siguen siendo el único camino pendiente del plan.
- El PAT usado para los push de esta sesión sigue expuesto en el historial del chat: **revocar es urgente (S1)**.
