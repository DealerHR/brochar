/*
  # Ask AI: knowledge base, question log, per-client settings

  ## Tenant settings
  assistant_scope   'off'           Ask button hidden for everyone
                    'team'          Ask only on the sales team link
                    'brochure'      answers only from brochure + knowledge (tier 1)
                    'brochure_plus' tier 1 plus general explanations (tier 2) — default
  assistant_language  BCP-47 tag or 'auto' (answer in the language of the question)
  assistant_monthly_cap  questions per calendar month, all products of the client

  ## knowledge_items (per product)
  kind: 'faq' (question + answer), 'note' (free text), 'document' (text
  extracted from an uploaded PDF). audience 'all' | 'team' like blocks.
  Readable by the public only for active products of active tenants; the
  edge function reads them with the service role anyway.

  ## assistant_questions
  Every question and answer, written only by the edge function (service
  role). Tenant members read; editors can flag and mark "added to knowledge".
  tier: 'fact' (from brochure/knowledge), 'explain' (general concept),
  'handoff' (not covered), 'blocked' (price/offer etc.), 'error'.
*/

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS assistant_scope text NOT NULL DEFAULT 'brochure_plus'
  CHECK (assistant_scope IN ('off', 'team', 'brochure', 'brochure_plus'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS assistant_language text NOT NULL DEFAULT 'auto';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS assistant_monthly_cap integer NOT NULL DEFAULT 2000 CHECK (assistant_monthly_cap >= 0);

CREATE TABLE IF NOT EXISTS knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('faq', 'note', 'document')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  question text CHECK (question IS NULL OR length(question) <= 500),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 60000),
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'team')),
  source_url text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS knowledge_items_product_idx ON knowledge_items(product_id, position);

DROP TRIGGER IF EXISTS knowledge_items_set_updated_at ON knowledge_items;
CREATE TRIGGER knowledge_items_set_updated_at BEFORE UPDATE ON knowledge_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION product_is_public(pid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM products p JOIN tenants t ON t.id = p.tenant_id WHERE p.id = pid AND p.is_active AND t.is_active);
$$;
GRANT EXECUTE ON FUNCTION product_is_public(uuid) TO anon, authenticated;

CREATE POLICY "Read public or own knowledge" ON knowledge_items FOR SELECT TO anon, authenticated
  USING ((audience = 'all' AND product_is_public(product_id)) OR can_view_tenant(product_tenant(product_id)));
CREATE POLICY "Editors insert knowledge" ON knowledge_items FOR INSERT TO authenticated
  WITH CHECK (can_edit_tenant(product_tenant(product_id)));
CREATE POLICY "Editors update knowledge" ON knowledge_items FOR UPDATE TO authenticated
  USING (can_edit_tenant(product_tenant(product_id))) WITH CHECK (can_edit_tenant(product_tenant(product_id)));
CREATE POLICY "Editors delete knowledge" ON knowledge_items FOR DELETE TO authenticated
  USING (can_edit_tenant(product_tenant(product_id)));

CREATE TABLE IF NOT EXISTS assistant_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  brochure_id uuid REFERENCES brochures(id) ON DELETE SET NULL,
  session_id uuid,
  source text,
  team boolean NOT NULL DEFAULT false,
  language text,
  question text NOT NULL,
  answer text,
  tier text NOT NULL CHECK (tier IN ('fact', 'explain', 'handoff', 'blocked', 'error')),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  latency_ms integer,
  flagged boolean NOT NULL DEFAULT false,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE assistant_questions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS assistant_questions_tenant_created_idx ON assistant_questions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assistant_questions_product_idx ON assistant_questions(product_id, created_at DESC);

-- Only the edge function (service role, bypasses RLS) inserts rows.
CREATE POLICY "Members read own tenant questions" ON assistant_questions FOR SELECT TO authenticated
  USING (can_view_tenant(tenant_id));
CREATE POLICY "Editors update own tenant questions" ON assistant_questions FOR UPDATE TO authenticated
  USING (can_edit_tenant(tenant_id)) WITH CHECK (can_edit_tenant(tenant_id));
CREATE POLICY "Editors delete own tenant questions" ON assistant_questions FOR DELETE TO authenticated
  USING (can_edit_tenant(tenant_id));
