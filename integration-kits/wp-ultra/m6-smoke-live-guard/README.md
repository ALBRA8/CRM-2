# Kit M6 — Guard destructivo para `smoke-live`

**Tarea del plan**: M6 (ULTRA). **Fuente propuesta por el plan**: integrar/revisar la rama ULTRA `impl/fix-funcionales-20261112` (decisión del propietario). Este kit encapsula la regla mínima que CUALQUIER variante debe cumplir.

## Qué resuelve

`smoke-live` borra campañas ajenas al terminar: riesgo destructivo en producción. Con el guard, el borrado solo alcanza a los objetos de la corrida actual (tag de corrida / createdByRun) dentro de la org propia; lo demás queda en `skipped` con motivo.

## Reglas (testeadas)

1. Sin `runTag` → NO se borra nada (`no_run_tag_fail_closed`).
2. Candidato normal: org propia + tag de la corrida presente.
3. `--force` amplía SOLO a objetos `createdByRun === runTag` de la org propia; una campaña de producción jamás es candidato (con o sin force).
4. Objeto de otra organización → `foreign_org_protected` SIEMPRE.

## Dónde va

- Copia `destructive-guard.mjs` al script `smoke-live` del repo destino y sustituye el borrado directo por:

```js
const { deletable, skipped } = computeDeletableTargets({ runTag: argv.runTag, targets: await listCampaigns(), orgId: argv.orgId, force: argv.force })
for (const { id } of deletable) await deleteCampaign(id)
console.log(JSON.stringify({ deleted: deletable.length, skipped }, null, 2)) // auditoría
```

- El `smoke-live` debe CREAR sus campañas de prueba con `tags: [runTag]` y `createdByRun: runTag` (el kit valida el resto).

## Validación (en el repo destino)

1. Suite del kit (`tests/kits/m6-*.test.ts`): fail-closed sin tag, org ajena protegida, force solo sobre propios de la corrida, auditoría de skipped.
2. Staging: corrida de smoke-live con 1 campaña propia + 1 producción → la producción queda `production_object_protected`.

## Reversión

Aditivo; revertir restaura el borrado directo (riesgo que el plan marca como bloqueante para producción).
