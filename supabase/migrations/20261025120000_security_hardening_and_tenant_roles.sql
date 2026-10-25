/*
  # Security hardening, tenant roles and event tracking

  ## Why
  The original schema let ANY signed-in user read, write and delete every
  client's data and every file in storage. Inactive clients and draft
  brochures were publicly readable. Analytics rows could be inserted with
  arbitrary values. This migration closes those gaps without breaking
  existing data.

  ## Roles
  - `platform_admins` – LearnTech staff. Full access to everything.
    Every user that exists at migration time is made a platform admin so
    nobody loses access.
  - `tenant_members` – client-side users, per tenant, with a role:
    owner (manage team + tenant details), editor (edit content),
    viewer (read + analytics only).

  ## Helper functions (SECURITY DEFINER, stable)
  is_platform_admin(), tenant_role(tid), can_view_tenant(tid),
  can_edit_tenant(tid), can_manage_tenant(tid), product_tenant(pid),
  brochure_tenant(bid), page_tenant(page_id), storage_path_tenant(name).

  ## Policies (all rewritten)
  - Public (anon) can read only ACTIVE tenants, ACTIVE products of active
    tenants, ACTIVE brochures and their pages/hotspots.
  - Tenant members read everything in their tenant; editors/owners write.
  - Only platform admins create or delete tenants.
  - ar_events: anyone can insert, but only for an active brochure, with
    page/hotspot ids that belong to that brochure. tenant_id, product_id,
    occurred_at and date_key are stamped by a trigger, never trusted from
    the client. Only tenant viewers+ can read their own tenant's events.
  - Storage: public read stays; writes/deletes are limited to the folder of
    a tenant the user can edit.

  ## Data integrity
  - NOT NULL on all foreign keys that the app relies on.
  - One brochure per product; unique (brochure_id, page_index).
  - Slug format + reserved-word checks; hex colour checks; hotspot
    position range checks. Added NOT VALID so existing rows are untouched.
  - brochures.pages_changed_at, maintained by trigger, so the UI can show
    "recompile needed" when pages change after the last compile.
  - brochures.updated_at now actually updates.

  ## Event tracking
  - ar_events gains session_id, tenant_id, product_id, platform.
  - New event_type 'media_played'.
  - Existing rows are backfilled with tenant_id / product_id.

  ## Team management RPCs
  - list_tenant_members(tid) – members with email
  - add_tenant_member(tid, email, role) – by email of an existing user
  - set_tenant_member_role(tid, uid, role)
  - remove_tenant_member(tid, uid)
*/

-- =====================================================================
-- 1. Role tables
-- =====================================================================

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS tenant_members (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS tenant_members_user_idx ON tenant_members(user_id);

-- Bootstrap: keep access for everyone who already has an account.
INSERT INTO platform_admins (user_id)
SELECT id FROM auth.users
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 2. Helper functions
-- =====================================================================

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION tenant_role(tid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM tenant_members WHERE tenant_id = tid AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION can_view_tenant(tid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tid IS NOT NULL AND (is_platform_admin() OR tenant_role(tid) IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION can_edit_tenant(tid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tid IS NOT NULL AND (is_platform_admin() OR tenant_role(tid) IN ('owner', 'editor'));
$$;

CREATE OR REPLACE FUNCTION can_manage_tenant(tid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tid IS NOT NULL AND (is_platform_admin() OR tenant_role(tid) = 'owner');
$$;

CREATE OR REPLACE FUNCTION product_tenant(pid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM products WHERE id = pid;
$$;

CREATE OR REPLACE FUNCTION brochure_tenant(bid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.tenant_id FROM brochures b JOIN products p ON p.id = b.product_id WHERE b.id = bid;
$$;

CREATE OR REPLACE FUNCTION page_tenant(pg uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.tenant_id
  FROM brochure_pages bp
  JOIN brochures b ON b.id = bp.brochure_id
  JOIN products p ON p.id = b.product_id
  WHERE bp.id = pg;
$$;

CREATE OR REPLACE FUNCTION brochure_is_public(bid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM brochures b
    JOIN products p ON p.id = b.product_id
    JOIN tenants t ON t.id = p.tenant_id
    WHERE b.id = bid AND b.status = 'active' AND p.is_active AND t.is_active
  );
$$;

CREATE OR REPLACE FUNCTION page_is_public(pg uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT brochure_is_public(brochure_id) FROM brochure_pages WHERE id = pg;
$$;

-- Storage object name -> tenant id. Accepts both layouts used by the app:
--   {tenantId}/...            (products, pages, audio, video, targets.mind)
--   tenants/{tenantId}/...    (logos)
CREATE OR REPLACE FUNCTION storage_path_tenant(object_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  parts text[];
  candidate text;
BEGIN
  parts := string_to_array(object_name, '/');
  IF array_length(parts, 1) < 2 THEN RETURN NULL; END IF;
  candidate := CASE WHEN parts[1] = 'tenants' THEN parts[2] ELSE parts[1] END;
  IF candidate ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN candidate::uuid;
  END IF;
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION is_platform_admin(), tenant_role(uuid), can_view_tenant(uuid),
  can_edit_tenant(uuid), can_manage_tenant(uuid), product_tenant(uuid), brochure_tenant(uuid),
  page_tenant(uuid), brochure_is_public(uuid), page_is_public(uuid), storage_path_tenant(text)
  TO anon, authenticated;

-- =====================================================================
-- 3. Data integrity
-- =====================================================================

ALTER TABLE products ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE brochures ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE brochure_pages ALTER COLUMN brochure_id SET NOT NULL;
ALTER TABLE hotspots ALTER COLUMN page_id SET NOT NULL;
ALTER TABLE ar_events ALTER COLUMN brochure_id SET NOT NULL;

-- One brochure per product (the app already assumes this with maybeSingle()).
-- Keep the newest row if duplicates somehow exist.
DELETE FROM brochures b
USING brochures newer
WHERE b.product_id = newer.product_id AND b.created_at < newer.created_at;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brochures_product_id_key') THEN
    ALTER TABLE brochures ADD CONSTRAINT brochures_product_id_key UNIQUE (product_id);
  END IF;
END $$;

-- Unique page index within a brochure.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brochure_pages_brochure_id_page_index_key') THEN
    ALTER TABLE brochure_pages ADD CONSTRAINT brochure_pages_brochure_id_page_index_key UNIQUE (brochure_id, page_index);
  END IF;
END $$;

-- Slugs: lowercase letters, digits and single hyphens, 2-60 chars.
-- Tenant slugs must not collide with app routes.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_slug_format') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_slug_format
      CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 2 AND 60
             AND slug NOT IN ('admin', 'login', 'api', 'assets', 'static', 'auth', 'storage')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_slug_format') THEN
    ALTER TABLE products ADD CONSTRAINT products_slug_format
      CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 2 AND 60) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_brand_color_hex') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_brand_color_hex
      CHECK (brand_color ~ '^#[0-9a-fA-F]{6}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hotspots_dot_color_hex') THEN
    ALTER TABLE hotspots ADD CONSTRAINT hotspots_dot_color_hex
      CHECK (dot_color ~ '^#[0-9a-fA-F]{6}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hotspots_pos_range') THEN
    ALTER TABLE hotspots ADD CONSTRAINT hotspots_pos_range
      CHECK (pos_x BETWEEN 0 AND 100 AND pos_y BETWEEN 0 AND 100) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hotspots_label_length') THEN
    ALTER TABLE hotspots ADD CONSTRAINT hotspots_label_length
      CHECK (length(label) BETWEEN 1 AND 120 AND length(coalesce(description, '')) <= 2000) NOT VALID;
  END IF;
END $$;

-- Track page changes so the UI can flag a stale .mind file.
ALTER TABLE brochures ADD COLUMN IF NOT EXISTS pages_changed_at timestamptz;

CREATE OR REPLACE FUNCTION touch_brochure_pages_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE brochures SET pages_changed_at = now(), updated_at = now()
  WHERE id = COALESCE(NEW.brochure_id, OLD.brochure_id);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS brochure_pages_touch ON brochure_pages;
CREATE TRIGGER brochure_pages_touch
  AFTER INSERT OR UPDATE OF image_url, page_index OR DELETE ON brochure_pages
  FOR EACH ROW EXECUTE FUNCTION touch_brochure_pages_changed();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS brochures_set_updated_at ON brochures;
CREATE TRIGGER brochures_set_updated_at
  BEFORE UPDATE ON brochures FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Useful indexes
CREATE INDEX IF NOT EXISTS products_tenant_idx ON products(tenant_id);
CREATE INDEX IF NOT EXISTS brochure_pages_brochure_idx ON brochure_pages(brochure_id);
CREATE INDEX IF NOT EXISTS hotspots_page_idx ON hotspots(page_id);

-- =====================================================================
-- 4. Event tracking columns
-- =====================================================================

ALTER TABLE ar_events ADD COLUMN IF NOT EXISTS session_id uuid;
ALTER TABLE ar_events ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE ar_events ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE ar_events ADD COLUMN IF NOT EXISTS platform text CHECK (platform IN ('ios', 'android', 'desktop', 'other'));

ALTER TABLE ar_events DROP CONSTRAINT IF EXISTS ar_events_event_type_check;
ALTER TABLE ar_events ADD CONSTRAINT ar_events_event_type_check
  CHECK (event_type IN ('session_start', 'target_found', 'hotspot_tapped', 'media_played'));

-- Backfill existing rows.
UPDATE ar_events e
SET tenant_id = p.tenant_id, product_id = p.id
FROM brochures b JOIN products p ON p.id = b.product_id
WHERE b.id = e.brochure_id AND e.tenant_id IS NULL;

-- Stamp server-controlled fields on every insert; never trust the client.
CREATE OR REPLACE FUNCTION ar_events_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pid uuid;
  tid uuid;
BEGIN
  SELECT p.id, p.tenant_id INTO pid, tid
  FROM brochures b JOIN products p ON p.id = b.product_id
  WHERE b.id = NEW.brochure_id;
  IF pid IS NULL THEN
    RAISE EXCEPTION 'unknown brochure';
  END IF;
  NEW.product_id := pid;
  NEW.tenant_id := tid;
  NEW.occurred_at := now();
  NEW.date_key := CURRENT_DATE;
  IF NEW.session_id IS NULL THEN NEW.session_id := gen_random_uuid(); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ar_events_stamp_trigger ON ar_events;
CREATE TRIGGER ar_events_stamp_trigger
  BEFORE INSERT ON ar_events FOR EACH ROW EXECUTE FUNCTION ar_events_stamp();

CREATE INDEX IF NOT EXISTS ar_events_tenant_date_idx ON ar_events(tenant_id, date_key);
CREATE INDEX IF NOT EXISTS ar_events_product_date_idx ON ar_events(product_id, date_key);
CREATE INDEX IF NOT EXISTS ar_events_session_idx ON ar_events(session_id);

-- =====================================================================
-- 5. Row level security — drop the old open policies, add scoped ones
-- =====================================================================

-- platform_admins
CREATE POLICY "Read own platform admin row" ON platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_platform_admin());
CREATE POLICY "Platform admins manage platform admins insert" ON platform_admins FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());
CREATE POLICY "Platform admins manage platform admins delete" ON platform_admins FOR DELETE TO authenticated
  USING (is_platform_admin() AND user_id <> auth.uid());

-- tenant_members
CREATE POLICY "Members read tenant membership" ON tenant_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR can_view_tenant(tenant_id));
CREATE POLICY "Owners add members" ON tenant_members FOR INSERT TO authenticated
  WITH CHECK (can_manage_tenant(tenant_id));
CREATE POLICY "Owners change members" ON tenant_members FOR UPDATE TO authenticated
  USING (can_manage_tenant(tenant_id)) WITH CHECK (can_manage_tenant(tenant_id));
CREATE POLICY "Owners remove members" ON tenant_members FOR DELETE TO authenticated
  USING (can_manage_tenant(tenant_id));

-- tenants
DROP POLICY IF EXISTS "Public read tenants" ON tenants;
DROP POLICY IF EXISTS "Authenticated insert tenants" ON tenants;
DROP POLICY IF EXISTS "Authenticated update tenants" ON tenants;
DROP POLICY IF EXISTS "Authenticated delete tenants" ON tenants;

CREATE POLICY "Read active or own tenants" ON tenants FOR SELECT TO anon, authenticated
  USING (is_active = true OR can_view_tenant(id));
CREATE POLICY "Platform admins create tenants" ON tenants FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());
CREATE POLICY "Owners update tenants" ON tenants FOR UPDATE TO authenticated
  USING (can_manage_tenant(id)) WITH CHECK (can_manage_tenant(id));
CREATE POLICY "Platform admins delete tenants" ON tenants FOR DELETE TO authenticated
  USING (is_platform_admin());

-- products
DROP POLICY IF EXISTS "Public read products" ON products;
DROP POLICY IF EXISTS "Authenticated insert products" ON products;
DROP POLICY IF EXISTS "Authenticated update products" ON products;
DROP POLICY IF EXISTS "Authenticated delete products" ON products;

CREATE POLICY "Read active or own products" ON products FOR SELECT TO anon, authenticated
  USING (
    (is_active = true AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = tenant_id AND t.is_active))
    OR can_view_tenant(tenant_id)
  );
CREATE POLICY "Editors insert products" ON products FOR INSERT TO authenticated
  WITH CHECK (can_edit_tenant(tenant_id));
CREATE POLICY "Editors update products" ON products FOR UPDATE TO authenticated
  USING (can_edit_tenant(tenant_id)) WITH CHECK (can_edit_tenant(tenant_id));
CREATE POLICY "Editors delete products" ON products FOR DELETE TO authenticated
  USING (can_edit_tenant(tenant_id));

-- brochures
DROP POLICY IF EXISTS "Public read brochures" ON brochures;
DROP POLICY IF EXISTS "Authenticated insert brochures" ON brochures;
DROP POLICY IF EXISTS "Authenticated update brochures" ON brochures;
DROP POLICY IF EXISTS "Authenticated delete brochures" ON brochures;

CREATE POLICY "Read public or own brochures" ON brochures FOR SELECT TO anon, authenticated
  USING (brochure_is_public(id) OR can_view_tenant(product_tenant(product_id)));
CREATE POLICY "Editors insert brochures" ON brochures FOR INSERT TO authenticated
  WITH CHECK (can_edit_tenant(product_tenant(product_id)));
CREATE POLICY "Editors update brochures" ON brochures FOR UPDATE TO authenticated
  USING (can_edit_tenant(product_tenant(product_id))) WITH CHECK (can_edit_tenant(product_tenant(product_id)));
CREATE POLICY "Editors delete brochures" ON brochures FOR DELETE TO authenticated
  USING (can_edit_tenant(product_tenant(product_id)));

-- brochure_pages
DROP POLICY IF EXISTS "Public read brochure_pages" ON brochure_pages;
DROP POLICY IF EXISTS "Authenticated insert brochure_pages" ON brochure_pages;
DROP POLICY IF EXISTS "Authenticated update brochure_pages" ON brochure_pages;
DROP POLICY IF EXISTS "Authenticated delete brochure_pages" ON brochure_pages;

CREATE POLICY "Read public or own pages" ON brochure_pages FOR SELECT TO anon, authenticated
  USING (brochure_is_public(brochure_id) OR can_view_tenant(brochure_tenant(brochure_id)));
CREATE POLICY "Editors insert pages" ON brochure_pages FOR INSERT TO authenticated
  WITH CHECK (can_edit_tenant(brochure_tenant(brochure_id)));
CREATE POLICY "Editors update pages" ON brochure_pages FOR UPDATE TO authenticated
  USING (can_edit_tenant(brochure_tenant(brochure_id))) WITH CHECK (can_edit_tenant(brochure_tenant(brochure_id)));
CREATE POLICY "Editors delete pages" ON brochure_pages FOR DELETE TO authenticated
  USING (can_edit_tenant(brochure_tenant(brochure_id)));

-- hotspots
DROP POLICY IF EXISTS "Public read hotspots" ON hotspots;
DROP POLICY IF EXISTS "Authenticated insert hotspots" ON hotspots;
DROP POLICY IF EXISTS "Authenticated update hotspots" ON hotspots;
DROP POLICY IF EXISTS "Authenticated delete hotspots" ON hotspots;

CREATE POLICY "Read public or own hotspots" ON hotspots FOR SELECT TO anon, authenticated
  USING (page_is_public(page_id) OR can_view_tenant(page_tenant(page_id)));
CREATE POLICY "Editors insert hotspots" ON hotspots FOR INSERT TO authenticated
  WITH CHECK (can_edit_tenant(page_tenant(page_id)));
CREATE POLICY "Editors update hotspots" ON hotspots FOR UPDATE TO authenticated
  USING (can_edit_tenant(page_tenant(page_id))) WITH CHECK (can_edit_tenant(page_tenant(page_id)));
CREATE POLICY "Editors delete hotspots" ON hotspots FOR DELETE TO authenticated
  USING (can_edit_tenant(page_tenant(page_id)));

-- ar_events
DROP POLICY IF EXISTS "Public insert ar_events" ON ar_events;
DROP POLICY IF EXISTS "Authenticated read ar_events" ON ar_events;

CREATE POLICY "Public insert events for active brochures" ON ar_events FOR INSERT TO anon, authenticated
  WITH CHECK (
    brochure_is_public(brochure_id)
    AND (page_id IS NULL OR EXISTS (SELECT 1 FROM brochure_pages bp WHERE bp.id = page_id AND bp.brochure_id = ar_events.brochure_id))
    AND (hotspot_id IS NULL OR EXISTS (
      SELECT 1 FROM hotspots h JOIN brochure_pages bp ON bp.id = h.page_id
      WHERE h.id = hotspot_id AND bp.brochure_id = ar_events.brochure_id))
  );
CREATE POLICY "Members read own tenant events" ON ar_events FOR SELECT TO authenticated
  USING (can_view_tenant(tenant_id));

-- =====================================================================
-- 6. Storage: scope writes to the tenant folder
-- =====================================================================

DROP POLICY IF EXISTS "Public read brochure-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload brochure-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update brochure-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete brochure-assets" ON storage.objects;

CREATE POLICY "Public read brochure-assets" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'brochure-assets');
CREATE POLICY "Editors upload to own tenant folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'brochure-assets' AND can_edit_tenant(storage_path_tenant(name)));
CREATE POLICY "Editors update own tenant folder" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'brochure-assets' AND can_edit_tenant(storage_path_tenant(name)))
  WITH CHECK (bucket_id = 'brochure-assets' AND can_edit_tenant(storage_path_tenant(name)));
CREATE POLICY "Editors delete from own tenant folder" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'brochure-assets' AND can_edit_tenant(storage_path_tenant(name)));

-- Bucket limits: 100 MB per file, only the media types the app uses.
DO $$ BEGIN
  UPDATE storage.buckets
  SET file_size_limit = 104857600,
      allowed_mime_types = ARRAY['image/*', 'audio/*', 'video/*', 'application/pdf', 'application/octet-stream']
  WHERE id = 'brochure-assets';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not update bucket limits: %', SQLERRM;
END $$;

-- =====================================================================
-- 7. Team management RPCs
-- =====================================================================

CREATE OR REPLACE FUNCTION list_tenant_members(tid uuid)
RETURNS TABLE (user_id uuid, email text, role text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, u.email::text, m.role, m.created_at
  FROM tenant_members m JOIN auth.users u ON u.id = m.user_id
  WHERE m.tenant_id = tid AND can_view_tenant(tid)
  ORDER BY m.created_at;
$$;

CREATE OR REPLACE FUNCTION add_tenant_member(tid uuid, member_email text, member_role text DEFAULT 'editor')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid;
BEGIN
  IF NOT can_manage_tenant(tid) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF member_role NOT IN ('owner', 'editor', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(trim(member_email));
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No user with that email. Create the user first.';
  END IF;
  INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (tid, uid, member_role)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;

CREATE OR REPLACE FUNCTION set_tenant_member_role(tid uuid, member_user_id uuid, member_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT can_manage_tenant(tid) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF member_role NOT IN ('owner', 'editor', 'viewer') THEN RAISE EXCEPTION 'Invalid role'; END IF;
  UPDATE tenant_members SET role = member_role WHERE tenant_id = tid AND user_id = member_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION remove_tenant_member(tid uuid, member_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT can_manage_tenant(tid) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  DELETE FROM tenant_members WHERE tenant_id = tid AND user_id = member_user_id;
END;
$$;

-- Platform admin list with emails (platform admins only)
CREATE OR REPLACE FUNCTION list_platform_admins()
RETURNS TABLE (user_id uuid, email text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.user_id, u.email::text, a.created_at
  FROM platform_admins a JOIN auth.users u ON u.id = a.user_id
  WHERE is_platform_admin()
  ORDER BY a.created_at;
$$;

CREATE OR REPLACE FUNCTION add_platform_admin(admin_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(trim(admin_email));
  IF uid IS NULL THEN RAISE EXCEPTION 'No user with that email. Create the user first.'; END IF;
  INSERT INTO platform_admins (user_id) VALUES (uid) ON CONFLICT DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION list_tenant_members(uuid), add_tenant_member(uuid, text, text),
  set_tenant_member_role(uuid, uuid, text), remove_tenant_member(uuid, uuid),
  list_platform_admins(), add_platform_admin(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION list_tenant_members(uuid), add_tenant_member(uuid, text, text),
  set_tenant_member_role(uuid, uuid, text), remove_tenant_member(uuid, uuid),
  list_platform_admins(), add_platform_admin(text) TO authenticated;
