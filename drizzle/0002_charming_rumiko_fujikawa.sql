ALTER TABLE "feed" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "feed" ADD COLUMN "last_modified" text;--> statement-breakpoint
ALTER TABLE "feed" ADD COLUMN "refresh_locked_until" timestamp;