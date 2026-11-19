#!/usr/bin/env bash
# instalar-crm.sh — Instalador/actualizador IDEMPOTENTE del CRM ALBRA (O3, F6-T03).
#
# Actualizar el CRM con este script es un comando seguro:
#   1. Comprueba prerequisitos (Node 20+, npm).
#   2. RESPALDA .env y las bases de datos (*.db) ANTES de tocar nada.
#   3. Instala dependencias, aplica migraciones versionadas y compila.
#   4. Valida /api/health si la app está corriendo y deja un log de todo.
#
# Reglas:
#   - IDEMPOTENTE: puede ejecutarse dos veces seguidas sin pérdida. Si nada
#     cambió, el segundo pase no altera configuración ni datos.
#   - JAMÁS sobrescribe un .env existente (si falta, crea uno desde
#     .env.example para que se rellene a mano).
#   - JAMÁS ejecuta migraciones destructivas: solo `prisma migrate deploy`
#     (migraciones versionadas, orden determinista).
#
# Uso:
#   ./scripts/instalar-crm.sh               # instalar/actualizar
#   ./scripts/instalar-crm.sh --actualizar  # solo actualización (igual, sin crear .env)
#
# Variables de entorno para pruebas/CI:
#   CRM_ROOT=/ruta/del/repo   (por defecto, la raíz detectada del script)
#   SKIP_INSTALL=1            (no ejecutar npm ci)
#   SKIP_BUILD=1              (no ejecutar npm run build)
#   SKIP_PRISMA=1             (no ejecutar prisma migrate deploy)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRM_ROOT="${CRM_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
LOG_DIR="$CRM_ROOT/logs"
LOG_FILE="$LOG_DIR/instalar-crm.log"
BACKUP_ROOT="$CRM_ROOT/backups"
MODO="instalar"

if [ "${1:-}" = "--actualizar" ]; then
  MODO="actualizar"
fi

mkdir -p "$LOG_DIR" "$BACKUP_ROOT"

log() {
  local line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$line"
  echo "$line" >> "$LOG_FILE"
}

fail() {
  log "ERROR: $*"
  echo "Instalación interrumpida: revisa $LOG_FILE" >&2
  exit 1
}

log "=== instalar-crm.sh (${MODO}) en $CRM_ROOT ==="

# ---------- 1) Prerequisitos ----------
command -v node >/dev/null 2>&1 || fail "Node.js no está instalado"
command -v npm >/dev/null 2>&1 || fail "npm no está instalado"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Se requiere Node.js 20 o superior (encontrado: $(node --version))"
fi
log "Prerequisitos OK: $(node --version) / npm $(npm --version)"

# ---------- 2) Respaldo OBLIGATORIO antes de tocar nada ----------
STAMP="$(date '+%Y%m%d-%H%M%S')"
BACKUP_DIR="$BACKUP_ROOT/$STAMP"
mkdir -p "$BACKUP_DIR"

if [ -f "$CRM_ROOT/.env" ]; then
  cp "$CRM_ROOT/.env" "$BACKUP_DIR/.env"
  log "Respaldo de configuración: .env → $BACKUP_DIR"
else
  log "Aviso: no existe .env todavía (nada que respaldar de configuración)"
fi

DB_COPIED=0
while IFS= read -r -d '' dbfile; do
  rel="${dbfile#$CRM_ROOT/}"
  mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
  cp "$dbfile" "$BACKUP_DIR/$rel"
  DB_COPIED=$((DB_COPIED + 1))
done < <(find "$CRM_ROOT" \( -path "$CRM_ROOT/node_modules" -o -path "$CRM_ROOT/.next" -o -path "$CRM_ROOT/backups" \) -prune -o -type f -name '*.db' -print0 2>/dev/null)
log "Respaldo de datos: $DB_COPIED base(s) de datos → $BACKUP_DIR"

# Rotación: conservar los últimos 10 respaldos
ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | tail -n +11 | while IFS= read -r old; do
  rm -rf "$old"
done

# ---------- 3) Configuración: crear .env SOLO si falta ----------
if [ ! -f "$CRM_ROOT/.env" ]; then
  if [ "$MODO" = "actualizar" ]; then
    log "--actualizar: .env ausente y no se crea en modo actualización; continúa sin tocar configuración"
  else
    if [ -f "$CRM_ROOT/.env.example" ]; then
      cp "$CRM_ROOT/.env.example" "$CRM_ROOT/.env"
      log "Creado .env desde .env.example — COMPLETALO con tus valores reales antes de arrancar"
    else
      log "Aviso: no hay .env.example; no se crea .env automático"
    fi
  fi
else
  log "Configuración preservada: .env existente intacto"
fi

# ---------- 4) Dependencias ----------
if [ "${SKIP_INSTALL:-0}" = "1" ]; then
  log "SKIP_INSTALL=1: se omite la instalación de dependencias"
else
  log "Instalando dependencias (npm ci)…"
  (cd "$CRM_ROOT" && npm ci --no-audit --no-fund >> "$LOG_FILE" 2>&1) || fail "npm ci falló (ver $LOG_FILE)"
  log "Dependencias instaladas"
fi

# ---------- 5) Migraciones versionadas (deterministas; nunca db push) ----------
if [ "${SKIP_PRISMA:-0}" = "1" ]; then
  log "SKIP_PRISMA=1: se omiten las migraciones"
else
  log "Aplicando migraciones versionadas (prisma migrate deploy)…"
  (cd "$CRM_ROOT" && npx prisma migrate deploy >> "$LOG_FILE" 2>&1) || fail "migrate deploy falló (ver $LOG_FILE)"
  log "Migraciones aplicadas (idempotente: si ya estaban, es un no-op)"
fi

# ---------- 6) Build de producción ----------
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  log "SKIP_BUILD=1: se omite el build"
else
  log "Compilando (npm run build)… (2-4 min)"
  (cd "$CRM_ROOT" && npm run build >> "$LOG_FILE" 2>&1) || fail "el build falló (ver $LOG_FILE)"
  log "Build completado"
fi

# ---------- 7) Validación con /api/health (solo si la app ya está corriendo) ----------
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/api/health}"
if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
  log "Validación OK: $HEALTH_URL responde"
else
  log "Validación diferida: la app no está corriendo en ${HEALTH_URL}."
  log "  Arráncala (npm start o docker compose up) y verifica $HEALTH_URL para cerrar la instalación."
fi

log "=== LISTO (${MODO}) — respaldo en $BACKUP_DIR · log completo en $LOG_FILE ==="
echo ""
echo "Instalación/actualización completada sin pérdida de datos."
echo "  - Respaldo previo: $BACKUP_DIR"
echo "  - Log completo:    $LOG_FILE"
echo "  - Si la app ya estaba corriendo, reiníciala para usar el build nuevo."
