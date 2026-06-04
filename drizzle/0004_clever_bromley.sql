CREATE TABLE "survey_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"deeplink" text DEFAULT '' NOT NULL,
	"state_id" integer,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "survey_districts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"english_name" text,
	"state_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_mla" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image" text DEFAULT '' NOT NULL,
	"position" text,
	"caste" text DEFAULT 'GEN' NOT NULL,
	"gender" text DEFAULT 'Male' NOT NULL,
	"party" text DEFAULT 'Independent' NOT NULL,
	"education" text DEFAULT 'Graduate' NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"is_part_of_ministry" boolean DEFAULT false NOT NULL,
	"is_first_time_minister" boolean DEFAULT false NOT NULL,
	"age" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"district_id" integer NOT NULL,
	"vidhan_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"option_text" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"custom_value" boolean DEFAULT false NOT NULL,
	"question_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_text" text NOT NULL,
	"multiple_choice" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	"campaign_id" integer,
	"state_id" integer,
	"vidhan_id" integer,
	"parent_option_id" integer
);
--> statement-breakpoint
CREATE TABLE "survey_vidhan_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"state_id" integer NOT NULL,
	"district_id" integer NOT NULL,
	"vidhan_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text,
	"phone_number" text NOT NULL,
	"answers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cid" text DEFAULT '521' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_vidhan_seat_district_connector" (
	"district_id" integer NOT NULL,
	"vidhan_id" integer NOT NULL,
	CONSTRAINT "survey_vidhan_seat_district_connector_district_id_vidhan_id_pk" PRIMARY KEY("district_id","vidhan_id")
);
--> statement-breakpoint
CREATE TABLE "survey_vidhan_seats" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"english_name" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "survey_campaigns" ADD CONSTRAINT "survey_campaigns_state_id_survey_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."survey_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_districts" ADD CONSTRAINT "survey_districts_state_id_survey_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."survey_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_mla" ADD CONSTRAINT "survey_mla_district_id_survey_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."survey_districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_mla" ADD CONSTRAINT "survey_mla_vidhan_id_survey_vidhan_seats_id_fk" FOREIGN KEY ("vidhan_id") REFERENCES "public"."survey_vidhan_seats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_options" ADD CONSTRAINT "survey_options_question_id_survey_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."survey_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_campaign_id_survey_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."survey_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_state_id_survey_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."survey_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_vidhan_id_survey_vidhan_seats_id_fk" FOREIGN KEY ("vidhan_id") REFERENCES "public"."survey_vidhan_seats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_vidhan_answers" ADD CONSTRAINT "survey_vidhan_answers_campaign_id_survey_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."survey_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_vidhan_answers" ADD CONSTRAINT "survey_vidhan_answers_state_id_survey_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."survey_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_vidhan_answers" ADD CONSTRAINT "survey_vidhan_answers_district_id_survey_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."survey_districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_vidhan_answers" ADD CONSTRAINT "survey_vidhan_answers_vidhan_id_survey_vidhan_seats_id_fk" FOREIGN KEY ("vidhan_id") REFERENCES "public"."survey_vidhan_seats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_vidhan_seat_district_connector" ADD CONSTRAINT "survey_vidhan_seat_district_connector_district_id_survey_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."survey_districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_vidhan_seat_district_connector" ADD CONSTRAINT "survey_vidhan_seat_district_connector_vidhan_id_survey_vidhan_seats_id_fk" FOREIGN KEY ("vidhan_id") REFERENCES "public"."survey_vidhan_seats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "survey_districts_state_id_idx" ON "survey_districts" USING btree ("state_id");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_mla_vidhan_id_unique" ON "survey_mla" USING btree ("vidhan_id");--> statement-breakpoint
CREATE INDEX "survey_mla_district_id_idx" ON "survey_mla" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "survey_options_question_id_idx" ON "survey_options" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "survey_questions_campaign_vidhan_idx" ON "survey_questions" USING btree ("campaign_id","vidhan_id");--> statement-breakpoint
CREATE INDEX "survey_questions_parent_option_idx" ON "survey_questions" USING btree ("parent_option_id");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_vidhan_answers_campaign_phone_unique" ON "survey_vidhan_answers" USING btree ("campaign_id","phone_number");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_vidhan_answers_campaign_user_unique" ON "survey_vidhan_answers" USING btree ("campaign_id","user_id");--> statement-breakpoint
CREATE INDEX "survey_vidhan_answers_created_at_idx" ON "survey_vidhan_answers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "survey_vidhan_district_vidhan_id_idx" ON "survey_vidhan_seat_district_connector" USING btree ("vidhan_id");