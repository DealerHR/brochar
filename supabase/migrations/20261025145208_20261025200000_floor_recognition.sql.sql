/*
  # Showroom floor: product recognition

  The floor app (/{tenant}/floor) lets a salesperson point the phone at the real
  product, tap once, and open that product's hotspots. A Claude vision call picks
  the product from the client's catalogue. This migration adds what that needs.

  ## products
  reference_images  jsonb array of public image URLs (up to 4) showing the product
                    from the angles a salesperson would photograph it. Sent to the
                    vision model next to the live photo.
  label_hint        where the identifying label / nameplate / price tag is and what
                    it looks like, e.g. "Model name on the boot lid, right side" or
                    "Nameplate on the right side panel, model starts with EG".
  floor_enabled     false hides the product from recognition and the floor grid.

  ## recognitions (log, one row per tap)
  Written by the edge function only. Members read their own client's rows. The
  chosen product is updated by the floor app through the RPC below, so misses can
  be reviewed later.

  ## sources
  'floor' is now a valid source for ar_events and leads.
*/

ALTER TABLE products ADD COLUMN IF NOT EXISTS reference_images jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS label_hint text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS floor_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_reference_images_check;
ALTER TABLE products ADD CONSTRAINT products_reference_images_check
  CHECK (jsonb_typeof(reference_images) = 'array' AND jsonb_array_length(reference_images) <= 4) NOT VALID;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_label_hint_check;
ALTER TABLE products ADD CONSTRAINT products_label_hint_check CHECK (char_length(label_hint) <= 300) NOT VALID;

CREATE TABLE IF NOT EXISTS recognitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid,
  team boolean NOT NULL DEFAULT true,
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  label_text text,
  top_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  chosen_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  confidence text CHECK (confidence IN ('high', 'medium', 'low', 'none', 'error')),
  latency_ms integer,
  error text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE recognitions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS recognitions_tenant_created_idx ON recognitions(tenant_id, created_at DESC);

CREATE POLICY "Members read own tenant recognitions" ON recognitions FOR SELECT TO authenticated
  USING (can_view_tenant(tenant_id));
CREATE POLICY "Editors delete own tenant recognitions" ON recognitions FOR DELETE TO authenticated
  USING (can_edit_tenant(tenant_id));

-- The floor app (anonymous) records which product the salesperson actually opened.
-- Limited to that one column, and only for a row that has not been chosen yet.
CREATE OR REPLACE FUNCTION set_recognition_choice(rid uuid, pid uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE recognitions r SET chosen_product_id = pid
  WHERE r.id = rid AND r.chosen_product_id IS NULL
    AND EXISTS (SELECT 1 FROM products p WHERE p.id = pid AND p.tenant_id = r.tenant_id);
$$;
GRANT EXECUTE ON FUNCTION set_recognition_choice(uuid, uuid) TO anon, authenticated;

-- 'floor' source
ALTER TABLE ar_events DROP CONSTRAINT IF EXISTS ar_events_source_check;
ALTER TABLE ar_events ADD CONSTRAINT ar_events_source_check CHECK (source IN ('qr', 'link', 'learn', 'floor')) NOT VALID;