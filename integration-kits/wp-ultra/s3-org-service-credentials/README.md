# Kit S3 — Bearer por organización (fin del secreto operador global)

**Tarea del plan**: S3 (WP). **Fuente del patrón**: CRM `WHATSPOWER_ORG_SERVICE_CREDENTIALS` (JSON `{"orgId":"credencial"}` para el puente CRM→WP) y la barrera del webhook de WhatsApp del CRM: el tenant se determina por la CREDENCIAL que matchea, jamás por un header/body creíble.

## Qué resuelve

Hoy un secreto operador GLOBAL concentra acceso a todas las organizaciones: quien lo tenga fija `X-Org-Id` arbitrario (cross-org). Con el kit, la org se deduce de la credencial presentada (timing-safe) y `authorizeOrg` exige además coincidencia exacta con la org pedida.

## Dónde va

- Copia `org-bearer-auth.mjs` al módulo de auth S2S del repo destino (WP).
- Variable nueva: `WP_ORG_SERVICE_CREDENTIALS='{"org-a":"cred-…","org-b":"cred-…"}'` — credenciales distintas por org (`openssl rand -hex 32` cada una), jamás reutilizadas.
- En los handlers S2S: sustituir `checkOperatorSecret(req)` por el bloque del README.

## Cableado mínimo

```js
const auth = requireOrgServiceCredentials(process.env.WP_ORG_SERVICE_CREDENTIALS)

// Handler protegido:
const result = auth.authenticate(req.headers.get('authorization')?.replace(/^Bearer /, ''))
if (!result) return res.status(401).json({ error: 'Unauthorized' }) // sin detalles que revelen orgs
// Defensa extra si el caller aún envía X-Org-Id:
if (req.headers.get('x-org-id') && !auth.authorizeOrg(result, req.headers.get('x-org-id'))) {
  return res.status(403).json({ error: 'Org mismatch' })
}
// result.orgId es el tenant para TODA la operación posterior.
```

## Coordinación con flows existentes

- Los emisores (CRM p. ej.) ya soportan credencial por org (misma variable del CRM). El único cambio en emisores: enviar el Bearer de la org concreta en lugar del operador global.
- Transición segura: conserva el secreto global como credencial de LECTURA de estado de emergencia (route flag) hasta migrar todos los emisores; luego revoca y purga su valor del historial (S2 del plan cubre la purga del CRM; la de WP es operación independiente futura).

## Validación (en el repo destino)

1. Suite del kit (`tests/kits/s3-*.test.ts`): match por credencial, mismatch → null, cross-org rechazada, config ausente → error tipado.
2. Prueba manual: llamar con el Bearer de org-a pidiendo org-b → 403.

## Reversión

El PR es aditivo; revertir reactiva el secreto global. Rotar las credenciales filtradas SIEMPRE (ninguna purga de historial sustituye la rotación — ver acta S1 del CRM).
