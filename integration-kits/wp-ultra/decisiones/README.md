# Paquetes de decisión — I4, I5, E5, E6

Cuatro tareas externas donde lo que falta no es código portable sino una DECISIÓN
de diseño del propietario (así lo declara el plan). Cada paquete deja el análisis
y el checklist listos para decidir en minutos; la ejecución ocurre en el repo
destino (WP o ULTRA) una vez decidida.

---

## I4 (WP) — Reconciliar `fix/fase-correctiva-final` con la solución B2 ya fusionada

El plan: «un merge ciego revertiría protección ya fusionada».

**Estado en CRM-ALBRA (referencia de lo esperado en WP)**: esta sesión integró el
equivalente CRM de esa rama en 3 commits (port del endurecimiento de media,
referencias históricas cross-org en 9 rutas, backfill QuoteItem + test concurrente
de lease) — ver `docs/actas/CIERRE-FINAL-SESION-6-2026-11-20.md` §2. El patrón a
reproducir en WP: integrar el VALOR de la rama pieza a pieza sobre lo ya fusionado,
no un merge de rama completa.

**Checklist de decisión (30–45 min)**:
1. `git diff <merge-base> origin/fix/fase-correctiva-final --stat` en WP: lista exacta de archivos con contenido único.
2. Para cada archivo: ¿el B2 fusionado ya lo cubre? (buscar el patrón equivalente en la base).
3. Clasificar: PORT (valor único) / SUPERSEDED (B2 mejor) / DESCARTAR (obsoleto).
4. Aplicar los PORT como commits individuales con sus tests; jamás `git merge` directo.
5. Suite de WP en verde + PR al propietario.

## I5 (ULTRA) — Reconciliar `fix/fase2-seguridad-ultra` con el escáner HMAC+pepper vigente

Mismo patrón que I4, con un añadido: verificar que NINGÚN archivo de la rama
reintroduzca el patrón sin pepper ni el denylist removido (eso es exactamente lo
que «revertiría el denylist»).

**Checklist adicional**:
1. Buscar en el diff: `grep -i "pepper\|denylist\|hmac"` sobre los archivos tocados.
2. Si un PORT toca el escáner: re-ejecutar la suite del escáner vigente contra el nuevo código ANTES de aceptar el commit.
3. Los vectores HMAC de referencia están en `tests/contract/contratos-ecosistema.test.ts` del CRM (compartibles con ULTRA).

## E5 (WP) — Destino del ws-server y la SPA inerte del dashboard

**Opciones y recomendación**:
- **A. Eliminar** (recomendada si nadie las consume): el código muerto referenciado por docs genera expectativas falsas; eliminar con PR que actualice las docs que lo citan. Verificación previa: `grep -r "ws-server\|dashboard-spa"` en WP + confirmar con el propietario que ningún despliegue lo monta.
- **B. Cablear**: solo si existe un consumidor real planeado (si lo hay, definir contrato en CONTRATOS-ECOSISTEMA del CRM §cross-repo y su secreto S2S por org — kit S3 aplica).
- **C. Archivar en rama** `archive/dead-code-<fecha>` + eliminar de main: recuperable sin cargar el árbol.

**Decisión requerida**: A / B / C. Sin decisión, la deuda documental persiste (consecuencia declarada en el plan).

## E6 (ULTRA) — Docs operativas alineadas con el código (`MIGRACIONES.md`, `.env.example`)

**Contenido mínimo del PR de docs en ULTRA** (el kit deja las plantillas aquí):

1. `MIGRACIONES.md`:
   - lista REAL de migraciones (nombre, fecha, aditiva/destructiva);
   - regla del repo (jamás editar una migración aplicada; nueva migración z_* o fecha);
   - comando oficial de aplicación y cómo auditar qué se aplicó.
2. `.env.example`:
   - SOLO variables que el código lee realmente (generar con grep de `process.env` en ULTRA);
   - valores no-secretos reales y marcadores `REPLACE_WITH_*` para secretos (regla P0.4 del CRM);
   - cada variable con su efecto y su default.

**Validación**: un nuevo integrador sigue ambas docs desde cero y levanta ULTRA sin preguntar; cualquier paso que falle es un doc que hay que corregir.

---

**Resumen**: I4/I5 = reconciliación pieza a pieza con checklists (patrón probado en el CRM esta sesión). E5 = eliminar/cablear/archivar (decisión). E6 = PR de docs con plantillas listas. Las cuatro quedan desbloqueadas para el propietario o para una sesión futura con autorización sobre el repo destino.
