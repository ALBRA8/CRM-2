# CRM-ALBRA — Contexto operativo y registro de validaciones

## Objetivo de este documento

Evitar auditorías, pruebas y comprobaciones repetidas sin una causa nueva. Este archivo es la referencia persistente para continuar el trabajo del CRM. Antes de proponer una tarea o ejecutar una validación, consultar este contexto y el historial de commits/CI.

## Decisiones de arquitectura y alcance

- **Base de datos oficial: SQLite.**
- **PostgreSQL está fuera del alcance.** No migrar, no incorporarlo como requisito de staging y no abrir tareas para validarlo.
- No cambiar infraestructura ni arquitectura por preferencia técnica; solo ante un requisito explícito o un defecto demostrado.
- No hacer merge, deploy, tocar producción, activar workers ni realizar envíos reales sin autorización expresa.

## Validación ya completada

### CI #1470 — commit `23f1e18`

- Repositorio: `ALBRA8/CRM-ALBRA`
- Rama: `fix/migration-safety-audit`
- Ejecución: https://github.com/ALBRA8/CRM-ALBRA/actions/runs/43691939009
- Commit: https://github.com/ALBRA8/CRM-ALBRA/commit/23f1e184db33817c3b61cfee9b89412bf7844833
- Resultado: **SUCCESS**. El job terminó y todos los pasos reportados finalizaron correctamente:
  - Instalación de dependencias.
  - Escáner de secretos (CP-Sec-01).
  - Generación del cliente Prisma.
  - Migraciones Prisma en SQLite temporal (instalación limpia).
  - TypeScript.
  - ESLint con baseline ratchet.
  - Suite de tests.
  - Build de producción.

La consulta de jobs confirmó que la suite y el build finalizaron con conclusión `success`. **No se registró aquí un número exacto de tests**; no inventar ni repetir un conteo anterior como si perteneciera a esta ejecución.

### Prueba de concurrencia existente — commit `9731ee6`

- Archivo: `tests/integration/workflow-run-lease.test.ts`.
- El test `allows only one database winner when identical triggers arrive concurrently` lanza dos llamadas concurrentes con `Promise.all` y comprueba un único run, un resultado `success`, uno `deduplicated` y `fencingVersion = 1`.
- **Alcance exacto:** ambas llamadas se ejecutan dentro del mismo proceso y usan el mismo módulo/cliente Prisma. Esto prueba la carrera entre dos invocaciones y la unicidad/idempotencia en la base de datos; no prueba por sí solo dos procesos/workers independientes.
- `src/lib/scheduler.ts` tiene un guard local de módulo (`let running = false`) que evita solapamiento dentro de un proceso. Ese guard no coordina procesos separados; la coordinación entre procesos depende del claim transaccional persistido en SQLite.
- El esquema Prisma tiene `@@unique([automationId, idempotencyKey])` en `AutomationRun`; por tanto, una clave de idempotencia igual entre automatizaciones distintas no colisiona. No modificarla sin evidencia de un defecto.

### Prueba multiproceso añadida — pendiente de CI

- Rama: `fix/migration-safety-audit`.
- HEAD actual al registrar: `b65c03d`.
- Commits:
  - `e70b850`: añade `vitest.worker.config.mts`, configuración hija sin `setup/env.ts) para no borrar la SQLite compartida.
  - `5997732`: añade `tests/fixtures/scheduler-worker.spec.mts`, entrypoint de cada proceso hijo.
  - `b65c03d`: añade `tests/integration/scheduler-multiprocess.test.ts`.
- La prueba de integración levanta dos procesos Vitest/Node independientes, ambos con su propio módulo scheduler y cliente Prisma, compartiendo solo la SQLite temporal de la suite. Los dos ejecutan `runDueJobs({ orgId })) sobre una misma automatización programada vencida; el padre verifica que exista exactamente un `AutomationRun` y que el schedule avance.
- La configuración del proceso hijo omite el setup global porque este elimina/recrea `db/test-vitest.db`; usarlo en los hijos destruiría la base compartida y falsearía la prueba.
- CI disparado para el HEAD `b65c03d`: run #1475, ID `43693132971`, URL https://github.com/ALBRA8/CRM-ALBRA/actions/runs/43693132971. **Estado al registrar: in_progress; no declarar aprobada la prueba hasta que el job termine en success.**
- No se ha confirmado todavía un defecto de implementación. Si la prueba falla, inspeccionar el log del paso específico y corregir solo la causa reproducible.

## Regla para no repetir CI

- El CI verde es evidencia válida para el SHA exacto al que pertenece, no una afirmación automática sobre commits posteriores.
- No volver a ejecutar toda la batería solo para reconfirmar lo ya aprobado en el mismo SHA.
- Repetir una prueba únicamente cuando: cambie el código o configuración relevante; aparezca un fallo/regresión; cambie el entorno o dependencia; exista una solicitud explícita; o una validación previa no cubra el riesgo concreto.
- Para cambios pequeños, ejecutar primero las pruebas afectadas y dejar que el CI normal valide el nuevo commit cuando corresponda.
- Si el HEAD avanzó, comparar los cambios desde el commit validado y seleccionar pruebas según el alcance del diff. No asumir que todo está sin probar ni que el CI antiguo cubre código nuevo.
- Registrar siempre ejecución, SHA exacto, resultado y pasos relevantes. No afirmar que algo pasó sin evidencia consultable.

## Forma de trabajo

1. Leer este documento antes de abrir una auditoría o crear una lista de pendientes.
2. Revisar qué se modificó desde el último commit validado y consultar evidencias existentes.
3. Clasificar cada asunto como:
   - **Cerrado:** implementación y evidencia suficiente ya existen.
   - **Por verificar:** hay una razón concreta por la que falta evidencia.
   - **Defecto confirmado:** reproducido o respaldado por un fallo concreto; corregirlo.
4. No reabrir asuntos cerrados por costumbre ni volver a construir módulos existentes.
5. Cada cambio debe resolver un defecto o requisito identificable y añadir la prueba mínima adecuada.
6. Mantener este documento actualizado cuando cambien decisiones, validaciones o el estado real.

## Límites de lo que demuestra el CI

CI #1470 demuestra que los pasos automatizados anteriores pasaron en el commit indicado. No demuestra por sí solo funcionamiento de proveedores externos, comportamiento en producción, restauración desde almacenamiento remoto ni despliegue. Esos temas solo se abren si siguen siendo requisitos del proyecto y existe una validación concreta pendiente; no se deben convertir en tareas genéricas repetidas.

## Estado de seguridad de cambios

La validación #1470 no implica merge ni deploy. Mantener la rama de trabajo y las protecciones operativas vigentes hasta recibir autorización expresa.
