-- Add motion_profile column to aituber_characters for collision capsule data.
-- Stores JSON-serialised MotionProfile generated from VRM mesh analysis.
ALTER TABLE "aituber_characters" ADD COLUMN "motion_profile" text;
