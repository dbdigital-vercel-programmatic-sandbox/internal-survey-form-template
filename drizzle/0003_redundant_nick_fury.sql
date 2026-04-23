CREATE TABLE "survey_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text,
	"phone_number" text NOT NULL,
	"cm_face" text NOT NULL,
	"cm_caste" text NOT NULL,
	"cm_quality" text NOT NULL,
	"nitish_should_step_down" text NOT NULL,
	"nitish_tenure_preference" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "survey_responses_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "survey_responses_phone_number_unique" UNIQUE("phone_number")
);
