# Kit I6 — Selector de transporte por política por organización

**Tarea del plan**: I6 (WP + ULTRA). **Nota del plan**: «cablear `transport-selector.ts` (ya probado aislado)» — esta lib portable es ese cableado con política declarada y fail-closed.

## Qué resuelve

La elección de transporte sigue siendo la variable global `TRANSPORT` (una para todo el sistema). Con la política por org, cada organización envía por su canal (`cloud_api` o `baileys`) y un error de configuración NO degrada en silencio: lanza `TransportPolicyError`.

## Dónde va

- Copia `transport-policy.mjs` al módulo de despacho del repo destino.
- Variable nueva: `WP_TRANSPORT_POLICY='{"org-a":"cloud_api","org-b":"baileys","*":"baileys"}'`.

```js
const policy = createTransportPolicy(process.env.WP_TRANSPORT_POLICY)
const { transport, source } = policy.resolve(orgId) // 'org_policy' | 'default'
if (transport === 'cloud_api') await dispatchViaCloud(msg) else await dispatchViaBaileys(msg)
```

## Reglas (testeadas)

- política explícita de la org gana sobre el default `*`;
- valores desconocidos en la política → error AL CARGAR (no al despachar: la mala config se ve en el arranque);
- sin política para la org y sin `*` → error (jamás caer a una global);
- `orgId` vacío → error (jamás una variable global implícita).

## Validación (en el repo destino)

1. Suite del kit (`tests/kits/i6-*.test.ts`).
2. Arranque del servicio con una política con typo → el error tipado aparece en el log de arranque (fail-fast).

## Reversión

Aditivo; revertir devuelve el comportamiento de la variable global `TRANSPORT` (estado previo).
