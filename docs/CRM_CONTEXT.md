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

### Regla para no repetir CI

- Este CI verde es evidencia válida para el commit `23f1e18`, no una afirmación automática sobre commits posteriores.
- No volver a ejecutar ni solicitar de nuevo toda la batería solo para reconfirmar lo ya aprobado en ese mismo commit.
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
