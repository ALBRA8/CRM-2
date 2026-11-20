-- Backfill del legado pre-migración (port de cierre/a-estabilizacion-y-deuda,
-- PR #5, integrado 2026-11-20 con la numeración z del estándar E2).
-- Los QuoteItem históricos anteriores a la migración por-organización quedaron
-- con organizationId NULL. Desde la creación vía API siempre se establece
-- (quoteItemRows(items, auth.orgId)), así que este UPDATE solo repara datos
-- antiguos tomando el organizationId de su Quote padre (relación obligatoria).
-- No elimina filas ni valores: es puramente aditivo (NULL -> org del padre).
UPDATE "QuoteItem"
SET "organizationId" = (
  SELECT q."organizationId" FROM "Quote" q WHERE q."id" = "QuoteItem"."quoteId"
)
WHERE "organizationId" IS NULL
  AND EXISTS (SELECT 1 FROM "Quote" q WHERE q."id" = "QuoteItem"."quoteId");
