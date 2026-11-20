-- Cierre integral CRM-ALBRA (2026-11-19): backfill del legado pre-migración.
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
