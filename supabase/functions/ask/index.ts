// Edge function: ask
//
// One question in, one grounded answer out. Called anonymously from the AR
// player (verify_jwt = false in config.toml); every safety rule lives here.
//
// POST { tenant_slug, product_slug, team?: boolean, question, session_id?, source? }
// -> { answer, language, tier, sources: [{ kind, id, label }], handoff }
//
// Three tiers:
//   fact     product facts, only from brochure blocks + knowledge items, cited
//   explain  what a feature is in general (brochure_plus scope only); never a
//            number, variant or availability claim about THIS product
//   handoff  not covered (price, stock, rivals, anything uncited) -> dealer
//   blocked  matched the hard blocklist before the model ran
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
const MAX_QUESTION = 400;
const MAX_CONTEXT_CHARS = 36000;

// Hard blocklist: these never reach the model. English and common Hinglish.
const BLOCKLIST = /\b(price|prices|pricing|cost|costs|rate|rates|emi|loan|finance|financing|interest|discount|discounts|offer|offers|deal|deals|scheme|cashback|exchange bonus|on[- ]road|ex[- ]showroom|booking|book|waiting period|waiting|delivery|deliver|stock|available in stock|lakh|lakhs|crore|rupees|rs\.?|₹|kimat|keemat|keemath|daam|daamat|mehenga|sasta|sasti|kitne ka|kitna hai|kitne mein|kitni hai|mehnga)\b/i;

type Source = { kind: 'hotspot' | 'knowledge'; id: string; label: string };
type Snippet = { key: string; source: Source; text: string };

function clean(s: string) { return s.replace(/\s+/g, ' ').trim(); }

/** Crude keyword overlap so the context stays small on big brochures. */
function rank(snippets: Snippet[], question: string): Snippet[] {
  const q = question.toLowerCase().split(/[^a-z0-9ऀ-෿]+/).filter(w => w.length > 2);
  const scored = snippets.map(s => {
    const t = s.text.toLowerCase();
    let score = 0;
    for (const w of q) if (t.includes(w)) score += 1;
    return { s, score };
  });
  scored.sort((a, b) => b.score - a.score);
  // Always include the top matches; then fill with the rest in original order up to the budget.
  const out: Snippet[] = [];
  let used = 0;
  for (const { s } of scored) {
    if (used + s.text.length > MAX_CONTEXT_CHARS) continue;
    out.push(s); used += s.text.length;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const started = Date.now();
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  let body: { tenant_slug?: string; product_slug?: string; team?: boolean; question?: string; session_id?: string; source?: string; language?: string };
  try { body = await req.json(); } catch { return json(400, { error: 'Bad request' }); }
  const question = clean(body.question ?? '').slice(0, MAX_QUESTION);
  const team = body.team === true;
  if (!body.tenant_slug || !body.product_slug || question.length < 2) return json(400, { error: 'Ask a question.' });

  // Tenant, product, brochure
  const { data: tenant } = await admin.from('tenants').select('id, name, slug, is_active, assistant_scope, assistant_language, assistant_monthly_cap, whatsapp_number, phone_number')
    .eq('slug', body.tenant_slug).maybeSingle();
  if (!tenant || !tenant.is_active) return json(404, { error: 'Not found' });
  const { data: product } = await admin.from('products').select('id, name, slug, description, is_active').eq('tenant_id', tenant.id).eq('slug', body.product_slug).maybeSingle();
  if (!product || !product.is_active) return json(404, { error: 'Not found' });
  const { data: brochure } = await admin.from('brochures').select('id, status').eq('product_id', product.id).maybeSingle();

  const scope = tenant.assistant_scope as 'off' | 'team' | 'brochure' | 'brochure_plus';
  if (scope === 'off' || (scope === 'team' && !team)) return json(403, { error: 'Ask AI is not enabled for this brochure.' });
  const allowExplain = scope === 'brochure_plus' || scope === 'team';

  const log = async (fields: Record<string, unknown>) => {
    await admin.from('assistant_questions').insert({
      tenant_id: tenant.id, product_id: product.id, brochure_id: brochure?.id ?? null,
      session_id: body.session_id ?? null, source: body.source ?? null, team, question,
      latency_ms: Date.now() - started, ...fields,
    });
  };

  // Monthly cap
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await admin.from('assistant_questions').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id).gte('created_at', monthStart.toISOString());
  if ((count ?? 0) >= tenant.assistant_monthly_cap) {
    return json(429, { error: 'Ask AI has reached its monthly limit for this brochure. Please ask the dealer.' });
  }

  const handoffText = (lang: string) => lang.startsWith('hi')
    ? 'इसका जवाब डीलर ही दे पाएंगे। नीचे दिए बटन से संपर्क करें।'
    : 'The dealer can answer that for you. Use the button below to get in touch.';

  // Hard blocklist
  if (BLOCKLIST.test(question)) {
    const language = body.language ?? 'en';
    await log({ tier: 'blocked', answer: null, language });
    return json(200, { answer: handoffText(language), language, tier: 'blocked', sources: [], handoff: true });
  }

  if (!apiKey) {
    await log({ tier: 'error', answer: 'missing ANTHROPIC_API_KEY' });
    return json(500, { error: 'Ask AI is not configured yet.' });
  }

  // Build grounding snippets
  const snippets: Snippet[] = [];
  if (product.description) snippets.push({ key: 'product', source: { kind: 'knowledge', id: product.id, label: product.name }, text: `About ${product.name}: ${clean(product.description)}` });

  if (brochure) {
    const { data: pages } = await admin.from('brochure_pages').select('id, page_index').eq('brochure_id', brochure.id);
    const pageIds = (pages ?? []).map(p => p.id);
    if (pageIds.length) {
      const { data: hotspots } = await admin.from('hotspots').select('id, label, page_id').in('page_id', pageIds);
      const hsIds = (hotspots ?? []).map(h => h.id);
      const { data: blocks } = hsIds.length
        ? await admin.from('hotspot_blocks').select('hotspot_id, kind, audience, data').in('hotspot_id', hsIds).order('position')
        : { data: [] as any[] };
      const pageNo = Object.fromEntries((pages ?? []).map(p => [p.id, p.page_index + 1]));
      for (const h of hotspots ?? []) {
        const parts: string[] = [];
        for (const b of (blocks ?? []).filter((b: any) => b.hotspot_id === h.id)) {
          if (b.audience === 'team' && !team) continue;
          const d = b.data as Record<string, any>;
          if (b.kind === 'text' && d.text) parts.push(clean(d.text));
          if (b.kind === 'spec_table' && Array.isArray(d.rows)) parts.push((d.title ? d.title + ': ' : '') + d.rows.map((r: any) => `${r.label}: ${r.value}`).join('; '));
          if (b.kind === 'image' && d.caption) parts.push(clean(d.caption));
          if (b.kind === 'pitch' && team) parts.push(`Sales pitch: ${d.pitch ?? ''}. Objection: ${d.objection ?? ''}. Response: ${d.response ?? ''}`);
        }
        const text = `[Page ${pageNo[h.page_id] ?? '?'} · ${h.label}] ${parts.join(' ') || '(no description)'}`;
        snippets.push({ key: `h:${h.id}`, source: { kind: 'hotspot', id: h.id, label: `${h.label} (page ${pageNo[h.page_id] ?? '?'})` }, text });
      }
    }
  }

  const { data: items } = await admin.from('knowledge_items').select('id, kind, title, question, content, audience').eq('product_id', product.id).order('position');
  for (const it of items ?? []) {
    if (it.audience === 'team' && !team) continue;
    const text = it.kind === 'faq' ? `[FAQ · ${it.title}] Q: ${it.question ?? it.title} A: ${clean(it.content)}` : `[${it.kind === 'document' ? 'Document' : 'Note'} · ${it.title}] ${clean(it.content)}`;
    // Long documents are split so the ranker can pick the relevant part.
    const CH = 1800;
    if (text.length <= CH) snippets.push({ key: `k:${it.id}`, source: { kind: 'knowledge', id: it.id, label: it.title }, text });
    else for (let i = 0; i < text.length; i += CH) snippets.push({ key: `k:${it.id}:${i}`, source: { kind: 'knowledge', id: it.id, label: it.title }, text: `[${it.title}] ` + text.slice(i, i + CH) });
  }

  const chosen = rank(snippets, question);
  const sourceIndex = new Map<string, Source>();
  const contextText = chosen.map((s, i) => { const tag = `S${i + 1}`; sourceIndex.set(tag, s.source); return `${tag}: ${s.text}`; }).join('\n\n');

  const system = `You are "Ask", a one-answer assistant inside an augmented-reality brochure for the product "${product.name}" by ${tenant.name}. A customer in a showroom (or a salesperson, when TEAM is true) asks one question; you give one short answer. There is no conversation history.

RULES, in order of priority:
1. Product facts (numbers, variants, features present or absent, colours, warranty, anything specific to this product) may come ONLY from the SOURCES below. Every such fact must cite its source tag like [S2]. If the sources do not contain the fact, do NOT guess or use outside knowledge: set tier to "handoff".
2. ${allowExplain ? 'You MAY explain general concepts (what a feature is, why it matters, how a type of technology works) from general knowledge; set tier to "explain" for such answers and do not claim the feature is on this product unless a source says so.' : 'Do NOT answer from general knowledge at all. If the sources do not cover it, set tier to "handoff".'}
3. Never discuss price, EMI, finance, discounts, offers, delivery time, stock, booking, or other brands' products: tier "handoff".
4. Answer in the same language the question was asked in (Hindi in Devanagari for Hindi, Hinglish stays Hinglish, English for English, etc.)${tenant.assistant_language !== 'auto' ? `, unless the customer clearly writes another language; the client's preferred language is ${tenant.assistant_language}` : ''}. Keep it to 1–3 short sentences, spoken-style, no bullet lists, no markdown.
5. TEAM is ${team ? 'true: the asker is a salesperson; you may use sales pitch and objection notes and be direct about how to sell the feature.' : 'false: the asker is a customer; never reveal sales pitch or objection notes.'}
6. For "handoff", answer with one polite sentence saying the dealer can help with that (in the asked language) and nothing else.

Respond with JSON only, no prose around it:
{"answer": string, "language": BCP-47 tag like "en" | "hi" | "mr" | "gu" | "ta" | "te" | "kn" | "bn" | "ml" | "pa", "tier": "fact" | "explain" | "handoff", "sources": ["S1", ...]}

SOURCES:
${contextText || '(no sources available)'}`;

  let modelAnswer = '';
  let language = 'en';
  let tier: 'fact' | 'explain' | 'handoff' = 'handoff';
  let cited: Source[] = [];
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 400, system,
        messages: [{ role: 'user', content: question }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const out = await res.json();
    const text: string = (out.content ?? []).map((c: any) => c.text ?? '').join('');
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : text);
    modelAnswer = clean(String(parsed.answer ?? ''));
    language = String(parsed.language ?? 'en').toLowerCase().slice(0, 8) || 'en';
    const t = String(parsed.tier ?? 'handoff');
    tier = t === 'fact' || t === 'explain' ? t : 'handoff';
    const tags: string[] = Array.isArray(parsed.sources) ? parsed.sources.map(String) : [];
    cited = tags.map(tag => sourceIndex.get(tag)).filter((s): s is Source => !!s);
    // Server-side enforcement: a "fact" without a valid citation is downgraded.
    if (tier === 'fact' && cited.length === 0) tier = allowExplain ? 'explain' : 'handoff';
    if (tier === 'explain' && !allowExplain) tier = 'handoff';
    // Strip citation tags from the spoken answer.
    modelAnswer = modelAnswer.replace(/\s*\[S\d+(?:,\s*S\d+)*\]/g, '').trim();
    if (tier === 'handoff') { modelAnswer = modelAnswer || handoffText(language); cited = []; }
    if (!modelAnswer) throw new Error('empty answer');
  } catch (err) {
    console.error(err);
    await log({ tier: 'error', answer: String(err).slice(0, 500) });
    return json(502, { error: 'Ask AI could not answer right now. Please try again.' });
  }

  // De-duplicate sources by id
  const uniq = Array.from(new Map(cited.map(s => [s.id, s])).values()).slice(0, 3);
  await log({ tier, answer: modelAnswer, language, sources: uniq });
  return json(200, { answer: modelAnswer, language, tier, sources: uniq, handoff: tier === 'handoff' });
});
