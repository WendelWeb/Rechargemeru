CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"channel" text NOT NULL,
	"audience" text NOT NULL,
	"recipient" text NOT NULL,
	"template" text NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_id" text,
	"error" text,
	"resend_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"message" text,
	"data" jsonb,
	"actor" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"method" text NOT NULL,
	"provider" text,
	"provider_ref" text,
	"provider_transaction_id" text,
	"payer_wallet" text,
	"mode" text NOT NULL,
	"usd_cents" integer NOT NULL,
	"fx_rate_htg" numeric(10, 4) NOT NULL,
	"base_htg" integer NOT NULL,
	"fee_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_htg" integer NOT NULL,
	"paid_htg" integer,
	"fulfilled_usd_cents" integer,
	"refund_htg" integer,
	"refund_wallet" text,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_email" text,
	"meru_account_type" text NOT NULL,
	"meru_account" text NOT NULL,
	"meru_reference" text,
	"redirect_url" text,
	"redirect_expires_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"verify_attempts" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"admin_note" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	CONSTRAINT "orders_reference_uq" UNIQUE("reference"),
	CONSTRAINT "orders_provider_ref_uq" UNIQUE("provider","provider_ref")
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"fx_rate_htg" numeric(10, 4) DEFAULT 132 NOT NULL,
	"fee_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"amount_tolerance_htg" integer DEFAULT 0 NOT NULL,
	"min_usd_cents" integer DEFAULT 500 NOT NULL,
	"max_usd_cents" integer DEFAULT 50000 NOT NULL,
	"order_ttl_minutes" integer DEFAULT 30 NOT NULL,
	"admin_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"admin_whatsapp_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notify_admin_events" jsonb DEFAULT '["paid","needs_review","failed"]'::jsonb NOT NULL,
	"notify_customer_events" jsonb DEFAULT '["created","paid","fulfilled","failed","needs_review","refunded"]'::jsonb NOT NULL,
	"meru_account_types" jsonb DEFAULT '["email","username"]'::jsonb NOT NULL,
	"business_name" text DEFAULT 'Recharge Meru' NOT NULL,
	"support_whatsapp" text,
	"support_hours" text DEFAULT '8 h – 20 h, 7 j/7' NOT NULL,
	"fulfilment_sla_fr" text DEFAULT 'moins de 2 heures' NOT NULL,
	"fulfilment_sla_ht" text DEFAULT 'mwens pase 2 èdtan' NOT NULL,
	"meru_help_fr" text,
	"meru_help_ht" text,
	"login_failures" integer DEFAULT 0 NOT NULL,
	"login_locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"order_id" uuid,
	"matched_by" text,
	"status" text NOT NULL,
	"payload" jsonb,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_resend_of_notifications_id_fk" FOREIGN KEY ("resend_of") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("order_id","template","audience","channel","recipient") WHERE status in ('pending','sent') and resend_of is null;--> statement-breakpoint
CREATE INDEX "notifications_order_idx" ON "notifications" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "order_events_order_created_idx" ON "order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_phone_idx" ON "orders" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "orders_mode_idx" ON "orders" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "webhook_logs_order_idx" ON "webhook_logs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "webhook_logs_received_idx" ON "webhook_logs" USING btree ("received_at");