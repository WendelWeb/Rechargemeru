CREATE TABLE "site_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" text NOT NULL,
	"visit_id" text NOT NULL,
	"view_id" text,
	"path" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"target" text,
	"value" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "view_id" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "screen" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "net" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "lang" text;--> statement-breakpoint
CREATE INDEX "site_events_visit_created_idx" ON "site_events" USING btree ("visit_id","created_at");--> statement-breakpoint
CREATE INDEX "site_events_device_created_idx" ON "site_events" USING btree ("device_id","created_at");--> statement-breakpoint
CREATE INDEX "site_events_created_idx" ON "site_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "page_views_view_idx" ON "page_views" USING btree ("view_id");