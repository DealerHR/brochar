/*
  # Hotspot content blocks, leads, and learn mode

  ## Hotspot content blocks
  A hotspot can now carry an ordered list of content blocks in addition to
  its text, image, audio and video:
    link        { url, label, open_mode: 'overlay' | 'newtab' }
    gallery     { images: [url, ...] }
    spec_table  { title?, rows: [{ label, value }] }
    pdf         { url, label }
    action      { type: 'call' | 'whatsapp' | 'enquiry', label?, phone?, message? }
    quiz        { question, options: [..], correct: index, explanation? }   (learn mode only)
    pitch       { pitch, objection, response }                              (learn mode only)

  ## Leads
  Enquiry submissions from the AR card. Anonymous insert for active brochures;
  tenant_id / product_id are stamped by trigger. Tenant members read them.

  ## Learn mode
  Direct access at /{tenant}/{product}/learn. Pitch and quiz blocks are shown
  there and quiz feedback is instant on the phone; nothing is recorded per
  learner for now.

  ## Tenant contact defaults
  tenants.whatsapp_number, phone_number, enquiry_email — used by action blocks
  when the block does not override them.

  ## Events
  ar_events.source — 'qr', 'link' or 'learn', set by the player.
*/

-- =====================================================================
-- Tenant contact defaults
-- =====================================================================
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_number text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS enquiry_email text;

ALTER TABLE ar_events ADD COLUMN IF NOT EXISTS source text CHECK (source IN ('qr', 'link', 'learn'));

-- =====================================================================
-- Helpers
-- =====================================================================
CREATE OR REPLACE FUNCTION hotspot_tenant(hid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT page_tenant(page_id) FROM hotspots WHERE id = hid;
$$;

CREATE OR REPLACE FUNCTION hotspot_is_public(hid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT page_is_public(page_id) FROM hotspots WHERE id = hid;
$$;

GRANT EXECUTE ON FUNCTION hotspot_tenant(uuid), hotspot_is_public(uuid) TO anon, authenticated;

-- =====================================================================
-- Hotspot content blocks
-- =====================================================================
CREATE TABLE IF NOT EXISTS hotspot_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotspot_id uuid NOT NULL REFERENCES hotspots(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('link', 'gallery', 'spec_table', 'pdf', 'action', 'quiz', 'pitch')),
  position integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  CHECK (pg_column_size(data) <= 20000)
);
ALTER TABLE hotspot_blocks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS hotspot_blocks_hotspot_idx ON hotspot_blocks(hotspot_id, position);

CREATE POLICY "Read public or own blocks" ON hotspot_blocks FOR SELECT TO anon, authenticated
  USING (hotspot_is_public(hotspot_id) OR can_view_tenant(hotspot_tenant(hotspot_id)));
CREATE POLICY "Editors insert blocks" ON hotspot_blocks FOR INSERT TO authenticated
  WITH CHECK (can_edit_tenant(hotspot_tenant(hotspot_id)));
CREATE POLICY "Editors update blocks" ON hotspot_blocks FOR UPDATE TO authenticated
  USING (can_edit_tenant(hotspot_tenant(hotspot_id))) WITH CHECK (can_edit_tenant(hotspot_tenant(hotspot_id)));
CREATE POLICY "Editors delete blocks" ON hotspot_blocks FOR DELETE TO authenticated
  USING (can_edit_tenant(hotspot_tenant(hotspot_id)));

-- =====================================================================
-- Leads
-- =====================================================================
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  brochure_id uuid NOT NULL REFERENCES brochures(id) ON DELETE CASCADE,
  hotspot_id uuid REFERENCES hotspots(id) ON DELETE SET NULL,
  session_id uuid,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  phone text NOT NULL CHECK (length(phone) BETWEEN 6 AND 20),
  email text CHECK (email IS NULL OR length(email) <= 200),
  message text CHECK (message IS NULL OR length(message) <= 2000),
  source text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS leads_tenant_created_idx ON leads(tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION leads_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; tid uuid;
BEGIN
  SELECT p.id, p.tenant_id INTO pid, tid
  FROM brochures b JOIN products p ON p.id = b.product_id WHERE b.id = NEW.brochure_id;
  IF pid IS NULL THEN RAISE EXCEPTION 'unknown brochure'; END IF;
  NEW.product_id := pid; NEW.tenant_id := tid; NEW.created_at := now(); NEW.status := 'new';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS leads_stamp_trigger ON leads;
CREATE TRIGGER leads_stamp_trigger BEFORE INSERT ON leads FOR EACH ROW EXECUTE FUNCTION leads_stamp();
REVOKE EXECUTE ON FUNCTION leads_stamp() FROM public, anon, authenticated;

CREATE POLICY "Public submit leads for active brochures" ON leads FOR INSERT TO anon, authenticated
  WITH CHECK (brochure_is_public(brochure_id));
CREATE POLICY "Members read own tenant leads" ON leads FOR SELECT TO authenticated
  USING (can_view_tenant(tenant_id));
CREATE POLICY "Editors update own tenant leads" ON leads FOR UPDATE TO authenticated
  USING (can_edit_tenant(tenant_id)) WITH CHECK (can_edit_tenant(tenant_id));
CREATE POLICY "Editors delete own tenant leads" ON leads FOR DELETE TO authenticated
  USING (can_edit_tenant(tenant_id));
