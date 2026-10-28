CREATE TYPE "public"."handoff_kind" AS ENUM('job', 'event');--> statement-breakpoint
CREATE TYPE "public"."operation_kind" AS ENUM('text', 'voice');--> statement-breakpoint
CREATE TYPE "public"."operation_state" AS ENUM('pending', 'running', 'completed', 'failed', 'interrupted');--> statement-breakpoint
CREATE TABLE "finalized_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"message_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"operation_id" uuid,
	"kind" "handoff_kind" NOT NULL,
	"sequence" integer,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handoffs_kind_shape" CHECK (("handoffs"."kind" = 'event' AND "handoffs"."sequence" IS NOT NULL AND "handoffs"."sequence" > 0) OR ("handoffs"."kind" = 'job' AND "handoffs"."sequence" IS NULL AND "handoffs"."operation_id" IS NOT NULL)),
	CONSTRAINT "handoffs_lease_shape" CHECK (("handoffs"."lease_token" IS NULL) = ("handoffs"."lease_expires_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"kind" "operation_kind" NOT NULL,
	"status" "operation_state" DEFAULT 'pending' NOT NULL,
	"input_message_id" uuid,
	"assistant_message_id" uuid,
	"retry_of" uuid,
	"execution_token" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"result_hash" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_text_messages" CHECK ("operations"."kind" <> 'text' OR ("operations"."input_message_id" IS NOT NULL AND "operations"."assistant_message_id" IS NOT NULL AND "operations"."input_message_id" <> "operations"."assistant_message_id"))
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "next_event_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_id_account_idx" ON "conversations" USING btree ("id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_id_conversation_idx" ON "messages" USING btree ("id","conversation_id");--> statement-breakpoint
ALTER TABLE "finalized_deliveries" ADD CONSTRAINT "finalized_deliveries_message_id_conversation_id_messages_id_conversation_id_fk" FOREIGN KEY ("message_id","conversation_id") REFERENCES "public"."messages"("id","conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_retry_of_operations_id_fk" FOREIGN KEY ("retry_of") REFERENCES "public"."operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_conversation_id_account_id_conversations_id_account_id_fk" FOREIGN KEY ("conversation_id","account_id") REFERENCES "public"."conversations"("id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_input_message_id_conversation_id_messages_id_conversation_id_fk" FOREIGN KEY ("input_message_id","conversation_id") REFERENCES "public"."messages"("id","conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_assistant_message_id_conversation_id_messages_id_conversation_id_fk" FOREIGN KEY ("assistant_message_id","conversation_id") REFERENCES "public"."messages"("id","conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finalized_deliveries_identity_idx" ON "finalized_deliveries" USING btree ("conversation_id","delivery_id");--> statement-breakpoint
CREATE UNIQUE INDEX "handoffs_event_sequence_idx" ON "handoffs" USING btree ("conversation_id","sequence") WHERE "handoffs"."kind" = 'event';--> statement-breakpoint
CREATE UNIQUE INDEX "handoffs_operation_job_idx" ON "handoffs" USING btree ("operation_id") WHERE "handoffs"."kind" = 'job';--> statement-breakpoint
CREATE INDEX "handoffs_pending_idx" ON "handoffs" USING btree ("kind","created_at") WHERE "handoffs"."delivered_at" IS NULL AND "handoffs"."cancelled_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "operations_account_request_idx" ON "operations" USING btree ("account_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_one_active_idx" ON "operations" USING btree ("conversation_id") WHERE "operations"."status" in ('pending', 'running');--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_event_sequence_nonnegative" CHECK ("conversations"."next_event_sequence" >= 0);