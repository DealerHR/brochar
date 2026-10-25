// Edge function: recognise
//
// One photo in, a short ranked list of the client's products out. Used by the
// showroom floor app: the salesperson points the phone at the real product and
// taps once. Called anonymously (verify_jwt = false in config.toml).
//
// POST { tenant_slug, image: "<base64 jpeg, no data: prefix>", session_id?, team? }
// -> { id, candidates: [{ product_id, slug, name, thumbnail_url, confidence, reason }],
//      label_text, confidence: 'high' | 'medium' | 'low' | 'none', view }
//
// "view" is the side of the product in the photo (front, rear, side, interior,
// dashboard, boot, engine, wheels, top, display, label, or any) so the floor app
// can show the features on that side first.
//
// How it decides: the model sees the photo plus the client's catalogue (name,
// description, label hint, up to two reference images per product) and must pick
// from that list only. Where products look alike (ACs, compressors, jewellery)
// the label hint tells it where the nameplate / price tag is, and the label text
// it reads is returned so the app can show it.
//
// Secrets: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (optional).

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5';
const MAX_IMAGE_BYTES = 1_500_000; // the app sends a ~1024px JPEG, well under this
// Reference photos cost tokens on every tap, so a budget: a few per product and a
// total across the catalogue. One photo per distinct side is picked first.
const MAX_REFERENCE_IMAGES_PER_PRODUCT = 4;
const MAX_REFERENCE_IMAGES_TOTAL = 36;
const MAX_PRODUCTS = 40;
const VIEWS = ['front', 'rear', 'side', 'interior', 'dashboard', 'boot', 'engine', 'wheels', 'top', 'display', 'label'];
const MONTHLY_CAP_MULTIPLIER = 1; // shares the client's Ask AI monthly cap

type Candidate = { product_id: string; slug: string; name: string; thumbnail_url: string | null; confidence: 'high' | 'medium' | 'low'; reason: string };
type Confidence = 'high' | 'medium' | 'low' | 'none';

type Ref = { url: string; view: string };
function refsOf(raw: unknown): Ref[] {
  if (!Array.isArray(raw)) return [];
  const out: Ref[] = [];
  for (const r of raw) {
    const url = typeof r === 'string' ? r : r?.url;
    const view = typeof r === 'object' && r && VIEWS.includes(r.view) ? r.view : 'any';
    if (typeof url === 'string' && /^https?:\/\//.test(url)) out.push({ url, view });
  }
  return out;
}
/** One photo per distinct side first, then the rest, up to the per-product cap. */
function pickRefs(refs: Ref[], cap: number): Ref[] {
  const seen = new Set<string>();
  const first: Ref[] = [], rest: Ref[] = [];
  for (const r of refs) { if (r.view !== 'any' && !seen.has(r.view)) { seen.add(r.view); first.push(r); } else rest.push(r); }
  return [...first, ...rest].slice(0, cap);
}

function parseModelJson(text: string): { candidates?: unknown; label_text?: unknown; view?: unknown } {
  const body = text.replace(/```(?:json)?/g, '').trim();
  const m = body.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : body); } catch { throw new Error(`model reply not readable: ${body.slice(0, 120)}`); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const started = Date.now();
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json(500, { error: 'Recognition is not configured.' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  let body: { tenant_slug?: string; image?: string; session_id?: string; team?: boolean };
  try { body = await req.json(); } catch { return json(400, { error: 'Bad request' }); }
  const image = (body.image ?? '').replace(/^data:image\/\w+;base64,/, '');
  if (!body.tenant_slug || image.length < 100) return json(400, { error: 'Send a photo.' });
  if (image.length > MAX_IMAGE_BYTES * 1.4) return json(413, { error: 'Photo too large.' });

  const { data: tenant } = await admin.from('tenants').select('id, name, slug, is_active, assistant_monthly_cap').eq('slug', body.tenant_slug).maybeSingle();
  if (!tenant || !tenant.is_active) return json(404, { error: 'Not found' });

  const { data: products } = await admin.from('products')
    .select('id, slug, name, description, thumbnail_url, reference_images, label_hint, floor_enabled, is_active')
    .eq('tenant_id', tenant.id).eq('is_active', true).eq('floor_enabled', true).order('display_order').limit(MAX_PRODUCTS);
  if (!products?.length) return json(404, { error: 'No products are set up for the floor yet.' });

  const log = async (fields: Record<string, unknown>) => {
    const { data } = await admin.from('recognitions').insert({
      tenant_id: tenant.id, session_id: body.session_id ?? null, team: body.team !== false,
      latency_ms: Date.now() - started, ...fields,
    }).select('id').single();
    return data?.id as string | undefined;
  };

  // Shares the Ask AI monthly cap so a busy floor cannot run up an unexpected bill.
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await admin.from('recognitions').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id).gte('created_at', monthStart.toISOString());
  if ((count ?? 0) >= tenant.assistant_monthly_cap * MONTHLY_CAP_MULTIPLIER) {
    return json(429, { error: 'Recognition has reached its monthly limit. Pick the product from the list.' });
  }

  // Catalogue text + reference images. Reference images are fetched by URL so the
  // model can compare; failures are skipped silently.
  const catalogue = products.map((p, i) =>
    `P${i + 1}: ${p.name}${p.description ? ` — ${String(p.description).slice(0, 200)}` : ''}${p.label_hint ? ` | Label: ${p.label_hint}` : ''}`).join('\n');

  // deno-lint-ignore no-explicit-any
  const content: any[] = [];
  const perProduct = Math.max(1, Math.min(MAX_REFERENCE_IMAGES_PER_PRODUCT, Math.floor(MAX_REFERENCE_IMAGES_TOTAL / products.length)));
  for (let i = 0; i < products.length; i++) {
    for (const r of pickRefs(refsOf(products[i].reference_images), perProduct)) {
      content.push({ type: 'text', text: `Reference photo of P${i + 1} (${products[i].name})${r.view !== 'any' ? `, ${r.view} view` : ''}:` });
      content.push({ type: 'image', source: { type: 'url', url: r.url } });
    }
  }
  content.push({ type: 'text', text: 'PHOTO TAKEN NOW on the showroom floor:' });
  content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } });
  content.push({ type: 'text', text: 'Which product from the catalogue is in the photo taken now? Reply with JSON only.' });

  const system = `You identify which product from a client's catalogue appears in a photo taken on a showroom floor. Client: ${tenant.name}.

CATALOGUE (choose only from these; P-numbers are the ids):
${catalogue}

RULES:
- Compare the photo against the catalogue names, descriptions, label hints and reference photos. Badges, model names, nameplates, stickers, price tags and visible text are the strongest evidence: read them carefully and report what you read in "label_text" (empty string if none).
- Rank up to 3 candidates, best first. "confidence" per candidate: "high" = badge/label text or an unmistakable match; "medium" = strong visual match but no text confirmation; "low" = plausible only.
- If the photo shows none of the catalogue products, or no product at all, return an empty candidates list.
- Never invent a product that is not in the catalogue. Never guess a variant from colour alone.
- "reason" is one short phrase a salesperson can read, e.g. "Badge on the boot reads TIAGO.EV".
- "view" is the side or part of the product the photo shows, one of: ${VIEWS.join(', ')}; use "any" if unclear or if several sides are equally visible. For a vehicle: front = grille/headlamps, rear = boot/tail lamps, side = door profile, interior = seats/cabin, dashboard = steering/console, boot = open luggage area, engine = open bonnet, wheels = a wheel close up, top = roof/sunroof, display = a screen or controls, label = a nameplate or sticker close up.

Respond with JSON only:
{"label_text": string, "view": string, "candidates": [{"id": "P3", "confidence": "high" | "medium" | "low", "reason": string}]}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, system, messages: [{ role: 'user', content }] }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const out = await res.json();
    // deno-lint-ignore no-explicit-any
    const text: string = (out.content ?? []).map((c: any) => c.text ?? '').join('');
    const parsed = parseModelJson(text);

    const candidates: Candidate[] = [];
    const seen = new Set<string>();
    for (const c of Array.isArray(parsed.candidates) ? parsed.candidates : []) {
      const idx = parseInt(String(c?.id ?? '').replace(/^P/i, ''), 10) - 1;
      const p = products[idx];
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      const conf = c?.confidence === 'high' || c?.confidence === 'medium' ? c.confidence : 'low';
      candidates.push({ product_id: p.id, slug: p.slug, name: p.name, thumbnail_url: p.thumbnail_url ?? null, confidence: conf, reason: String(c?.reason ?? '').slice(0, 140) });
      if (candidates.length === 3) break;
    }
    const label_text = String(parsed.label_text ?? '').slice(0, 200);
    const confidence: Confidence = candidates[0]?.confidence ?? 'none';
    const view = VIEWS.includes(String(parsed.view)) ? String(parsed.view) : 'any';

    const id = await log({
      candidates: candidates.map(c => ({ product_id: c.product_id, confidence: c.confidence, reason: c.reason })),
      label_text: label_text || null, top_product_id: candidates[0]?.product_id ?? null, confidence, view,
    });
    return json(200, { id, candidates, label_text, confidence, view });
  } catch (err) {
    console.error(err);
    await log({ confidence: 'error', error: String(err).slice(0, 500) });
    return json(502, { error: 'Could not recognise the product right now. Pick it from the list.' });
  }
});
