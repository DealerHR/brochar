/*
  # ARchive Platform - Core Schema

  ## Summary
  Creates the complete multi-tenant AR brochure platform schema.

  ## New Tables

  ### tenants
  - Represents brands/clients on the platform
  - Fields: id, name, slug (unique), logo_url, brand_color, description, is_active, created_at

  ### products
  - Products belonging to a tenant
  - Fields: id, tenant_id (FK), name, slug, thumbnail_url, description, display_order, is_active, created_at
  - Unique constraint on (tenant_id, slug)

  ### brochures
  - One AR brochure experience per product
  - Fields: id, product_id (FK), title, status (draft/active/inactive), mind_file_url, compiled_at, created_at, updated_at

  ### brochure_pages
  - Individual pages of a brochure (each is one image target)
  - Fields: id, brochure_id (FK), page_index, image_url, label, created_at

  ### hotspots
  - Interactive hotspots placed on brochure pages
  - Fields: id, page_id (FK), label, description, pos_x, pos_y, dot_color, audio_type, audio_url, video_type, video_ref, display_order, created_at

  ### ar_events
  - Analytics events for AR sessions
  - Fields: id, brochure_id (FK), page_id (FK), hotspot_id (FK), event_type, occurred_at, date_key

  ## Security
  - RLS enabled on all tables
  - Policies allow read for all (public pages), write for authenticated admin
*/

-- Tenants
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  logo_url text,
  brand_color text DEFAULT '#C41E3A',
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read tenants"
  ON tenants FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated insert tenants"
  ON tenants FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update tenants"
  ON tenants FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated delete tenants"
  ON tenants FOR DELETE
  TO authenticated
  USING (true);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  thumbnail_url text,
  description text,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read products"
  ON products FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update products"
  ON products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated delete products"
  ON products FOR DELETE
  TO authenticated
  USING (true);

-- Brochures
CREATE TABLE IF NOT EXISTS brochures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive')),
  mind_file_url text,
  compiled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE brochures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read brochures"
  ON brochures FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated insert brochures"
  ON brochures FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update brochures"
  ON brochures FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated delete brochures"
  ON brochures FOR DELETE
  TO authenticated
  USING (true);

-- Brochure Pages
CREATE TABLE IF NOT EXISTS brochure_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brochure_id uuid REFERENCES brochures(id) ON DELETE CASCADE,
  page_index integer NOT NULL,
  image_url text NOT NULL,
  label text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE brochure_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read brochure_pages"
  ON brochure_pages FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated insert brochure_pages"
  ON brochure_pages FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update brochure_pages"
  ON brochure_pages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated delete brochure_pages"
  ON brochure_pages FOR DELETE
  TO authenticated
  USING (true);

-- Hotspots
CREATE TABLE IF NOT EXISTS hotspots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid REFERENCES brochure_pages(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text,
  pos_x float NOT NULL,
  pos_y float NOT NULL,
  dot_color text DEFAULT '#C41E3A',
  audio_type text DEFAULT 'tts' CHECK (audio_type IN ('tts', 'upload', 'none')),
  audio_url text,
  video_type text DEFAULT 'none' CHECK (video_type IN ('none', 'youtube', 'upload')),
  video_ref text,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE hotspots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read hotspots"
  ON hotspots FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated insert hotspots"
  ON hotspots FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update hotspots"
  ON hotspots FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated delete hotspots"
  ON hotspots FOR DELETE
  TO authenticated
  USING (true);

-- AR Events
CREATE TABLE IF NOT EXISTS ar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brochure_id uuid REFERENCES brochures(id) ON DELETE CASCADE,
  page_id uuid REFERENCES brochure_pages(id) ON DELETE SET NULL,
  hotspot_id uuid REFERENCES hotspots(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('session_start', 'target_found', 'hotspot_tapped')),
  occurred_at timestamptz DEFAULT now(),
  date_key date DEFAULT CURRENT_DATE
);

ALTER TABLE ar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public insert ar_events"
  ON ar_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated read ar_events"
  ON ar_events FOR SELECT
  TO authenticated
  USING (true);
