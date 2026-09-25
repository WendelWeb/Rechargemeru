CREATE TABLE "whatsapp_style" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"style" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
