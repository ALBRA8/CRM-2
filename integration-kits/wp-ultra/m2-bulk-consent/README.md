# Kit M2 — Alta masiva de consentimiento (Ley 1581)

**Tarea del plan**: M2 (ULTRA). **Decisión legal**: del propietario — el kit NO fabrica consentimientos; procesa los REALES con evidencia.

## Qué resuelve

Las campañas de ULTRA saltan a `SKIPPED_NO_CONSENT` o invitan a fabricar consentimientos. Con el kit: un endpoint de bulk que acepta SOLO consentimientos con origen de catálogo cerrado, evidencia y fecha coherente; revocación como tombstone auditable (jamás borrado).

## Dónde va

1. **Schema (ALTER aditivo, sin destructivos)**:

```sql
ALTER TABLE Contact ADD COLUMN consentOrigin TEXT;
ALTER TABLE Contact ADD COLUMN consentEvidence TEXT;   -- JSON de evidencia
ALTER TABLE Contact ADD COLUMN consentObtainedAt TEXT; -- ISO 8601
ALTER TABLE Contact ADD COLUMN consentRevokedAt TEXT;
CREATE INDEX IF NOT EXISTS idx_contact_consent_origin ON Contact (consentOrigin);
```

2. Copia `bulk-consent.mjs` y crea el endpoint (express/fastify) que llame a `processBulkConsent(rows)` y persista `accepted` en UNA transacción (INSERT ... ON CONFLICT(contactId) DO UPDATE para re-consentimientos).

## Reglas que ya implementa (testeadas)

- origen: `web_form | double_optin | physical_written | call_recording | contract` (catálogo cerrado)
- evidencia por origen: URL del formulario / id de confirmación / referencia del documento / id de grabación / referencia de contrato
- `obtainedAt` ISO válida y NO futura (bloquea consentimiento fabricado)
- canal: `+57XXXXXXXXXX` (E.164 Colombia) o email válido
- duplicados dentro del lote → rechazados con índice y motivo
- `revocationUpdate(contactId, revokedAt)` → tombstone `origin='revoked'`

## Respuesta del endpoint sugerida

```json
{ "accepted": 42, "rejected": [{ "index": 7, "reason": "evidencia insuficiente para consentOrigin=web_form" }] }
```

## Validación (en el repo destino)

1. Suite del kit (`tests/kits/m2-*.test.ts`): lote mixto válido/inválido, fecha futura rechazada, duplicados, revocación.
2. Campaña de prueba: `SKIPPED_NO_CONSENT` desaparece para los contactos con consentimiento cargado y evidencia.

## Reversión

ALTER aditivo → revertir el PR no pierde datos (las columnas quedan, se dejan de usar).
