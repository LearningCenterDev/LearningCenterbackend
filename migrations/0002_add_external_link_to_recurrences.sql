-- Add external_link column to schedule_recurrences table
-- This allows applying a meeting link (Zoom, Teams, etc.) to all recurring schedule instances
ALTER TABLE "schedule_recurrences" ADD COLUMN "external_link" text;
