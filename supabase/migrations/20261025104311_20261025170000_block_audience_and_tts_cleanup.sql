/*
  # Block audience, and clean-up of converted text-to-speech blocks

  ## Audience
  hotspot_blocks.audience: 'all' (customers and sales team) or 'team'
  (sales team only). Replaces the fixed "learn mode only" rule for quiz and
  pitch blocks: any block can now be sales-team-only, and quiz/pitch default
  to team. The sales team link is /{tenant}/{product}/team (old /learn still
  works).

  ## Clean-up
  The original schema defaulted every hotspot to audio_type = 'tts', so the
  content conversion gave every hotspot an autoplay "read aloud" block.
  Remove exactly those converted blocks (mode tts, text equal to the legacy
  description) and reset the legacy flag so they are never recreated. Audio
  blocks an editor created themselves have different text and are kept.
*/

ALTER TABLE hotspot_blocks ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all'
  CHECK (audience IN ('all', 'team'));

UPDATE hotspot_blocks SET audience = 'team' WHERE kind IN ('quiz', 'pitch') AND audience = 'all';

DELETE FROM hotspot_blocks b
USING hotspots h
WHERE b.hotspot_id = h.id
  AND b.kind = 'audio'
  AND b.data->>'mode' = 'tts'
  AND h.audio_type = 'tts'
  AND coalesce(b.data->>'text', '') = coalesce(h.description, h.label, '');

UPDATE hotspots SET audio_type = 'none' WHERE audio_type = 'tts';
