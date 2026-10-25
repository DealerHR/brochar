import { useEffect, useState } from 'react';
import { supabase, KnowledgeItem } from '../lib/supabase';
import { loadScript } from '../lib/mindar';
import { uploadFile } from '../lib/storage';
import { fileTooLarge, MAX_PDF_BYTES } from '../lib/validation';
import { Sparkles, Plus, Trash2, Upload, FileText, HelpCircle, StickyNote, Users, UserCheck, Pencil, Check, X } from 'lucide-react';

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

type Draft = { kind: 'faq' | 'note'; title: string; question: string; content: string; audience: 'all' | 'team' };
const emptyDraft = (kind: 'faq' | 'note'): Draft => ({ kind, title: '', question: '', content: '', audience: 'all' });

/**
 * Knowledge the Ask AI may answer from, beyond the hotspots: FAQs, notes and
 * uploaded PDFs (text is extracted on upload). Each item has the same
 * Everyone / Sales team only switch as content blocks.
 */
export default function KnowledgePanel({ productId, storageBase, editable, onError }: {
  productId: string; storageBase: string; editable: boolean; onError: (m: string) => void;
}) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState('');

  useEffect(() => { load(); }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const { data } = await supabase.from('knowledge_items').select('*').eq('product_id', productId).order('position').order('created_at');
    setItems((data ?? []) as KnowledgeItem[]);
  }

  async function saveDraft() {
    if (!draft) return;
    const title = draft.title.trim() || (draft.kind === 'faq' ? draft.question.trim().slice(0, 80) : '');
    if (!title) { onError('Give it a title.'); return; }
    if (draft.kind === 'faq' && !draft.question.trim()) { onError('Enter the question.'); return; }
    if (!draft.content.trim()) { onError(draft.kind === 'faq' ? 'Enter the answer.' : 'Enter the note.'); return; }
    setBusy(true);
    const { error } = await supabase.from('knowledge_items').insert({
      product_id: productId, kind: draft.kind, title, question: draft.kind === 'faq' ? draft.question.trim() : null,
      content: draft.content.trim(), audience: draft.audience, position: items.length,
    });
    setBusy(false);
    if (error) { onError(error.message); return; }
    setDraft(null);
    await load();
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    const { error } = await supabase.from('knowledge_items').update({
      title: editing.title.trim(), question: editing.question?.trim() || null, content: editing.content.trim(), audience: editing.audience,
    }).eq('id', editing.id);
    setBusy(false);
    if (error) { onError(error.message); return; }
    setEditing(null);
    await load();
  }

  async function remove(it: KnowledgeItem) {
    if (!window.confirm(`Remove "${it.title}" from the knowledge base?`)) return;
    const { error } = await supabase.from('knowledge_items').delete().eq('id', it.id);
    if (error) { onError(error.message); return; }
    await load();
  }

  async function toggleAudience(it: KnowledgeItem) {
    const audience = it.audience === 'team' ? 'all' : 'team';
    const { error } = await supabase.from('knowledge_items').update({ audience }).eq('id', it.id);
    if (error) onError(error.message); else setItems(xs => xs.map(x => x.id === it.id ? { ...x, audience } : x));
  }

  async function uploadPdf(file: File) {
    const problem = fileTooLarge(file, MAX_PDF_BYTES); if (problem) { onError(problem); return; }
    setUploading('Reading the PDF…');
    try {
      await loadScript(PDFJS_CDN + 'pdf.min.js');
      const pdfjs = window.pdfjsLib;
      if (!pdfjs) throw new Error('PDF reader did not load.');
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_CDN + 'pdf.worker.min.js';
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const parts: string[] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        setUploading(`Reading page ${n} of ${pdf.numPages}…`);
        const page = await pdf.getPage(n);
        const tc = await page.getTextContent();
        const text = (tc.items as { str?: string }[]).map(i => i.str ?? '').join(' ').replace(/\s+/g, ' ').trim();
        if (text) parts.push(`(page ${n}) ${text}`);
      }
      const content = parts.join('\n').slice(0, 60000);
      if (content.length < 50) throw new Error('No readable text found in this PDF. If it is a scanned image, export it with text first.');
      setUploading('Saving…');
      const id = crypto.randomUUID();
      const source_url = await uploadFile(`${storageBase}/knowledge/${id}.pdf`, file, 'application/pdf');
      const { error } = await supabase.from('knowledge_items').insert({
        id, product_id: productId, kind: 'document', title: file.name.replace(/\.pdf$/i, '').slice(0, 200), content, audience: 'all', source_url, position: items.length,
      });
      if (error) throw new Error(error.message);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed.');
    } finally { setUploading(''); }
  }

  const inp = "w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-navy transition bg-white";
  const Icon = ({ kind }: { kind: KnowledgeItem['kind'] }) => kind === 'faq' ? <HelpCircle className="w-4 h-4 text-brand-navy" /> : kind === 'document' ? <FileText className="w-4 h-4 text-brand-navy" /> : <StickyNote className="w-4 h-4 text-brand-navy" />;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-start gap-3 mb-1">
        <Sparkles className="w-5 h-5 text-brand-cerise mt-0.5" />
        <div className="flex-1">
          <h2 className="text-base font-black text-brand-navy">Ask AI knowledge</h2>
          <p className="text-xs text-slate-400">What the assistant may answer from, beyond the hotspots. Add the questions customers actually ask. It never answers prices, offers or stock.</p>
        </div>
      </div>

      {editable && (
        <div className="flex flex-wrap gap-2 my-4">
          <button onClick={() => setDraft(emptyDraft('faq'))} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-brand-navy text-white"><Plus className="w-3.5 h-3.5" /> FAQ</button>
          <button onClick={() => setDraft(emptyDraft('note'))} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-white border-2 border-slate-200 text-brand-navy hover:border-brand-navy"><Plus className="w-3.5 h-3.5" /> Note</button>
          <label className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-white border-2 border-slate-200 text-brand-navy hover:border-brand-navy cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> {uploading || 'Spec sheet PDF'}
            <input type="file" accept="application/pdf" className="hidden" disabled={!!uploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadPdf(f); e.target.value = ''; }} />
          </label>
        </div>
      )}

      {draft && (
        <div className="border-2 border-brand-navy/20 rounded-xl p-3 mb-3 space-y-2 bg-brand-cream/20">
          {draft.kind === 'faq' ? (
            <>
              <input value={draft.question} onChange={e => setDraft({ ...draft, question: e.target.value })} placeholder="Question customers ask, e.g. Does it have a sunroof?" className={inp} />
              <textarea value={draft.content} onChange={e => setDraft({ ...draft, content: e.target.value })} rows={3} placeholder="The answer, as the dealer would say it" className={`${inp} resize-none`} />
            </>
          ) : (
            <>
              <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Title, e.g. Warranty" className={inp} />
              <textarea value={draft.content} onChange={e => setDraft({ ...draft, content: e.target.value })} rows={4} placeholder="Facts the assistant may use" className={`${inp} resize-none`} />
            </>
          )}
          <div className="flex items-center gap-2">
            <AudienceToggle value={draft.audience} onChange={a => setDraft({ ...draft, audience: a })} />
            <span className="flex-1" />
            <button onClick={() => setDraft(null)} className="text-xs font-bold text-slate-400 px-3 py-2">Cancel</button>
            <button onClick={saveDraft} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-brand-navy text-white disabled:opacity-50"><Check className="w-3.5 h-3.5" /> Save</button>
          </div>
        </div>
      )}

      {items.length === 0 && !draft ? (
        <p className="text-sm text-slate-400 py-2">No extra knowledge yet. The assistant answers from the hotspots only.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map(it => editing?.id === it.id ? (
            <div key={it.id} className="py-3 space-y-2">
              {it.kind === 'faq'
                ? <input value={editing.question ?? ''} onChange={e => setEditing({ ...editing, question: e.target.value, title: e.target.value.slice(0, 80) })} className={inp} />
                : <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className={inp} />}
              <textarea value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} rows={it.kind === 'document' ? 8 : 3} className={`${inp} resize-none font-mono text-xs`} />
              <div className="flex items-center gap-2">
                <AudienceToggle value={editing.audience} onChange={a => setEditing({ ...editing, audience: a })} />
                <span className="flex-1" />
                <button onClick={() => setEditing(null)} className="text-xs font-bold text-slate-400 px-3 py-2">Cancel</button>
                <button onClick={saveEdit} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-brand-navy text-white disabled:opacity-50"><Check className="w-3.5 h-3.5" /> Save</button>
              </div>
            </div>
          ) : (
            <div key={it.id} className="flex items-start gap-3 py-3">
              <span className="mt-0.5"><Icon kind={it.kind} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-brand-navy">{it.kind === 'faq' ? it.question : it.title}</p>
                <p className="text-xs text-slate-500 line-clamp-2">{it.kind === 'document' ? `${Math.round(it.content.length / 1000)}k characters of text` : it.content}</p>
                {it.source_url && <a href={it.source_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-slate-400 hover:underline">Open PDF</a>}
              </div>
              {editable ? (
                <>
                  <button onClick={() => toggleAudience(it)} title="Who can get answers from this" className={`inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-1.5 py-0.5 border ${it.audience === 'team' ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-slate-500 bg-white border-slate-200'}`}>
                    {it.audience === 'team' ? <><UserCheck className="w-3 h-3" /> Team only</> : <><Users className="w-3 h-3" /> Everyone</>}
                  </button>
                  <button onClick={() => setEditing(it)} className="text-slate-300 hover:text-brand-navy"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(it)} className="text-slate-300 hover:text-brand-cerise"><Trash2 className="w-4 h-4" /></button>
                </>
              ) : (
                <span className="text-[10px] font-bold text-slate-400">{it.audience === 'team' ? 'Team only' : 'Everyone'}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AudienceToggle({ value, onChange }: { value: 'all' | 'team'; onChange: (a: 'all' | 'team') => void }) {
  return (
    <button type="button" onClick={() => onChange(value === 'team' ? 'all' : 'team')}
      className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-1 border transition ${value === 'team' ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-slate-500 bg-white border-slate-200'}`}>
      {value === 'team' ? <><UserCheck className="w-3 h-3" /> Sales team only</> : <><Users className="w-3 h-3" /> Everyone</>}
      <X className="hidden" />
    </button>
  );
}
