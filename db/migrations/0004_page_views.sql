CREATE TABLE "page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" text NOT NULL,
	"visit_id" text NOT NULL,
	"path" text NOT NULL,
	"locale" text,
	"referrer_host" text,
	"utm_source" text,
	"device_kind" text NOT NULL,
	"device_label" text,
	"country" text,
	"city" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "device_id" text;--> statement-breakpoint
CREATE INDEX "page_views_created_idx" ON "page_views" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "page_views_device_created_idx" ON "page_views" USING btree ("device_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_device_idx" ON "orders" USING btree ("device_id");