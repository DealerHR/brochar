/*
  # Product views: which side of the product a hotspot belongs to

  On the floor the phone looks at one side of the product at a time. The
  recognise function now also reports the side in view, and hotspots carry a
  "view" tag so the floor app can show the matching features first.

  ## hotspots.view
  One of: any, front, rear, side, interior, dashboard, boot, engine, wheels, top,
  display, label. 'any' = not tied to a side (default; brochure behaviour unchanged).

  ## products.reference_images
  Now up to 12 entries. Each entry is either a URL string (older rows) or
  {"url": string, "view": string} so the model learns what each side looks like.
*/

ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS view text NOT NULL DEFAULT 'any';
ALTER TABLE hotspots DROP CONSTRAINT IF EXISTS hotspots_view_check;
ALTER TABLE hotspots ADD CONSTRAINT hotspots_view_check
  CHECK (view IN ('any', 'front', 'rear', 'side', 'interior', 'dashboard', 'boot', 'engine', 'wheels', 'top', 'display', 'label')) NOT VALID;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_reference_images_check;
ALTER TABLE products ADD CONSTRAINT products_reference_images_check
  CHECK (jsonb_typeof(reference_images) = 'array' AND jsonb_array_length(reference_images) <= 12) NOT VALID;

ALTER TABLE recognitions ADD COLUMN IF NOT EXISTS view text;