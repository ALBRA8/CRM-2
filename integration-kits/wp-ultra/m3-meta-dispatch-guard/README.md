# Kit M3 — Guard de despacho real por Meta (ventana 24 h + plantillas)

**Tarea del plan**: M3 (WP + ULTRA). **Nota del plan**: «invocar los stores ya probados» — el CRM mantiene los stores de clasificación; este guard portable decide SEND/SKIP ANTES de la Graph API y los rechazos 131047/131048 dejan de llegar a Meta.

## Qué resuelve

Mensajes libres fuera de la ventana de 24 h y plantillas no aprobadas que hoy se envían igual y devuelven error de Meta, degradando la calidad del número. Con el guard:

- plantilla `APPROVED` → send (las plantillas no dependen de la ventana)
- texto libre dentro de 24 h del último mensaje entrante del usuario → send
- texto libre fuera de ventana → `skip window_24h` (el operador envía plantilla)
- plantilla `PENDING`/`REJECTED` → `skip template_not_approved`; `PAUSED` → `skip template_paused`
- sin registro de último entrante → `skip no_inbound_24h` (fail-closed)

## Dónde va

- Copia `meta-dispatch-guard.mjs` al módulo de despacho del repo destino.
- En el punto donde hoy se llama a la Graph API (antes del fetch):

```js
const decision = decideMetaDispatch(
  { text: msg.text, templateName: msg.templateName },
  { lastInboundAt: conv.lastUserMessageAt, templateStatus: template?.status }
)
if (decision.decision === 'skip') {
  await persistSkip(conv.id, decision.reason) // fila auditable; el resto del flujo sigue (log/evento)
  return // NUNCA enviar a Meta
}
```

- El store de plantillas aprobadas por org (estado APPROVED/PAUSED) debe alimentar `templateStatus`; en el CRM la misma información vive en la integración Cloud de la org.

## Validación (en el repo destino)

1. Suite del kit (`tests/kits/m3-*.test.ts`): las 5 reglas.
2. En staging con número real: intentar texto fuera de ventana → skip local, sin llamada a Meta (verificar en logs que no hubo request a graph.facebook.com).

## Reversión

Aditivo: revertir el PR restaura el despacho sin guard (vuelven los rechazos 131047/131048).
