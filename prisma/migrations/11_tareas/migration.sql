-- Cierre integral CRM-ALBRA (bloque C): tareas y recordatorios comerciales.
-- Tenencia por organización (orgId NOT NULL con FK cascade); el responsable es
-- userId plano (patrón Reservation.userId) y el cliente opcional con SET NULL.
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" DATETIME,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "completedAt" DATETIME,
    "userId" TEXT,
    "clientId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE RESTRICT
);
CREATE INDEX "Task_organizationId_status_idx" ON "Task"("organizationId", "status");
CREATE INDEX "Task_organizationId_dueAt_idx" ON "Task"("organizationId", "dueAt");
CREATE INDEX "Task_clientId_idx" ON "Task"("clientId");
