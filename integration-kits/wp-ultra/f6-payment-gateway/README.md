# Kit F6 — Cobro real (WOMPI / MP / Stripe) con simulador blindado

**Tarea del plan**: F6 (WP). **Bloqueante declarado**: credenciales de pasarela del propietario. El kit define la interfaz y los guardas AHORA; al llegar las credenciales el PR real solo implementa la llamada del proveedor.

## Qué resuelve

El simulador sigue blindado y no hay cobro real. El adaptador:

- decide el proveedor POR ORGANIZACIÓN (`PAYMENT_POLICY='{"org-a":"wompi"}'`; sin entrada → `simulator`);
- sin credenciales reales → modo simulador EXPLÍCITO (`simulator: true, status: 'approved_simulated'`) — jamás se presenta como cobro real;
- con proveedor real y credenciales ausentes → error EXPLÍCITO de configuración (jamás degrada a simulador en silencio);
- montos positivos y monedas `COP|USD` validadas; negativos/cero rechazados;
- la implementación real de cada proveedor lanza tipado hasta existir (fail-closed, no simula éxito).

## Dónde va

- Copia `payment-adapter.mjs` al módulo de facturación del repo destino.
- Env del repo destino: `PAYMENT_POLICY` + credenciales por proveedor (`WOMPI_PUBLIC_KEY/WOMPI_PRIVATE_KEY`, `MP_ACCESS_TOKEN`, `STRIPE_SECRET_KEY`) — SOLO cuando el propietario las obtenga.

## Cierre de la tarea F6 (cuando haya credenciales)

1. PR en el repo destino implementando `createCharge` del proveedor elegido (SDK oficial), con webhooks de confirmación firmados.
2. Suite del kit (`tests/kits/f6-*.test.ts`) ya cubre los guardas; añadir test de integración con la sandbox del proveedor.
3. Registrar las credenciales SOLO por variable de entorno / gestor de secretos — jamás en el chat ni en el repo (lección del acta ROTACION-CREDENCIALES del CRM).

## Reversión

Aditivo; revertir devuelve el simulador puro.
