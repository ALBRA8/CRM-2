# CONTEXTO CRM — Validación de ACK ambiguo de WhatsApp

**Fecha:** 15 de noviembre de 2026  
**Repositorio:** `ALBRA8/CRM-ALBRA`  
**Rama:** `test/workflow-outbox-ambiguous-ack`  
**Pull request:** [#4 — test: cover ambiguous WhatsApp workflow acknowledgement](https://github.com/ALBRA8/CRM-ALBRA/pull/4)  
**Commit validado:** `e76f20bc76909f2d754aa25b6d4bb80123b72ba3`  
**Ejecución CI:** [#1483](https://github.com/ALBRA8/CRM-ALBRA/actions/runs/43696931663)

## Objetivo

Cubrir la ventana de fallo en la que el proveedor de WhatsApp acepta un mensaje, pero el CRM no consigue persistir la confirmación positiva (ACK). El sistema no debe volver a despachar ese mensaje de forma automática ni producir un duplicado.

## Escenario de integración

1. El CRM persiste la intención de envío en la outbox.
2. El proveedor simulado acepta el mensaje.
3. La prueba provoca un fallo real de escritura en SQLite al intentar actualizar el estado a `sent`.
4. La outbox debe quedar en estado `unknown`.
5. El mensaje no debe poder reclamarse ni despacharse de nuevo.
6. El proveedor simulado debe recibir exactamente una llamada.

La prueba es determinista y no realiza llamadas de red ni envía mensajes reales de WhatsApp.

## Correcciones realizadas durante la validación

- Se añadió `tests/integration/workflow-outbox-ambiguous-ack.test.ts`.
- El escáner de secretos detectó inicialmente un falso positivo asociado al fixture ficticio. Se ajustó el fixture como permitido, sin debilitar ni añadir excepciones globales al escáner.
- TypeScript detectó una incompatibilidad entre `Promise` y `PrismaPromise`; se corrigió en la prueba.
- La primera simulación de fallo de persistencia no interceptaba la operación de Prisma y el estado terminaba como `sent`, no como `unknown`.
- Se sustituyó esa simulación por un trigger temporal de SQLite que rechaza específicamente la actualización a `sent`. Así se ejercita la escritura de base de datos sin modificar el scheduler ni las protecciones de producción.

## Resultado verificado — CI #1483

**Conclusión: ejecución completada con éxito.**

Todos los pasos del job `ci` finalizaron con `completed / success`:

| Etapa | Resultado |
|---|---|
| Preparación del job y checkout | Aprobado |
| Instalación de dependencias | Aprobado |
| Escáner de secretos (CP-Sec-01) | Aprobado |
| Generación del cliente Prisma | Aprobado |
| Migraciones Prisma en SQLite temporal | Aprobado |
| TypeScript | Aprobado |
| ESLint con baseline ratchet | Aprobado |
| Suite de tests (Vitest) | Aprobada |
| Build de producción | Aprobado |

La suite de tests terminó correctamente, por lo que la prueba de regresión incluida en esa suite pasó en CI #1483. El PR describe las aserciones de estado `unknown`, imposibilidad de reclamar nuevamente el mensaje y exactamente una llamada al proveedor simulado.

## Estado de integración y despliegue

- La validación CI #1483 está aprobada.
- El cambio permanece en la rama `test/workflow-outbox-ambiguous-ack`.
- El PR #4 permanece como borrador (Draft) según la última consulta.
- **No se ha hecho merge.**
- **No se ha hecho deploy.**
- **No se ha modificado producción ni se han enviado mensajes reales.**

## Próximo paso

Revisar el PR #4 y decidir explícitamente si se convierte en listo para revisión y se integra. El CI aprobado valida esta rama y esta ejecución; no equivale a que el cambio ya esté incorporado en la rama principal ni desplegado.
