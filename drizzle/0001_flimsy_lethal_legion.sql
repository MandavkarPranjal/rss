CREATE TABLE "folder" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feed" ADD COLUMN "folder_id" text;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "folder_user_id_idx" ON "folder" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "folder_user_name_uidx" ON "folder" USING btree ("user_id","name");--> statement-breakpoint
ALTER TABLE "feed" ADD CONSTRAINT "feed_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_folder_id_idx" ON "feed" USING btree ("folder_id");