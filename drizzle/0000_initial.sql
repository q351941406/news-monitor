CREATE TABLE "ai_analysis" (
	"item_id" text PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"details" text,
	"processed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "raw_items" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"title" text,
	"url" text NOT NULL,
	"raw_data" jsonb NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"fetched_at" bigint NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "topic_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"topic" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "topic_items" (
	"topic_id" text,
	"item_id" text
);
--> statement-breakpoint
ALTER TABLE "ai_analysis" ADD CONSTRAINT "ai_analysis_item_id_raw_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."raw_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_items" ADD CONSTRAINT "topic_items_topic_id_topic_groups_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_items" ADD CONSTRAINT "topic_items_item_id_raw_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."raw_items"("id") ON DELETE cascade ON UPDATE no action;