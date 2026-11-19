# Criterio de unificación de la doble bandeja (M7)

**Fecha:** 2026-11-20 · **Tarea:** M7 del Plan Definitivo v2.0 (fase 3, obligatoria) ·
**Decisión de producto aplicada:** canónico primero con respaldo del daemon (opción recomendada
por el plan; habilitada por la instrucción global de construir el plan completo).

## Problema

Conviven dos generaciones de modelo de mensajería:

| Generación | Tablas | Origen | Key en la bandeja |
| --- | --- | --- | --- |
| Legacy (daemon Baileys, sesión única) | `WhatsAppConversation` / `WhatsAppMessage` | Webhook del daemon | `wa:<convId>` |
| Legacy (integraciones por cliente) | `TimelineEvent` | Webhooks Telegram/IG/FB antiguos | `tg:/ig:/fb:<clientId>` |
| Canónica (multi-número, fase 0) | `ChannelConnection` / `ChannelConversation` / `ChannelMessage` | Webhooks Cloud API multicuenta | `cc:<convId>` |

Antes de M7, `listInbox()` concatenaba todas las fuentes: un contacto que hubiera hablado por el
mismo número durante la migración aparecía **dos veces** (una `cc:` y una `wa:`), y su atención se
partía entre dos filas.

## Criterio aprobado y aplicado

1. **Las conversaciones canónicas nunca se ocultan entre sí.** El mismo teléfono que habla por dos
   números distintos de la organización produce dos conversaciones `cc:` legítimas (multi-número:
   partición por `connectionId` + contacto). Ambas se muestran, cada una con su cuenta
   (`connectionName`) visible en la bandeja.
2. **Una fila legacy cuya identidad (canal + contacto normalizado) coincide con cualquier conversación
   canónica se OCULTA de la lista unificada.** Gana siempre el modelo canónico, que es el único que
   soporta envío (outbox), entregas y partición por cuenta.
3. **Ninguna señal de atención se pierde:** los no leídos de las filas ocultas se SUMAN al contador
   del canónico ganador (el más reciente por actividad). La bandeja nunca "esconde" un mensaje sin leer.
4. **Cero borrado de datos:** el dedup es READ-ONLY sobre la vista. El historial legacy sigue íntegro
   en sus tablas y visible en la **ficha 360 del cliente**; no hay migración destructiva ni cambio de
   esquema. Reversión limpia con `git revert` del PR.
5. **Identidad de comparación:** WhatsApp por teléfono normalizado a dígitos (`normalizeWaPhone`),
   porque el daemon guarda `573001110000` y Cloud API `+573001110000` — son el mismo contacto.
   Telegram/Instagram/Facebook/TikTok por handle de plataforma exacto. Filas sin identidad fiable
   (handle vacío, teléfono inválido) no participan en el dedup (fail-closed).
6. **Protección degenerada:** dos filas legacy de la misma identidad sin canónico conservan solo la
   más reciente (sumando no leídos). Estado que no debe ocurrir; el criterio lo aguanta sin duplicar.

## Consecuencias para el operador

- Un contacto aparece **una sola vez** por canal y cuenta, con el canal y la cuenta claros.
- Las conversaciones legacy ocultas no se pueden abrir desde la bandeja (ya no reciben envíos:
  el envío legacy está deshabilitado); su contenido histórico vive en la ficha del cliente.
- Las filas `cc:` muestran el número/cuenta (`connectionName`) cuando la organización tiene
  varios números conectados.

## Implementación y pruebas

- Función pura `dedupeInboxConversations()` en `src/lib/inbox.ts` (testeable sin DOM),
  aplicada en `listInbox()` antes del ordenado y el recorte por límite.
- Pruebas: `tests/unit/inbox-dedup.test.ts` (contacto en ambas fuentes, multi-número legítimo,
  señales de no leídos, canales distintos, filas sin identidad, estado degenerado).
- El criterio queda documentado también en la cabecera de `src/lib/inbox.ts`.
