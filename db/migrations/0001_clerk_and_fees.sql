ALTER TABLE "orders" ADD COLUMN "clerk_user_id" text;--> statement-breakpoint
CREATE INDEX "orders_clerk_user_idx" ON "orders" USING btree ("clerk_user_id");--> statement-breakpoint
ALTER TABLE "platform_settings" DROP COLUMN "login_failures";--> statement-breakpoint
ALTER TABLE "platform_settings" DROP COLUMN "login_locked_until";