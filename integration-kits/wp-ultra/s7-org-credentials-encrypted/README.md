# Kit S7 — Credenciales por organización cifradas en reposo (AES-256-GCM)

**Tarea del plan**: S7 (WP + ULTRA). **Fuente del patrón**: CRM `src/lib/crypto.ts` (formato `v1:iv:tag:ciphertext`, clave derivada por SHA-256 de variable externa, migración legacy, hash de lookup A2-23) — idéntico al descifrado que ya hace el CRM al leer las integraciones de WP.

## Qué resuelve

Tokens Meta/credenciales guardados en `.env` plano o en columnas sin cifrar. Con el kit: cada credencial por organización se guarda cifrada AES-256-GCM con autenticación (GCM tag): una alteración del ciphertext se detecta (decrypt → null, fail-closed).

## Dónde va

- Copia `org-credentials-crypto.mjs` al módulo de credenciales del repo destino.
- Variable externa NUEVA: `CRM_ENCRYPTION_KEY` (o `CRM_APP_SECRET`) — `openssl rand -hex 32`, fuera de la BD y del repo; rotable con `scripts/migracion-encryption-key.mjs` del CRM como referencia.

## Cableado mínimo

```js
// Guardar (configuración de integración por org):
const tokenEnc = encryptOrgSecret(metaAccessToken)
await db.prepare('UPDATE OrgIntegration SET whatsappTokenEnc = ?, tokenHash = ? WHERE orgId = ?')
  .run(tokenEnc, sha256HexOrg(metaAccessToken), orgId)

// Usar (despacho):
const token = decryptOrgSecret(row.whatsappTokenEnc)
if (!token) return res.status(500).json({ error: 'Credencial ilegible: clave o dato alterado' })

// Migrar legado (una vez, script en el PR del repo destino):
const { isLegacy, encrypted } = migrateOrgSecret(row.whatsappTokenEnc)
if (isLegacy) updateRow(row.id, encrypted)
```

## Validación (en el repo destino)

1. Suite del kit (`tests/kits/s7-*.test.ts`): roundtrip, tamper → null, sin clave → error tipado, migración legacy idempotente.
2. En producción: `SELECT COUNT(*) FROM OrgIntegration WHERE whatsappTokenEnc NOT LIKE 'v1:%' AND whatsappTokenEnc IS NOT NULL` → 0 tras la migración.

## Reversión

Revertir el PR conserva los datos; los valores cifrados requieren la clave para leerse, así que mantén `CRM_ENCRYPTION_KEY` documentada en el gestor de secretos antes de aplicar.
