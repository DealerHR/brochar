import { useCallback, useEffect, useState } from 'react';
import { supabase, AssistantQuestion, Tenant, Product } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Sparkles, Flag, Check, Plus, Trash2, Download } from 'lucide-react';

const TIER_LABEL: Record<AssistantQuestion['tier'], { text: string; cls: string }> = {
  fact: { text: 'Answered', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  explain: { text: 'Explained', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  handoff: { text: 'Sent to dealer', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  blocked: { text: 'Blocked (price etc.)', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  error: { text: 'Error', cls: 'bg-brand-cerise/10 text-brand-cerise border-brand-cerise/20' },
};

function csvEscape(v: string | null | undefined) {
  const s = (v ?? '').toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function QuestionsPage() {
  const { isPlatformAdmin, memberships, canEdit } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [tenantFilter, setTenantFilter] = useState('');
  const [view, setView] = useState<'all' | 'gaps' | 'flagged'>('gaps');
  const [rows, setRows] = useState<AssistantQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<AssistantQuestion | null>(null);
  const [answerDraft, setAnswerDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ownIds = memberships.map(m => m.tenant_id);

  useEffect(() => {
    let q = supabase.from('tenants').select('*').order('name');
    if (!isPlatformAdmin) q = q.in('id', ownIds);
    q.then(({ data }) => setTenants(data ?? []));
    supabase.from('products').select('*').then(({ data }) => setProducts(Object.fromEntries((data ?? []).map(p => [p.id, p]))));
  }, [isPlatformAdmin, ownIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('assistant_questions').select('*').order('created_at', { ascending: false }).limit(1000);
    if (tenantFilter) q = q.eq('tenant_id', tenantFilter);
    if (view === 'gaps') q = q.in('tier', ['handoff', 'error']).eq('resolved', false);
    if (view === 'flagged') q = q.eq('flagged', true);
    const { data } = await q;
    setRows((data ?? []) as AssistantQuestion[]);
    setLoading(false);
  }, [tenantFilter, view]);
  useEffect(() => { load(); }, [load]);

  async function patch(r: AssistantQuestion, fields: Partial<AssistantQuestion>) {
    const { error } = await supabase.from('assistant_questions').update(fields).eq('id', r.id);
    if (error) setError(error.message); else setRows(xs => xs.map(x => x.id === r.id ? { ...x, ...fields } : x));
  }

  async function remove(r: AssistantQuestion) {
    if (!window.confirm('Delete this question from the log?')) return;
    const { error } = await supabase.from('assistant_questions').delete().eq('id', r.id);
    if (error) setError(error.message); else setRows(xs => xs.filter(x => x.id !== r.id));
  }

  async function addToKnowledge() {
    if (!adding?.product_id) return;
    if (!answerDraft.trim()) { setError('Write the answer first.'); return; }
    setBusy(true); setError('');
    const { error } = await supabase.from('knowledge_items').insert({
      product_id: adding.product_id, kind: 'faq', title: adding.question.slice(0, 80), question: adding.question, content: answerDraft.trim(), audience: adding.team ? 'team' : 'all',
    });
    if (error) { setError(error.message); setBusy(false); return; }
    await patch(adding, { resolved: true });
    setAdding(null); setAnswerDraft(''); setBusy(false);
  }

  function exportCsv() {
    const lines = [['When', 'Client', 'Product', 'Audience', 'Language', 'Question', 'Answer', 'Result', 'Sources'],
      ...rows.map(r => [new Date(r.created_at).toLocaleString(), tenants.find(t => t.id === r.tenant_id)?.name ?? '', products[r.product_id ?? '']?.name ?? '',
        r.team ? 'Sales team' : 'Customer', r.language ?? '', r.question, r.answer ?? '', TIER_LABEL[r.tier].text, r.sources.map(s => s.label).join(' | ')])];
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,%EF%BB%BF${encodeURIComponent(lines.map(l => l.map(csvEscape).join(',')).join('\n'))}`;
    a.download = `brochar-questions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const filterClass = "border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-navy text-slate-700 bg-white transition";

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <p className="text-brand-cerise font-bold text-xs uppercase tracking-widest mb-1">Ask AI</p>
          <h1 className="text-3xl font-black text-brand-navy">Questions</h1>
          <p className="text-slate-400 text-sm mt-1">What customers and sales teams asked, and what could not be answered yet</p>
        </div>
        <button onClick={exportCsv} disabled={!rows.length} className="inline-flex items-center gap-2 bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-50 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {error && <div className="mb-4 p-3.5 bg-brand-cerise/5 border border-brand-cerise/20 rounded-xl text-brand-cerise text-sm font-medium">{error}</div>}

      <div className="flex flex-wrap gap-3 mb-6 bg-white rounded-2xl border border-slate-100 p-4 shadow-sm items-center">
        <select value={tenantFilter} onChange={e => setTenantFilter(e.target.value)} className={filterClass}>
          <option value="">All Clients</option>
          {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {([['gaps', 'Could not answer'], ['flagged', 'Flagged'], ['all', 'All']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition ${view === v ? 'bg-white text-brand-navy shadow-sm' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>
        <span className="text-xs text-slate-400 ml-auto">{rows.length} question{rows.length === 1 ? '' : 's'}</span>
      </div>

      {adding && (
        <div className="mb-6 bg-white rounded-2xl border-2 border-brand-navy/20 p-5 shadow-sm">
          <p className="text-xs font-bold text-brand-navy uppercase tracking-wide mb-1">Add to knowledge base</p>
          <p className="text-sm text-slate-700 font-semibold mb-2">{adding.question}</p>
          <textarea value={answerDraft} onChange={e => setAnswerDraft(e.target.value)} rows={3} placeholder="The answer the assistant should give from now on"
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-navy resize-none" />
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-slate-400">Saved as a {adding.team ? 'sales-team-only' : 'customer'} FAQ for {products[adding.product_id ?? '']?.name ?? 'this product'}.</span>
            <span className="flex-1" />
            <button onClick={() => { setAdding(null); setAnswerDraft(''); }} className="text-xs font-bold text-slate-400 px-3 py-2">Cancel</button>
            <button onClick={addToKnowledge} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-brand-navy text-white disabled:opacity-50"><Plus className="w-3.5 h-3.5" /> Save FAQ</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        {loading ? (
          <div className="p-5 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-brand-cream/50 rounded-xl animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="p-14 text-center text-slate-400">
            <Sparkles className="w-10 h-10 mx-auto mb-3 text-brand-olive/40" />
            <p className="text-sm font-medium">{view === 'gaps' ? 'Nothing unanswered. Good.' : 'No questions yet'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map(r => {
              const editable = canEdit(r.tenant_id);
              const t = TIER_LABEL[r.tier];
              return (
                <div key={r.id} className="px-5 py-4 flex gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.cls}`}>{t.text}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{r.team ? 'Sales team' : 'Customer'}{r.language ? ` · ${r.language}` : ''}</span>
                      <span className="text-[10px] text-slate-400">{new Date(r.created_at).toLocaleString()}</span>
                      <span className="text-[10px] text-slate-400">{products[r.product_id ?? '']?.name ?? ''}{isPlatformAdmin ? ` · ${tenants.find(x => x.id === r.tenant_id)?.name ?? ''}` : ''}</span>
                      {r.resolved && <span className="text-[10px] font-bold text-emerald-600 inline-flex items-center gap-0.5"><Check className="w-3 h-3" /> Added to knowledge</span>}
                    </div>
                    <p className="text-sm font-bold text-brand-navy">{r.question}</p>
                    {r.answer && r.tier !== 'error' && <p className="text-sm text-slate-600 mt-1">{r.answer}</p>}
                    {r.sources.length > 0 && <p className="text-[11px] text-slate-400 mt-1">From: {r.sources.map(s => s.label).join(', ')}</p>}
                  </div>
                  {editable && (
                    <div className="flex flex-col gap-1.5 items-end flex-shrink-0">
                      {r.product_id && !r.resolved && (
                        <button onClick={() => { setAdding(r); setAnswerDraft(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          className="inline-flex items-center gap-1 text-xs font-bold text-brand-navy bg-brand-cream/60 hover:bg-brand-cream px-2.5 py-1.5 rounded-lg"><Plus className="w-3.5 h-3.5" /> Add answer</button>
                      )}
                      <div className="flex gap-1">
                        <button onClick={() => patch(r, { flagged: !r.flagged })} title={r.flagged ? 'Unflag' : 'Flag as wrong or odd'} className={`w-8 h-8 rounded-lg flex items-center justify-center ${r.flagged ? 'bg-brand-cerise/10 text-brand-cerise' : 'text-slate-300 hover:text-brand-cerise'}`}><Flag className="w-4 h-4" /></button>
                        {!r.resolved && r.tier === 'handoff' && <button onClick={() => patch(r, { resolved: true })} title="Mark handled" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-emerald-600"><Check className="w-4 h-4" /></button>}
                        <button onClick={() => remove(r)} title="Delete" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-brand-cerise"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
