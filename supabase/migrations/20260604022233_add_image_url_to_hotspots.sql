/*
  # Add image_url to hotspots

  1. Changes
    - `hotspots` table: adds nullable `image_url text` column so editors can
      attach a display image to a hotspot (shown in the AR popup alongside
      the label, description, audio, and video).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hotspots' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE hotspots ADD COLUMN image_url text;
  END IF;
END $$;
