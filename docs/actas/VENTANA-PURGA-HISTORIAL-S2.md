# VENTANA DE PURGA DEL HISTORIAL GIT (S2) — RUNBOOK VALIDADO

**Tarea:** S2 (plan definitivo CRM-ALBRA v2.0, §7.1 F1-T02 — OBLIGATORIA · MODIFICADA: solo CRM-ALBRA)
**Fecha de preparación:** 2026-11-20 · **Estado:** PROCEDIMIENTO VALIDADO EN CLON DESECHABLE · Ejecución GATED

---

## 0. Candado previo (NO NEGOCIABLE — orden del plan, acta S1 §5)

**La purga solo se ejecuta DESPUÉS de completar F1-T01** (revocación efectiva de los dos PAT
expuestos en chats + nuevo token de alcance mínimo en uso). Razón técnica: purgar con el
token aún vivo re-expone el token en el propio force-push y deja la ventana de exposición
abierta; el historial purgado seguiría siendo accesible para quien tenga el PAT viejo.
Estado al 2026-11-20: ⛔ **token `…bnhik` sigue vivo (el sandbox opera con él)** → GATED.

Autorización destructiva requerida: decisión **A2** (concedida por el propietario el
2026-11-20 — "aprobado todo" — PERO la ventana debe ser un momento acordado: cambia TODOS
los SHAs y rompe los clones y los PR abiertos).

## 1. Qué se purga (inventario medido en la validación)

| Métrica | Valor medido |
|---|---|
| Commits de historial escaneados | 1169 |
| Huellas `ROTACION-PENDIENTE` en baseline | 35 únicas (78 entradas por commit) |
| Hallazgos asociados en el historial | 135 |
| Cobertura del generador | **35/35** (todas localizadas con su literal) |
| Tiempo de `git filter-repo --replace-text` | ~1,6 s |
| Hallazgos tras la purga | **0** de las huellas purgadas; el resto son fixtures dummy |
| Baseline post-purga reclasificada | 310 `dummy-verificado` · 0 `ROTACION-PENDIENTE` |
| `npm run security:scan:history` tras reclasificar | exit 0 |

Los literales provienen de versiones HISTÓRICAS de tests/scripts (fixtures anteriores a la
disciplina dummy de B7). El árbol actual está limpio (`security:scan` verde): la purga no
altera el contenido de trabajo, solo el historial.

## 2. Preparación ya fusionada en el repo

- `scripts/security/build-purge-replace-text.mjs` — genera `scripts/security/.purge-replace-text.txt`
  (35 reglas `literal==>***REMOVED***`, permisos 0600, jamás versionada, se BORRA al cerrar).
- `.gitignore` con entrada dedicada para ese archivo.
- Herramienta validada: `git-filter-repo 2.47.0` (`pip install git-filter-repo`).

## 3. Procedimiento de la ventana (comandos validados)

Ejecutar desde clones limpios y dedicados. Tiempo total: ~30 min + CI.

```bash
# --- 0. PRECONDICIONES -------------------------------------------------------
#  a) F1-T01 COMPLETADA (PAT viejos revocados; nuevo token en uso). Sin esto, PARAR.
#  b) BACKUP (lo guarda el PROPIETARIO fuera del sandbox):
git bundle create ../crm-albra-backup-pre-purga-$(date +%Y%m%d).bundle --all
#  Verificar el bundle: git bundle verify ../crm-albra-backup-pre-purga-*.bundle
#  c) Ventana acordada: nadie empuja durante el procedimiento.
#  d) Copiar la baseline PRE-purga (para la reclasificación del paso 5):
cp scripts/security/secret-baseline.json /tmp/baseline-pre-purga.json

# --- 1. CLON ESPEJO (superset: usa CRM-2 que contiene TODAS las ramas) -------
git clone --mirror https://ALBRA8:<NUEVO_TOKEN>@github.com/ALBRA8/CRM-2.git /tmp/purga.git

# --- 2. EXPRESIONES DE PURGA -------------------------------------------------
# Generar desde un clon de trabajo limpio (el generador exige árbol limpio):
git clone https://ALBRA8:<NUEVO_TOKEN>@github.com/ALBRA8/CRM-2.git /tmp/trabajo-limpio
cd /tmp/trabajo-limpio
node scripts/security/build-purge-replace-text.mjs        # escribe .purge-replace-text.txt (0600)
cp scripts/security/.purge-replace-text.txt /tmp/purga.git/

# --- 3. PURGA ----------------------------------------------------------------
cd /tmp/purga.git
git filter-repo --replace-text .purge-replace-text.txt --force
# (en el clon espejo NO hay working tree: filter-repo reescribe TODAS las refs)

# --- 4. VERIFICACIÓN ---------------------------------------------------------
cd /tmp/trabajo-limpio && git fetch origin && git reset --hard origin/main
node scripts/scan-secrets.mjs --history --report-only | grep -c ROTACION-PENDIENTE   # esperado: 0

# --- 5. BASELINE POST-PURGA (regenerar + reclasificar por huella) ------------
node scripts/security/generate-baselines.mjs              # regenera con los SHAs nuevos
node -e " // las huellas supervivientes conservan su estado previo; las purgadas se descartan
const fs=require('fs');
const pre=JSON.parse(fs.readFileSync('/tmp/baseline-pre-purga.json','utf8'));
const st=new Map(pre.map(e=>[e.fingerprint,e.status]));
const post=JSON.parse(fs.readFileSync('scripts/security/secret-baseline.json','utf8'));
const out=post.filter(e=>st.get(e.fingerprint)==='dummy-verificado'||st.get(e.fingerprint)==='DUMMY-VERIFICADO')
              .map(e=>({...e,status:'dummy-verificado'}));
fs.writeFileSync('scripts/security/secret-baseline.json',JSON.stringify(out,null,1));
console.log('entradas:',out.length,'· pendientes:',out.filter(e=>e.status==='ROTACION-PENDIENTE').length);
"
node scripts/scan-secrets.mjs --history                   # esperado: exit 0, 0 hallazgos nuevos
npm run security:scan && npm test                         # batería intacta (el árbol no cambia)

# --- 6. FORCE-PUSH A LOS DOS REMOTES -----------------------------------------
cd /tmp/purga.git
git push --force https://ALBRA8:<NUEVO_TOKEN>@github.com/ALBRA8/CRM-2.git --all --tags
git push --force https://ALBRA8:<NUEVO_TOKEN>@github.com/ALBRA8/CRM-ALBRA.git --all --tags
# (el espejo de CRM-2 contiene las ramas de ambos repos; --all cubre todas las heads)

# --- 7. CIERRE ---------------------------------------------------------------
rm -f /tmp/purga.git/.purge-replace-text.txt   # los literales SOLO vivieron aquí
rm -rf /tmp/purga.git /tmp/trabajo-limpio
# Re-clonar TODOS los entornos de trabajo (los clones viejos ya no pueden empujar).
```

## 4. Efectos que el propietario debe atender post-ventana

| Efecto | Acción |
|---|---|
| Todos los SHAs cambian | Re-clonar sandbox/PC/servidores; los clones viejos quedan huérfanos |
| PR abiertos #4, #5, #6 (CRM-ALBRA) | Recrearlos o re-abrirlos desde las ramas reescritas; CI se re-ejecuta |
| Baseline con SHAs nuevos | Ya reclasificada en el paso 5 (310 dummy · 0 pendientes) |
| E2E con referencias a commits antiguos | Ninguno conocido; verificar `scripts/e2e-3-servicios.mjs` |

## 5. Reversión

Si la ventana falla a mitad de camino: **NO se fuerza nada más**; se restaura desde el bundle
del paso 0 (`git clone ../crm-albra-backup-pre-purga-*.bundle restaurado`) y se reintenta en
una ventana nueva. El bundle es la única fuente de verdad del estado pre-purga.

## 6. Acta de la ventana (a completar al ejecutar)

| Campo | Valor |
|---|---|
| Fecha/hora de inicio | ______ |
| SHA de `main` antes | ______ |
| SHA de `main` después | ______ |
| Ramas re-escritas | ______ |
| PR recreados | ______ |
| `security:scan:history` post-purga | ______ (esperado exit 0) |
| Batería post-purga | ______ (esperado 834/834) |
| Bundle guardado en | ______ |
