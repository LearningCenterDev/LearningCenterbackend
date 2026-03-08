CREATE TYPE "public"."recurrence_end_type" AS ENUM('never', 'until_date', 'after_occurrences');--> statement-breakpoint
CREATE TYPE "public"."recurrence_frequency" AS ENUM('daily', 'weekly', 'biweekly', 'monthly', 'custom');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'assignment_submitted' BEFORE 'new_message';--> statement-breakpoint
CREATE TABLE "assignment_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" varchar NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"file_name" text,
	"file_size" integer,
	"mime_type" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "schedule_recurrence_exceptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurrence_id" varchar NOT NULL,
	"occurrence_date" timestamp NOT NULL,
	"replacement_schedule_id" varchar,
	"reason" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "schedule_recurrences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" varchar NOT NULL,
	"teacher_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"frequency" "recurrence_frequency" NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"weekdays" text,
	"month_day" integer,
	"end_type" "recurrence_end_type" DEFAULT 'never' NOT NULL,
	"end_date" timestamp,
	"occurrence_count" integer,
	"timezone" text DEFAULT 'UTC',
	"notes" text,
	"created_by" varchar NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "submission_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" varchar NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"file_name" text,
	"file_size" integer,
	"mime_type" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "teacher_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "recurrence_id" varchar;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "occurrence_index" integer;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "original_start_time" timestamp;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "is_exception" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_recurrence_exceptions" ADD CONSTRAINT "schedule_recurrence_exceptions_recurrence_id_schedule_recurrences_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."schedule_recurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_recurrence_exceptions" ADD CONSTRAINT "schedule_recurrence_exceptions_replacement_schedule_id_schedules_id_fk" FOREIGN KEY ("replacement_schedule_id") REFERENCES "public"."schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_recurrence_exceptions" ADD CONSTRAINT "schedule_recurrence_exceptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_recurrences" ADD CONSTRAINT "schedule_recurrences_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_recurrences" ADD CONSTRAINT "schedule_recurrences_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_recurrences" ADD CONSTRAINT "schedule_recurrences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_recurrence_id_schedule_recurrences_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."schedule_recurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN "attachment_url";