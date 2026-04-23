ALTER TABLE "todos" ADD COLUMN "user_id" text;
--> statement-breakpoint
UPDATE "todos" SET "user_id" = 'website' WHERE "user_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "todos" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX "todos_user_id_idx" ON "todos" USING btree ("user_id");
