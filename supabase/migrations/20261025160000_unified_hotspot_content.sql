/*
  # One content model for hotspots

  Text, image, audio and video become content blocks like everything else,
  so a hotspot is: label + dot colour + position + an ordered list of blocks.

  New block kinds (data shape):
    text   { text }
    image  { url, caption }
    audio  { mode: 'tts' | 'upload', url, text, autoplay }
    video  { mode: 'youtube' | 'upload', ref, autoplay }

  Existing hotspots are converted: description -> text, image_url -> image,
  audio_type/audio_url -> audio, video_type/video_ref -> video, placed before
  any blocks they already had. The old columns stay for safety but the app no
  longer reads or writes them.

  hotspots.tap_action: what happens when the dot is tapped.
    'card'   open the content card (default)
    'launch' open the first launchable block straight away
             (link -> overlay, pdf -> document, video -> plays full card,
              call/whatsapp -> dials/opens chat); falls back to the card.
*/

ALTER TABLE hotspot_blocks DROP CONSTRAINT IF EXISTS hotspot_blocks_kind_check;
ALTER TABLE hotspot_blocks ADD CONSTRAINT hotspot_blocks_kind_check
  CHECK (kind IN ('text', 'image', 'audio', 'video', 'link', 'gallery', 'spec_table', 'pdf', 'action', 'quiz', 'pitch'));

ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS tap_action text NOT NULL DEFAULT 'card'
  CHECK (tap_action IN ('card', 'launch'));

-- Convert legacy columns into blocks, once. Idempotent: skips hotspots that
-- already have a text/image/audio/video block.
DO $$
DECLARE
  h record;
  pos integer;
BEGIN
  FOR h IN
    SELECT * FROM hotspots hs
    WHERE NOT EXISTS (SELECT 1 FROM hotspot_blocks b WHERE b.hotspot_id = hs.id AND b.kind IN ('text', 'image', 'audio', 'video'))
  LOOP
    pos := 0;
    -- make room before existing blocks
    UPDATE hotspot_blocks SET position = position + 10 WHERE hotspot_id = h.id;

    IF coalesce(trim(h.description), '') <> '' THEN
      INSERT INTO hotspot_blocks (hotspot_id, kind, position, data)
      VALUES (h.id, 'text', pos, jsonb_build_object('text', h.description));
      pos := pos + 1;
    END IF;

    IF h.image_url IS NOT NULL AND h.image_url <> '' THEN
      INSERT INTO hotspot_blocks (hotspot_id, kind, position, data)
      VALUES (h.id, 'image', pos, jsonb_build_object('url', h.image_url, 'caption', ''));
      pos := pos + 1;
    END IF;

    IF h.audio_type = 'tts' THEN
      INSERT INTO hotspot_blocks (hotspot_id, kind, position, data)
      VALUES (h.id, 'audio', pos, jsonb_build_object('mode', 'tts', 'url', '', 'text', coalesce(h.description, h.label), 'autoplay', true));
      pos := pos + 1;
    ELSIF h.audio_type = 'upload' AND h.audio_url IS NOT NULL AND h.audio_url <> '' THEN
      INSERT INTO hotspot_blocks (hotspot_id, kind, position, data)
      VALUES (h.id, 'audio', pos, jsonb_build_object('mode', 'upload', 'url', h.audio_url, 'text', '', 'autoplay', true));
      pos := pos + 1;
    END IF;

    IF h.video_type IN ('youtube', 'upload') AND h.video_ref IS NOT NULL AND h.video_ref <> '' THEN
      INSERT INTO hotspot_blocks (hotspot_id, kind, position, data)
      VALUES (h.id, 'video', pos, jsonb_build_object('mode', h.video_type, 'ref', h.video_ref, 'autoplay', false));
      pos := pos + 1;
    END IF;
  END LOOP;

  -- re-pack positions densely
  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY hotspot_id ORDER BY position, created_at) - 1 AS p FROM hotspot_blocks
  )
  UPDATE hotspot_blocks b SET position = r.p FROM ranked r WHERE b.id = r.id AND b.position <> r.p;
END $$;
