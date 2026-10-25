/*
  # Tighten helper functions (follow-up to the hardening migration)

  Clears the Supabase advisor warnings:
  - Pins search_path on the two functions that did not set it.
  - Trigger functions are only ever called by triggers, so nobody needs
    EXECUTE on them. Policy helpers keep EXECUTE for anon/authenticated
    because RLS evaluates them as the calling role.
*/

CREATE OR REPLACE FUNCTION storage_path_tenant(object_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION touch_brochure_pages_changed(), set_updated_at(), ar_events_stamp()
  FROM public, anon, authenticated;
