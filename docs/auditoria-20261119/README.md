# Auditoría CRM-ALBRA — Matriz de trazabilidad (2026-11-19)

Evidencia preservada de la auditoría y el control de avance del **Plan Definitivo CRM-ALBRA v2.0**
(48 tareas / 7 fases). Esta rama complementa `docs/plan-definitivo-2026-11-19/` de la rama
`docs/plan-definitivo-crm-2026-11-19`, donde vive el documento rector.

## Contenido

| Archivo | Descripción |
| --- | --- |
| `MATRIZ-TRAZABILIDAD-CRM-ALBRA-2026-11-19.xlsx` | Matriz completa de las 48 tareas con estado real, dependencias, archivos y evidencia. Hojas: **Matriz** (48 tareas), **Resumen** (clasificación A/B/C y camino al piloto), **Sesión 2026-11-19** (trabajos de construcción), **Decisiones propietario** (acciones que requieren autorización específica: S1, S2, F1, D1, O1, D2). |
| `build_matriz_xlsx.py` | Script Python (openpyxl) que genera la matriz XLSX; regenerable con `python3 build_matriz_xlsx.py`. |
| `evidencia/` | Salidas de lectura y búsqueda usadas como evidencia de la auditoría de 12 puntos sobre el código real (README, Dockerfile, rutas API, tests, workflows, migraciones, seguridad). |

## Contexto de la auditoría

- Alcance verificado: `README.md`, `Dockerfile`, `docker-compose.yml`, `Caddyfile`, seguridad
  (JWT, RBAC, rate limit, cifrado por organización), WhatsApp multi-organización, outbox,
  tests (Vitest) y CI.
- Estado al cierre de la sesión 2026-11-19: 4 tareas terminadas y verificadas (M1, S5, E1, E2),
  2 en desarrollo (E4, D4), 1 en análisis (E3), 19 pendientes de construcción, 6 con decisión
  del propietario, 13 con dependencia externa, 2 descartadas (M5, D3), 1 pospuesta (U6).
- Camino al piloto estimado: ~9,5 días restantes (F2 → F3/M7 → O1/E7 → F5 → fusión de PRs).

## Regenerar la matriz

```bash
python3 build_matriz_xlsx.py   # requiere openpyxl
```
