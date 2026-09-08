ALTER TABLE "platform_settings" ALTER COLUMN "notify_admin_events" SET DEFAULT '["created","paid","needs_review","failed"]'::jsonb;
--> statement-breakpoint
-- The default above only governs a row that does not exist yet. The live
-- settings row was saved before « Commande créée » existed as an operator
-- alert, so it still carries the old list and would keep the new alert off.
-- Added here, once, idempotently — the operator can untick it in
-- /admin/parametres → « Ce qui alerte l'opérateur ».
UPDATE "platform_settings"
   SET "notify_admin_events" = "notify_admin_events" || '["created"]'::jsonb
 WHERE jsonb_typeof("notify_admin_events") = 'array'
   AND NOT ("notify_admin_events" @> '["created"]'::jsonb);
