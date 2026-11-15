# CRM-ALBRA — Contexto operativo y registro de validaciones

## Objetivo de este documento

Evitar auditorías, pruebas y comprobaciones repetidas sin una causa nueva. Este archivo es la referencia persistente para continuar el trabajo del CRM. Antes de proponer una tarea o ejecutar una validación, consultar este contexto y el historial de commits/CI.

## Decisiones de arquitectura y alcance

- **Base de datos oficial: SQLite.**
- **PostgreSQL está fuera del alcance.** No migrar, no incorporarlo como requisito de staging y no abrir tareas para validarlo.
- No cambiar infraestructura ni arquitectura por preferencia técnica; solo ante un requisito explícito o un defecto demostrado.
- No hacer merge, deploy, tocar producción, activar workers ni realizar envíos reales sin autorización expresa.

## Estado validado

### CI #1470 — commit `23f1e18`

- Repositorio: `ALBRA8/CRM-ALBRA`
- Rama: `fix/migration-safety-audit`
- Ejecución: https://github.com/ALBRA8/CRM-ALBRA/actions/runs/43691939009
- Commit: https://github.com/ALBRA8/CRM-ALBRA/commit/23f1e184db33817c3b61cfee9b89412bf7844833
- Resultado: **SUCCESS**. Pasaron instalación, escáner de secretos, generación de Prisma, migraciones SQLite limpias, TypeScript, ESLint, suite de tests y build de producción.
- Esta validación pertenece al SHA indicado; no equivale a validación de producción.

### Concurrencia del scheduler — CI #1476, commit `217cf3d937eef976657f8717f8d6f6fd0ef3827e`

- Rama: `fix/migration-safety-audit`.
- Commit validado: https://github.com/ALBRA8/CRM-ALBRA/commit/217cf3d937eef976657f8717f8d6f6fd0ef3827e
- Ejecución CI #1476: https://github.com/ALBRA8/CRM-ALBRA/actions/runs/43693190511
- Resultado reportado: **SUCCESS**.
- Prueba específica: `tests/integration/scheduler-multiprocess.test.ts` — 1 test aprobado.
- La prueba levanta **dos procesos independientes**, cada uno con su propio proceso/módulo scheduler y cliente Prisma, que comparten únicamente el archivo SQLite temporal de pruebas.
- Ambos procesos compiten por reclamar la misma automatización programada vencida. La prueba comprueba que se cree exactamente un `AutomationRun` y que el schedule avance, evitando la ejecución duplicada.
- CI #1476 también reportó como aprobados instalación, escáner de secretos, cliente Prisma, migraciones SQLite limpias, TypeScript, ESLint, suite completa y build.
- Resultado de la suite completa reportado por CI: **92 archivos y 732 tests aprobados**.
- **Conclusión:** la concurrencia entre dos workers/procesos independientes queda cubierta por esta prueba y aprobada en el SHA indicado. No se necesitó modificar la lógica del scheduler; la prueba confirmó el comportamiento esperado para este escenario.
- No volver a ejecutar esta prueba ni los 732 tests sobre el mismo SHA por rutina. Repetir solo si cambia código/configuración relevante, aparece una regresión, cambia el entorno/dependencia o se solicita expresamente.

### Alcance de la prueba previa en un solo proceso

- Archivo: `tests/integration/workflow-run-lease.test.ts`.
- El test con `Promise.all` cubre dos invocaciones concurrentes dentro del mismo proceso y cliente Prisma; por sí solo no demostraba concurrencia entre procesos separados.
- `src/lib/scheduler.ts` contiene un guard local de módulo (`let running = false`), que solo evita solapamientos dentro de un proceso. La coordinación entre procesos depende del claim persistido/transaccional en SQLite.
- El esquema Prisma tiene `@@unique([automationId, idempotencyKey])` en `AutomationRun`. No cambiar esta clave sin evidencia de un defecto.

## Registro histórico y discrepancia corregida

- El registro anterior mencionaba CI #1475 / HEAD `b65c03d` como pendiente. Ese estado quedó **superado** por CI #1476 y el commit validado `217cf3d`.
- No tratar el estado pendiente de #1475 como estado actual ni volver a abrir la prueba multiproceso.
- La consulta automatizada de runs asociadas al SHA no devolvió filas (el conector limita esa consulta a ejecuciones disparadas por pull request); el estado SUCCESS y los resultados detallados de #1476 se conservan aquí según el resultado de CI comunicado en el registro de trabajo. Consultar el enlace directo del run si se necesita revalidación externa.

## Regla para no repetir CI

- Un CI verde es evidencia válida para el SHA exacto al que pertenece, no una afirmación automática sobre commits posteriores.
- No volver a ejecutar toda la batería para reconfirmar lo ya aprobado en el mismo SHA.
- Repetir una prueba únicamente cuando: cambie el código o configuración relevante; aparezca un fallo/regresión; cambie el entorno o dependencia; exista una solicitud explícita; o una validación previa no cubra el riesgo concreto.
- Para cambios pequeños, ejecutar primero las pruebas afectadas y dejar que el CI normal valide el nuevo commit cuando corresponda.
- Si el HEAD avanzó, comparar los cambios desde el último commit validado y seleccionar pruebas según el alcance del diff. No asumir que todo está sin probar ni que el CI antiguo cubre código nuevo.
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

CI #1470 y #1476 demuestran que los pasos automatizados indicados pasaron en sus respectivos commits. No demuestran por sí solos funcionamiento de proveedores externos, comportamiento en producción, restauración desde almacenamiento remoto ni despliegue. Esos temas solo se abren si siguen siendo requisitos del proyecto y existe una validación concreta pendiente; no se deben convertir en tareas genéricas repetidas.

## Estado de seguridad de cambios

Las validaciones #1470 y #1476 no implican merge ni deploy. Mantener la rama de trabajo y las protecciones operativas vigentes hasta recibir autorización expresa.
