# MATRIZ DE TRAZABILIDAD — afirmación → evidencia (D4)

**Versión**: 1.0 · **2026-11-20** · Tarea F7-T04 (D4) del PLAN DEFINITIVO CRM-ALBRA v2.0

Regla que cierra la «falsa confianza» documental: **ninguna afirmación estructural
del CRM se declara sin test, script de verificación o archivo que la respalde**.
Esta matriz solo recoge afirmaciones AUTOMATIZABLES (el resto se ancla a PRs y
runs de CI). El check `scripts/verify-doc-figures.mjs` corre en CI tras la suite
(`.github/workflows/ci.yml`) y falla si el bloque canónico de cifras de
`PRODUCTION_READINESS.md` deja de coincidir con el código.

## Cómo usarla

- Cada fila: la afirmación, SU evidencia (archivo real) y cómo se re-verifica.
- Al añadir una afirmación nueva a la documentación operativa, añade su fila aquí
  o conviértela en verificable; el reviewer rechaza afirmaciones sin evidencia.

## Matriz

| # | Afirmación | Evidencia | Re-verificación |
| --- | --- | --- | --- |
| 1 | La documentación cita cifras reales (128 rutas, 110 archivos de prueba, 47 modelos, 18 migraciones, 105 componentes) | Bloque canónico en `PRODUCTION_READINESS.md` (sección «Verificación 2026-11-20») | `node scripts/verify-doc-figures.mjs` (en CI) |
| 2 | Las 128 rutas API están documentadas con archivo y protección reales | `docs/CONTRATOS-ECOSISTEMA.md` (tabla generada contra el código) | `scripts/gen_contratos_ecosistema.py` + fila 1 |
| 3 | Menú 5+1 con UNA sola bandeja; nada queda inaccesible | `src/lib/nav.ts` + `tests/unit/nav.test.ts` (14 pruebas) | suite |
| 4 | Bandeja unificada sin duplicados (canónico primero, legacy respaldo) | `src/lib/inbox.ts` (`dedupeInboxConversations`) + `tests/unit/inbox.test.ts`; criterio en `docs/CRITERIO-BANDEJA-UNICA.md` | suite |
| 5 | Bandeja filtra por canal/cuenta y busca (server-side) | `tests/unit/inbox.test.ts` + integración de `src/app/api/inbox/route.ts` | suite |
| 6 | UI de conexiones multi-número con estados reales del daemon | `src/lib/wa-connections-ui.ts` + `tests/unit/wa-connections-ui.test.ts` + `tests/integration/wa-connections.test.ts` | suite |
| 7 | Agenda con vistas semana/día y huecos libres (canceladas no bloquean) | `src/lib/agenda-vistas.ts` + `tests/unit/agenda-vistas.test.ts` (18 pruebas) | suite |
| 8 | Salud por organización con wizard que se marca solo al validar de verdad | `src/lib/health-ui.ts` + `tests/unit/health-ui.test.ts` + `src/app/api/doctor/route.ts` (check `test-send`) | suite |
| 9 | Doctor aislado por organización (P0.2: sin escritura cross-tenant) | `src/app/api/doctor/route.ts` + `tests/unit/doctor-isolation.test.ts` + `tests/integration/doctor.test.ts` | suite |
| 10 | Dashboard "Requiere atención" con motivos reales y accionables | `src/lib/atencion.ts` + `tests/unit/atencion.test.ts` | suite |
| 11 | Errores accionables: sin archivos ni comandos en textos de UI | `src/lib/errores.ts` + invariante en `tests/unit/errores.test.ts` (13 pruebas) | suite |
| 12 | Ajustes agrupados por dominio sin tabs huérfanos; deep-links ?tab= preservados | `src/lib/settings-dominios.ts` + `tests/unit/settings-dominios.test.ts` (10 pruebas) | suite |
| 13 | Aislamiento multi-tenant probado negativamente (cross-org ⇒ 404 sin oráculo) | `tests/integration/multitenancy.test.ts`, `tests/integration/cross-org-references.test.ts`, `tests/integration/tenant-route-hardening.test.ts`, `tests/unit/dashboard-org-isolation.test.ts` | suite |
| 14 | RBAC: capacidades por rol con comodines, fail-closed | `src/lib/rbac.ts` + `tests/unit/rbac.test.ts`, `tests/unit/superadmin-rbac.test.ts`, `tests/integration/rbac-gaps.test.ts` | suite |
| 15 | Credenciales y secretos en reposo cifrados (AES-256-GCM) | `src/lib/crypto.ts` + `tests/unit/crypto.test.ts` | suite |
| 16 | 2FA TOTP con revocación persistente | `tests/integration/two-factor.test.ts` | suite |
| 17 | Denylist PII con HMAC-SHA256 y pepper obligatorio en CI | `scripts/check-pii.mjs` + paso CI «Escáner de PII» + `tests/security/scan-secrets.test.ts` | CI |
| 18 | Sin secretos literales versionados (escáner en verde) | `scripts/scan-secrets.mjs` + `scripts/security/secret-allowlist.json` + paso CI «Escáner de secretos» | CI |
| 19 | Outbox de canales: `unknown` jamás se reintenta; conciliación exige evidencia | `src/lib/channel-outbox.ts` + `tests/integration/channel-outbox.test.ts`, `tests/integration/outbox-reconciliation.test.ts` | suite |
| 20 | Daemon idempotente por organización (sesiones separadas, P0.1) | `src/whatsapp-daemon/daemon.mjs` + `tests/unit/daemon-idempotency.test.ts` + `tests/unit/whatsapp-session-verdict.test.ts` | suite |
| 21 | Backup/restore verificado por test automatizado (roundtrip) | `tests/integration/backup-restore-roundtrip.test.ts` + `tests/integration/backup-hardening.test.ts` + `scripts/backup-restore-drill.sh` (drill con acta: A8, propiedad del dueño) | suite + drill |
| 22 | Instalador idempotente: doble pasada no toca .env ni datos | `scripts/instalar-crm.sh` (hashes idénticos tras doble pasada; commit O3 2026-11-20) | re-ejecutar 2× |
| 23 | Runbook único operativo | `docs/RUNBOOK-CRM.md` (enlazado desde README; drill de restauración guiado por él) | revisión manual en cada PR de operación |
| 24 | Migraciones versionadas deterministas en instalación limpia | `prisma/migrations/` (convención documentada en `docs/MIGRACIONES.md`) + paso CI «Migraciones Prisma en SQLite temporal» | CI |
| 25 | Suite en verde antes de cada commit de construcción (850→868→884→898→907→920→930→935→955) | histórico de commits por tarea (git log de ramas `impl/*`) + paso CI «Suite de tests» | CI |

## Fuera de alcance de esta matriz (dependencias externas)

Las garantías de WHATSPOWER (2A), WHATSPOWER-ULTRA (2B) y AGENTE-LEADS se
documentan y verifican en SUS repositorios (contrato v1.1.0:
`docs/INTEGRATION_CONTRACT.md`). El webhook de AGENTE-LEADS tiene el campo de
secreto en el esquema del CRM pero su endpoint no está implementado aquí
(marcado en `docs/CONTRATOS-ECOSISTEMA.md`) — ninguna fila de esta matriz lo
declara operativo.

## Mantenimiento

1. Cada PR que cambia `src/app/api/**`, `prisma/schema.prisma` o cifras del
   bloque canónico debe actualizar la fila correspondiente (el CI fallará si las
   cifras se desalinean).
2. Tarea cerrada cuando: check en CI verde + caso negativo probado (una cifra
   falsa hace fallar el check) — ambos verificados en E4/D4 (2026-11-20).
