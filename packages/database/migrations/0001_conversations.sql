CREATE TYPE "public"."conversation_status" AS ENUM('active', 'archived', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."message_modality" AS ENUM('text', 'voice');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."message_state" AS ENUM('pending', 'streaming', 'completed', 'failed', 'interrupted');--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"next_message_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_title_nonempty" CHECK (char_length(trim("conversations"."title")) > 0),
	CONSTRAINT "conversations_sequence_nonnegative" CHECK ("conversations"."next_message_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"role" "message_role" NOT NULL,
	"modality" "message_modality" NOT NULL,
	"content" text NOT NULL,
	"state" "message_state" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_sequence_positive" CHECK ("messages"."sequence" > 0)
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_account_updated_idx" ON "conversations" USING btree ("account_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conversations_account_status_idx" ON "conversations" USING btree ("account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conversation_sequence_idx" ON "messages" USING btree ("conversation_id","sequence");