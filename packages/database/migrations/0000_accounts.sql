CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_clerk_subject_unique" UNIQUE("clerk_subject"),
	CONSTRAINT "accounts_subject_nonempty" CHECK (char_length("accounts"."clerk_subject") between 1 and 255)
);
