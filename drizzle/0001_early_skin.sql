CREATE TABLE "run_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"stage" text NOT NULL,
	"status" text NOT NULL,
	"items_count" bigint DEFAULT 0 NOT NULL,
	"duration_ms" bigint DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL
);
