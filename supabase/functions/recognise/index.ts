// Edge function: recognise
//
// One photo in, a short ranked list of the client's products out. Used by the
// showroom floor app: the salesperson points the phone at the real product and
// taps once. Called anonymously (verify_jwt = false in config.toml).
//
// POST { tenant_slug, image: "<base64 jpeg, no data: prefix>", session_id?, team? }
// -> { id, candidates: [{ product_id, slug, name, thumbnail_url, score, confidence, reason }],
//      label_text, confidence: 'high' | 'medium' | 'low' | 'none', score, view }
//
// POST { tenant_slug, warm: true }
// -> { ok: true }  Loads the catalogue and reference photos and primes Claude's
//    prompt cache, so the salesperson's first tap is as fast as the later ones.
//    The floor app calls this when it opens.
//
// "score" is 0-100: how sure the model is. The floor app opens the product
// straight away at 75 or more and asks to confirm below that.
// "view" is the side of the product in the photo, so the floor app can show
// the features on that side.
//
// Speed:
//   - Catalogue + reference photos are kept in memory per client for a few
//     minutes (no database or storage round trips on most taps).
//   - System prompt + reference photos are sent first and marked for Claude's
//     prompt cache (1 hour). Only the live photo is new on each tap, so the model
//     reads a few hundred new tokens instead of thousands.
//   - The log row is written after the reply is sent.
//
// Secrets: ANTHROPIC_API_KEY (required). RECOGNISE_MODEL (optional), defaults to
// claude-sonnet-5-5. ANTHROPIC_MODEL is the Ask AI model and is not used here.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const MODEL = Deno.env.get('RECOGNISE_MODEL') ?? 'claude-sonnet-5-5';
const MAX_IMAGE_BYTES = 1_500_000;
// Reference photos per tap: one per distinct side first, a few per product, a cap overall.
const MAX_REFERENCE_IMAGES_PER_PRODUCT = 3;
const MAX_REFERENCE_IMAGES_TOTAL = 15;
// A reference photo bigger than this is skipped (re-save it from the admin: new uploads are ~60 KB).
const MAX_REFERENCE_BYTES = 900_000;
const MAX_PRODUCTS = 40;
const CATALOGUE_TTL_MS = 3 * 60_000;   // how long a client's catalogue is reused from memory
const COUNT_TTL_MS = 5 * 60_000;       // how long the monthly count is reused from memory
const VIEWS = ['front', 'rear', 'side', 'interior', 'dashboard', 'boot', 'engine', 'wheels', 'top', 'display', 'label'];

type Confidence = 'high' | 'medium' | 'low' | 'none';
type Candidate = { product_id: string; slug: string; name: string; thumbnail_url: string | null; score: number; confidence: Exclude<Confidence, 'none'>; reason: string };
type ProductRow = { id: string; slug: string; name: string; description: string | null; thumbnail_url: string | null; reference_images: unknown; label_hint: string | null };
type Tenant = { id: string; name: string; slug: string; assistant_monthly_cap: number };
// deno-lint-ignore no-explicit-any
type Block = any;
type Catalogue = { tenant: Tenant; products: ProductRow[]; system: string; refBlocks: Block[]; loadedAt: number };

const confidenceOf = (score: number): Exclude<Confidence, 'none'> => score >= 85 ? 'high' : score >= 70 ? 'medium' : 'low';

/* ---------- in-memory caches (live as long as this function instance) ---------- */

const catalogues = new Map<string, Catalogue>();
const loading = new Map<string, Promise<Catalogue | null>>();
const imageCache = new Map<string, { data: string; media_type: string } | null>();
const monthCounts = new Map<string, { month: string; count: number; at: number }>();

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

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}

/** Fetches a reference photo once per instance. Base64 keeps the prompt identical between taps, which the prompt cache needs. */
async function loadImage(url: string): Promise<{ data: string; media_type: string } | null> {
  if (imageCache.has(url)) return imageCache.get(url)!;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength > MAX_REFERENCE_BYTES) { console.warn('reference photo too large, skipped', url, buf.byteLength); imageCache.set(url, null); return null; }
    const type = (r.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
    const media_type = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type) ? type : 'image/jpeg';
    const out = { data: toBase64(buf), media_type };
    imageCache.set(url, out);
    return out;
  } catch (e) {
    console.warn('reference photo failed', url, String(e));
    return null; // not cached: try again next time
  }
}

// deno-lint-ignore no-explicit-any
async function loadCatalogue(admin: any, slug: string): Promise<Catalogue | null> {
  const hit = catalogues.get(slug);
  if (hit && Date.now() - hit.loadedAt < CATALOGUE_TTL_MS) return hit;
  if (loading.has(slug)) return loading.get(slug)!;

  const p = (async () => {
    const { data: tenant } = await admin.from('tenants').select('id, name, slug, is_active, assistant_monthly_cap').eq('slug', slug).maybeSingle();
    if (!tenant || !tenant.is_active) return null;
    const { data: products } = await admin.from('products')
      .select('id, slug, name, description, thumbnail_url, reference_images, label_hint')
      .eq('tenant_id', tenant.id).eq('is_active', true).eq('floor_enabled', true).order('display_order').limit(MAX_PRODUCTS);
    const list: ProductRow[] = products ?? [];

    const catalogue = list.map((p, i) =>
      `P${i + 1}: ${p.name}${p.description ? ` — ${String(p.description).slice(0, 200)}` : ''}${p.label_hint ? ` | Label: ${p.label_hint}` : ''}`).join('\n');

    const system = `You identify which product from a client's catalogue appears in a photo taken on a showroom floor. Client: ${tenant.name}.

CATALOGUE (choose only from these; P-numbers are the ids):
${catalogue}

RULES:
- Compare the photo against the catalogue names, descriptions, label hints and reference photos. Badges, model names, nameplates, stickers, price tags and visible text are the strongest evidence: read them and report what you read in "label_text" (empty string if none).
- Rank up to 3 candidates, best first. "score" per candidate is 0-100, how sure you are that it is this product: 90-100 = badge or label text read, or an unmistakable match; 75-89 = clear visual match without text; 50-74 = similar but could be another catalogue product; below 50 = a guess.
- If the photo shows none of the catalogue products, or no product at all, return an empty candidates list.
- Never invent a product that is not in the catalogue. Never tell variants apart from colour alone.
- "reason": one short phrase a salesperson can read, e.g. "Badge on the boot reads TIAGO.EV".
- "view": the side or part of the product the photo shows, one of: ${VIEWS.join(', ')}; "any" if unclear or several sides are equally visible. For a vehicle: front = grille/headlamps, rear = boot/tail lamps, side = door profile, interior = seats/cabin, dashboard = steering/console, boot = open luggage area, engine = open bonnet, wheels = a wheel close up, top = roof/sunroof, display = a screen or controls, label = a nameplate or sticker close up.

Respond with compact JSON only, no prose:
{"label_text":string,"view":string,"candidates":[{"id":"P3","score":0-100,"reason":string}]}`;

    // Reference photos, fetched in parallel, in a fixed order so the prompt is identical between taps.
    const perProduct = list.length ? Math.max(1, Math.min(MAX_REFERENCE_IMAGES_PER_PRODUCT, Math.floor(MAX_REFERENCE_IMAGES_TOTAL / list.length))) : 0;
    const plan = list.flatMap((p, i) => pickRefs(refsOf(p.reference_images), perProduct).map(r => ({ i, name: p.name, r })));
    const imgs = await Promise.all(plan.map(x => loadImage(x.r.url)));
    const refBlocks: Block[] = [];
    plan.forEach((x, k) => {
      const img = imgs[k];
      if (!img) return;
      refBlocks.push({ type: 'text', text: `Reference photo of P${x.i + 1} (${x.name})${x.r.view !== 'any' ? `, ${x.r.view} view` : ''}:` });
      refBlocks.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
    });
    // Everything up to here is the same on every tap: cache it.
    if (refBlocks.length) refBlocks[refBlocks.length - 1] = { ...refBlocks[refBlocks.length - 1], cache_control: { type: 'ephemeral', ttl: '1h' } };

    const out: Catalogue = { tenant, products: list, system, refBlocks, loadedAt: Date.now() };
    catalogues.set(slug, out);
    return out;
  })().finally(() => loading.delete(slug));
  loading.set(slug, p);
  return p;
}

// deno-lint-ignore no-explicit-any
async function monthCount(admin: any, tenantId: string): Promise<number> {
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const month = monthStart.toISOString();
  const hit = monthCounts.get(tenantId);
  if (hit && hit.month === month && Date.now() - hit.at < COUNT_TTL_MS) return hit.count;
  const { count } = await admin.from('recognitions').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', month);
  monthCounts.set(tenantId, { month, count: count ?? 0, at: Date.now() });
  return count ?? 0;
}
function bumpCount(tenantId: string) { const c = monthCounts.get(tenantId); if (c) c.count += 1; }

function parseModelJson(text: string): { candidates?: unknown; label_text?: unknown; view?: unknown } {
  const body = text.replace(/```(?:json)?/g, '').trim();
  const m = body.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : body); } catch { throw new Error(`model reply not readable: ${body.slice(0, 120)}`); }
}

async function callModel(apiKey: string, system: string, content: Block[], maxTokens: number) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens,
      system: [{ type: 'text', text: system }],
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** Runs after the response is sent where the runtime allows it. */
function background(p: Promise<unknown>) {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p); else p.catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const started = Date.now();
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json(500, { error: 'Recognition is not configured.' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  let body: { tenant_slug?: string; image?: string; session_id?: string; team?: boolean; warm?: boolean };
  try { body = await req.json(); } catch { return json(400, { error: 'Bad request' }); }
  if (!body.tenant_slug) return json(400, { error: 'Bad request' });

  const cat = await loadCatalogue(admin, body.tenant_slug);
  if (!cat) return json(404, { error: 'Not found' });
  if (!cat.products.length) return json(404, { error: 'No products are set up for the floor yet.' });

  /* Warm-up: catalogue is now in memory; prime the prompt cache with a 1-token call. */
  if (body.warm) {
    if (cat.refBlocks.length) {
      background(callModel(apiKey, cat.system, [...cat.refBlocks, { type: 'text', text: 'Reply with {} only.' }], 1)
        .catch(e => console.warn('warm-up', String(e))));
    }
    return json(200, { ok: true });
  }

  const image = (body.image ?? '').replace(/^data:image\/\w+;base64,/, '');
  if (image.length < 100) return json(400, { error: 'Send a photo.' });
  if (image.length > MAX_IMAGE_BYTES * 1.4) return json(413, { error: 'Photo too large.' });

  // Shares the Ask AI monthly cap so a busy floor cannot run up an unexpected bill.
  if (await monthCount(admin, cat.tenant.id) >= cat.tenant.assistant_monthly_cap) {
    return json(429, { error: 'Recognition has reached its monthly limit. Pick the product from the list.' });
  }
  bumpCount(cat.tenant.id);

  const id = crypto.randomUUID();
  const log = (fields: Record<string, unknown>) => background((async () => {
    const { error } = await admin.from('recognitions').insert({
      id, tenant_id: cat.tenant.id, session_id: body.session_id ?? null, team: body.team !== false,
      latency_ms: Date.now() - started, ...fields,
    });
    if (error) console.warn('recognitions log', error.message);
  })());

  const content: Block[] = [
    ...cat.refBlocks,
    { type: 'text', text: 'PHOTO TAKEN NOW on the showroom floor:' },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
    { type: 'text', text: 'Which catalogue product is in the photo taken now? JSON only.' },
  ];

  try {
    const out = await callModel(apiKey, cat.system, content, 250);
    // deno-lint-ignore no-explicit-any
    const text: string = (out.content ?? []).map((c: any) => c.text ?? '').join('');
    const parsed = parseModelJson(text);

    const candidates: Candidate[] = [];
    const seen = new Set<string>();
    for (const c of Array.isArray(parsed.candidates) ? parsed.candidates : []) {
      const idx = parseInt(String(c?.id ?? '').replace(/^P/i, ''), 10) - 1;
      const p = cat.products[idx];
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      // Older prompt versions answered high/medium/low; map those to a score.
      const raw = Number(c?.score);
      const score = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw)))
        : c?.confidence === 'high' ? 90 : c?.confidence === 'medium' ? 75 : 50;
      candidates.push({ product_id: p.id, slug: p.slug, name: p.name, thumbnail_url: p.thumbnail_url ?? null, score, confidence: confidenceOf(score), reason: String(c?.reason ?? '').slice(0, 140) });
      if (candidates.length === 3) break;
    }
    candidates.sort((a, b) => b.score - a.score);
    const label_text = String(parsed.label_text ?? '').slice(0, 200);
    const score = candidates[0]?.score ?? 0;
    const confidence: Confidence = candidates[0]?.confidence ?? 'none';
    const view = VIEWS.includes(String(parsed.view)) ? String(parsed.view) : 'any';

    log({
      candidates: candidates.map(c => ({ product_id: c.product_id, score: c.score, confidence: c.confidence, reason: c.reason })),
      label_text: label_text || null, top_product_id: candidates[0]?.product_id ?? null, confidence, view,
    });
    const usage = out.usage ?? {};
    console.log(`recognise ${Date.now() - started}ms cache_read=${usage.cache_read_input_tokens ?? 0} cache_write=${usage.cache_creation_input_tokens ?? 0} input=${usage.input_tokens ?? 0}`);
    return json(200, { id, candidates, label_text, confidence, score, view });
  } catch (err) {
    console.error(err);
    log({ confidence: 'error', error: String(err).slice(0, 500) });
    return json(502, { error: 'Could not recognise the product right now. Pick it from the list.' });
  }
});
