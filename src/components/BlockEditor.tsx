import { useState } from 'react';
import {
  HotspotBlock, BlockKind, BlockData, emptyBlockData, TEAM_DEFAULT_KINDS,
  TextData, ImageData, AudioData, VideoData,
  LinkData, GalleryData, SpecTableData, PdfData, ActionData, QuizData, PitchData,
} from '../lib/supabase';
import { uploadFile, fileExtension } from '../lib/storage';
import { fileTooLarge, MAX_IMAGE_BYTES, MAX_PDF_BYTES, MAX_AUDIO_BYTES, MAX_VIDEO_BYTES, youtubeId } from '../lib/validation';
import {
  Link2, Images, Table2, FileText, MessageCircle, HelpCircle, Lightbulb,
  ChevronUp, ChevronDown, Trash2, Plus, X, Upload, Users, UserCheck,
  AlignLeft, ImageIcon, Volume2, Video,
} from 'lucide-react';

const KINDS: { kind: BlockKind; label: string; icon: typeof Link2; help: string; group: 'basic' | 'more' | 'learn' }[] = [
  { kind: 'text', label: 'Text', icon: AlignLeft, help: 'A short description the customer reads.', group: 'basic' },
  { kind: 'image', label: 'Image', icon: ImageIcon, help: 'One picture with an optional caption.', group: 'basic' },
  { kind: 'audio', label: 'Audio', icon: Volume2, help: 'Read aloud by the phone, or an uploaded recording. Plays when the card opens.', group: 'basic' },
  { kind: 'video', label: 'Video', icon: Video, help: 'YouTube link or an uploaded file.', group: 'basic' },
  { kind: 'link', label: 'Web link', icon: Link2, help: 'Opens a web page inside the card, or in the browser.', group: 'more' },
  { kind: 'gallery', label: 'Image gallery', icon: Images, help: 'Several photos the customer can swipe through.', group: 'more' },
  { kind: 'spec_table', label: 'Spec table', icon: Table2, help: 'Rows of label and value, for specs or comparisons.', group: 'more' },
  { kind: 'pdf', label: 'PDF document', icon: FileText, help: 'A spec sheet or price list.', group: 'more' },
  { kind: 'action', label: 'Contact button', icon: MessageCircle, help: 'Call, WhatsApp or an enquiry form.', group: 'more' },
  { kind: 'pitch', label: 'Sales pitch', icon: Lightbulb, help: 'Pitch line, likely objection and how to answer it.', group: 'learn' },
  { kind: 'quiz', label: 'Quiz question', icon: HelpCircle, help: 'One multiple-choice question with instant feedback.', group: 'learn' },
];

const GROUPS: { id: 'basic' | 'more' | 'learn'; title: string }[] = [
  { id: 'basic', title: 'Content' },
  { id: 'more', title: 'More' },
  { id: 'learn', title: 'For the sales team (starts as team-only)' },
];

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Props = {
  hotspotId: string;
  blocks: HotspotBlock[];
  onChange: (blocks: HotspotBlock[]) => void;
  /** storage prefix for uploads, e.g. `${tenantId}/${productId}` */
  storageBase: string;
  onError: (msg: string) => void;
};

export default function BlockEditor({ hotspotId, blocks, onChange, storageBase, onError }: Props) {
  const [picking, setPicking] = useState(false);

  function add(kind: BlockKind) {
    onChange([...blocks, {
      id: newId(), hotspot_id: hotspotId, kind, position: blocks.length,
      audience: TEAM_DEFAULT_KINDS.includes(kind) ? 'team' : 'all',
      data: emptyBlockData(kind),
    }]);
    setPicking(false);
  }
  function update(id: string, data: BlockData) {
    onChange(blocks.map(b => b.id === id ? { ...b, data } : b));
  }
  function toggleAudience(id: string) {
    onChange(blocks.map(b => b.id === id ? { ...b, audience: b.audience === 'team' ? 'all' : 'team' } : b));
  }
  function remove(id: string) {
    onChange(blocks.filter(b => b.id !== id).map((b, i) => ({ ...b, position: i })));
  }
  function move(id: string, dir: -1 | 1) {
    const i = blocks.findIndex(b => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const copy = [...blocks];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy.map((b, k) => ({ ...b, position: k })));
  }

  return (
    <div>
      <label className="block text-xs font-bold text-brand-navy mb-1.5">Content</label>
      <p className="text-xs text-slate-400 mb-2">Shown on the card in this order. Use the audience switch on a block to show it to the sales team only (the Sales team QR).</p>

      <div className="space-y-2">
        {blocks.map((b, i) => {
          const meta = KINDS.find(k => k.kind === b.kind)!;
          const Icon = meta.icon;
          return (
            <div key={b.id} className="border-2 border-slate-100 rounded-xl p-3 bg-slate-50/50">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-3.5 h-3.5 text-brand-navy" />
                <span className="text-xs font-black text-brand-navy flex-1">{meta.label}</span>
                <button onClick={() => toggleAudience(b.id)} title={b.audience === 'team' ? 'Shown to the sales team only. Click to show customers too.' : 'Shown to customers and sales team. Click to make it sales-team only.'}
                  className={`inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-1.5 py-0.5 border transition ${
                    b.audience === 'team' ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-slate-500 bg-white border-slate-200 hover:border-slate-300'}`}>
                  {b.audience === 'team' ? <><UserCheck className="w-3 h-3" /> Sales team only</> : <><Users className="w-3 h-3" /> Everyone</>}
                </button>
                <button onClick={() => move(b.id, -1)} disabled={i === 0} className="text-slate-300 hover:text-brand-navy disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                <button onClick={() => move(b.id, 1)} disabled={i === blocks.length - 1} className="text-slate-300 hover:text-brand-navy disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                <button onClick={() => remove(b.id)} className="text-slate-300 hover:text-brand-cerise"><Trash2 className="w-4 h-4" /></button>
              </div>
              <BlockForm block={b} onChange={d => update(b.id, d)} storageBase={storageBase} onError={onError} />
            </div>
          );
        })}
      </div>

      {picking ? (
        <div className="mt-2 border-2 border-dashed border-slate-200 rounded-xl p-2 space-y-2">
          {GROUPS.map(g => (
            <div key={g.id}>
              <p className={`text-[10px] font-black uppercase tracking-wide px-2 pt-1 pb-0.5 ${g.id === 'learn' ? 'text-amber-700' : 'text-slate-400'}`}>{g.title}</p>
              <div className="grid grid-cols-2 gap-1">
                {KINDS.filter(k => k.group === g.id).map(k => (
                  <button key={k.kind} onClick={() => add(k.kind)} title={k.help}
                    className={`flex items-center gap-2 text-left px-2 py-2 rounded-lg transition ${g.id === 'learn' ? 'hover:bg-amber-50' : 'hover:bg-brand-cream/40'}`}>
                    <k.icon className={`w-4 h-4 flex-shrink-0 ${g.id === 'learn' ? 'text-amber-700' : 'text-brand-navy'}`} />
                    <span className="text-xs font-bold text-brand-navy">{k.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button onClick={() => setPicking(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setPicking(true)}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-brand-cerise hover:text-brand-cerise/80 transition">
          <Plus className="w-3.5 h-3.5" /> Add block
        </button>
      )}
    </div>
  );
}

const inp = "w-full border-2 border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-brand-navy transition bg-white";
const lbl = "block text-[11px] font-bold text-slate-500 mb-1";

function BlockForm({ block, onChange, storageBase, onError }: {
  block: HotspotBlock; onChange: (d: BlockData) => void; storageBase: string; onError: (m: string) => void;
}) {
  switch (block.kind) {
    case 'text': {
      const d = block.data as TextData;
      return <textarea value={d.text} onChange={e => onChange({ text: e.target.value })} rows={3} placeholder="What the customer should know about this feature" className={`${inp} resize-none`} />;
    }
    case 'image': {
      const d = block.data as ImageData;
      return (
        <div className="space-y-2">
          {d.url && <img src={d.url} alt="" className="w-full h-28 object-cover rounded-lg border border-slate-200" />}
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-cerise cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> {d.url ? 'Replace image' : 'Upload image'}
              <input type="file" accept="image/*" className="hidden" onChange={async e => {
                const f = e.target.files?.[0]; if (!f) return;
                const problem = fileTooLarge(f, MAX_IMAGE_BYTES); if (problem) { onError(problem); return; }
                try { onChange({ ...d, url: await uploadFile(`${storageBase}/hotspot-images/${block.id}.${fileExtension(f, 'jpg')}`, f) }); }
                catch (err) { onError(err instanceof Error ? err.message : 'Upload failed.'); }
              }} />
            </label>
            {d.url && <button onClick={() => onChange({ ...d, url: '' })} className="text-xs text-slate-400 hover:text-brand-cerise">Remove</button>}
          </div>
          <input value={d.caption} onChange={e => onChange({ ...d, caption: e.target.value })} placeholder="Caption (optional)" className={inp} />
        </div>
      );
    }
    case 'audio': {
      const d = block.data as AudioData;
      return (
        <div className="space-y-2">
          <div className="flex gap-3 text-xs">
            {(['tts', 'upload'] as const).map(m => (
              <label key={m} className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={d.mode === m} onChange={() => onChange({ ...d, mode: m })} className="accent-brand-cerise" />
                <span className="font-semibold text-slate-700">{m === 'tts' ? 'Read aloud by the phone' : 'Uploaded recording'}</span>
              </label>
            ))}
          </div>
          {d.mode === 'tts' ? (
            <textarea value={d.text} onChange={e => onChange({ ...d, text: e.target.value })} rows={3} placeholder="Text to read aloud. Leave blank to read the hotspot's text block." className={`${inp} resize-none`} />
          ) : (
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-cerise cursor-pointer">
                <Upload className="w-3.5 h-3.5" /> {d.url ? 'Replace audio' : 'Upload MP3'}
                <input type="file" accept="audio/*" className="hidden" onChange={async e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const problem = fileTooLarge(f, MAX_AUDIO_BYTES); if (problem) { onError(problem); return; }
                  try { onChange({ ...d, url: await uploadFile(`${storageBase}/audio/${block.id}.${fileExtension(f, 'mp3')}`, f) }); }
                  catch (err) { onError(err instanceof Error ? err.message : 'Upload failed.'); }
                }} />
              </label>
              {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-slate-400 hover:underline">Current file</a>}
            </div>
          )}
          <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={d.autoplay} onChange={e => onChange({ ...d, autoplay: e.target.checked })} className="accent-brand-cerise" />
            <span className="font-semibold text-slate-700">Play when the card opens</span>
          </label>
        </div>
      );
    }
    case 'video': {
      const d = block.data as VideoData;
      return (
        <div className="space-y-2">
          <div className="flex gap-3 text-xs">
            {(['youtube', 'upload'] as const).map(m => (
              <label key={m} className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={d.mode === m} onChange={() => onChange({ ...d, mode: m, ref: '' })} className="accent-brand-cerise" />
                <span className="font-semibold text-slate-700">{m === 'youtube' ? 'YouTube' : 'Uploaded file'}</span>
              </label>
            ))}
          </div>
          {d.mode === 'youtube' ? (
            <div>
              <input value={d.ref} onChange={e => onChange({ ...d, ref: e.target.value })} placeholder="https://youtube.com/watch?v=..." className={inp} />
              {d.ref && !youtubeId(d.ref) && <p className="text-[11px] text-brand-cerise mt-1">That does not look like a YouTube link.</p>}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-cerise cursor-pointer">
                <Upload className="w-3.5 h-3.5" /> {d.ref ? 'Replace video' : 'Upload MP4'}
                <input type="file" accept="video/*" className="hidden" onChange={async e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const problem = fileTooLarge(f, MAX_VIDEO_BYTES); if (problem) { onError(problem); return; }
                  try { onChange({ ...d, ref: await uploadFile(`${storageBase}/video/${block.id}.${fileExtension(f, 'mp4')}`, f) }); }
                  catch (err) { onError(err instanceof Error ? err.message : 'Upload failed.'); }
                }} />
              </label>
              {d.ref && <a href={d.ref} target="_blank" rel="noopener noreferrer" className="text-[11px] text-slate-400 hover:underline">Current file</a>}
            </div>
          )}
          <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={d.autoplay} onChange={e => onChange({ ...d, autoplay: e.target.checked })} className="accent-brand-cerise" />
            <span className="font-semibold text-slate-700">Play when the card opens</span>
          </label>
        </div>
      );
    }
    case 'link': {
      const d = block.data as LinkData;
      return (
        <div className="space-y-2">
          <div><label className={lbl}>Web address</label>
            <input value={d.url} onChange={e => onChange({ ...d, url: e.target.value })} placeholder="https://..." className={inp} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Button text</label>
              <input value={d.label} onChange={e => onChange({ ...d, label: e.target.value })} className={inp} /></div>
            <div><label className={lbl}>Opens</label>
              <select value={d.open_mode} onChange={e => onChange({ ...d, open_mode: e.target.value as LinkData['open_mode'] })} className={inp}>
                <option value="overlay">Inside the card</option>
                <option value="newtab">In the browser</option>
              </select></div>
          </div>
          <p className="text-[11px] text-slate-400">Some sites refuse to open inside another page. The card always offers "Open in browser" as a fallback.</p>
        </div>
      );
    }
    case 'gallery': {
      const d = block.data as GalleryData;
      return <GalleryForm d={d} onChange={onChange} storageBase={storageBase} blockId={block.id} onError={onError} />;
    }
    case 'spec_table': {
      const d = block.data as SpecTableData;
      const setRow = (i: number, key: 'label' | 'value', v: string) =>
        onChange({ ...d, rows: d.rows.map((r, k) => k === i ? { ...r, [key]: v } : r) });
      return (
        <div className="space-y-2">
          <div><label className={lbl}>Title (optional)</label>
            <input value={d.title} onChange={e => onChange({ ...d, title: e.target.value })} placeholder="e.g. Engine specs" className={inp} /></div>
          <div className="space-y-1">
            {d.rows.map((r, i) => (
              <div key={i} className="flex gap-1">
                <input value={r.label} onChange={e => setRow(i, 'label', e.target.value)} placeholder="Label" className={inp} />
                <input value={r.value} onChange={e => setRow(i, 'value', e.target.value)} placeholder="Value" className={inp} />
                <button onClick={() => onChange({ ...d, rows: d.rows.filter((_, k) => k !== i) })} className="text-slate-300 hover:text-brand-cerise flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          <button onClick={() => onChange({ ...d, rows: [...d.rows, { label: '', value: '' }] })}
            className="text-[11px] font-bold text-brand-cerise inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add row</button>
        </div>
      );
    }
    case 'pdf': {
      const d = block.data as PdfData;
      return (
        <div className="space-y-2">
          <div><label className={lbl}>Button text</label>
            <input value={d.label} onChange={e => onChange({ ...d, label: e.target.value })} className={inp} /></div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-cerise cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> {d.url ? 'Replace PDF' : 'Upload PDF'}
              <input type="file" accept="application/pdf" className="hidden" onChange={async e => {
                const f = e.target.files?.[0]; if (!f) return;
                const problem = fileTooLarge(f, MAX_PDF_BYTES); if (problem) { onError(problem); return; }
                try { onChange({ ...d, url: await uploadFile(`${storageBase}/documents/${block.id}.pdf`, f, 'application/pdf') }); }
                catch (err) { onError(err instanceof Error ? err.message : 'Upload failed.'); }
              }} />
            </label>
            {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-slate-400 hover:underline truncate">Current file</a>}
          </div>
          <div><label className={lbl}>Or paste a web address</label>
            <input value={d.url} onChange={e => onChange({ ...d, url: e.target.value })} placeholder="https://...pdf" className={inp} /></div>
        </div>
      );
    }
    case 'action': {
      const d = block.data as ActionData;
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Type</label>
              <select value={d.type} onChange={e => onChange({ ...d, type: e.target.value as ActionData['type'] })} className={inp}>
                <option value="whatsapp">WhatsApp</option>
                <option value="call">Phone call</option>
                <option value="enquiry">Enquiry form</option>
              </select></div>
            <div><label className={lbl}>Button text</label>
              <input value={d.label} onChange={e => onChange({ ...d, label: e.target.value })}
                placeholder={d.type === 'call' ? 'Call us' : d.type === 'whatsapp' ? 'Chat on WhatsApp' : 'Request a call back'} className={inp} /></div>
          </div>
          {d.type !== 'enquiry' && (
            <div><label className={lbl}>Number (leave blank to use the client's default)</label>
              <input value={d.phone} onChange={e => onChange({ ...d, phone: e.target.value })} placeholder="+91 98765 43210" className={inp} /></div>
          )}
          {d.type === 'whatsapp' && (
            <div><label className={lbl}>Pre-filled message</label>
              <input value={d.message} onChange={e => onChange({ ...d, message: e.target.value })} placeholder="Hi, I'd like to know more about…" className={inp} /></div>
          )}
          {d.type === 'enquiry' && (
            <p className="text-[11px] text-slate-400">The customer enters name and mobile. Enquiries appear under Leads in the admin.</p>
          )}
        </div>
      );
    }
    case 'quiz': {
      const d = block.data as QuizData;
      return (
        <div className="space-y-2">
          <div><label className={lbl}>Question</label>
            <textarea value={d.question} onChange={e => onChange({ ...d, question: e.target.value })} rows={2} className={`${inp} resize-none`} /></div>
          <div className="space-y-1">
            <label className={lbl}>Options (tick the correct one)</label>
            {d.options.map((o, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input type="radio" checked={d.correct === i} onChange={() => onChange({ ...d, correct: i })} className="accent-brand-cerise" />
                <input value={o} onChange={e => onChange({ ...d, options: d.options.map((x, k) => k === i ? e.target.value : x) })} className={inp} placeholder={`Option ${i + 1}`} />
                {d.options.length > 2 && (
                  <button onClick={() => onChange({ ...d, options: d.options.filter((_, k) => k !== i), correct: d.correct >= i && d.correct > 0 ? d.correct - 1 : d.correct })}
                    className="text-slate-300 hover:text-brand-cerise"><X className="w-3.5 h-3.5" /></button>
                )}
              </div>
            ))}
            {d.options.length < 5 && (
              <button onClick={() => onChange({ ...d, options: [...d.options, ''] })}
                className="text-[11px] font-bold text-brand-cerise inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add option</button>
            )}
          </div>
          <div><label className={lbl}>Explanation shown after answering (optional)</label>
            <input value={d.explanation} onChange={e => onChange({ ...d, explanation: e.target.value })} className={inp} /></div>
        </div>
      );
    }
    case 'pitch': {
      const d = block.data as PitchData;
      return (
        <div className="space-y-2">
          <div><label className={lbl}>Pitch line (what to say to the customer)</label>
            <textarea value={d.pitch} onChange={e => onChange({ ...d, pitch: e.target.value })} rows={2} className={`${inp} resize-none`} /></div>
          <div><label className={lbl}>Likely objection</label>
            <input value={d.objection} onChange={e => onChange({ ...d, objection: e.target.value })} className={inp} /></div>
          <div><label className={lbl}>How to answer it</label>
            <textarea value={d.response} onChange={e => onChange({ ...d, response: e.target.value })} rows={2} className={`${inp} resize-none`} /></div>
        </div>
      );
    }
  }
}

function GalleryForm({ d, onChange, storageBase, blockId, onError }: {
  d: GalleryData; onChange: (d: BlockData) => void; storageBase: string; blockId: string; onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function addFiles(files: File[]) {
    setBusy(true);
    const urls: string[] = [];
    try {
      for (const f of files) {
        const problem = fileTooLarge(f, MAX_IMAGE_BYTES); if (problem) { onError(problem); continue; }
        urls.push(await uploadFile(`${storageBase}/gallery/${blockId}/${newId()}.${fileExtension(f, 'jpg')}`, f));
      }
      onChange({ images: [...d.images, ...urls] });
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed.');
    } finally { setBusy(false); }
  }
  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        {d.images.map((u, i) => (
          <div key={u} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
            <img src={u} alt="" className="w-full h-full object-cover" />
            <button onClick={() => onChange({ images: d.images.filter((_, k) => k !== i) })}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brand-cerise text-white flex items-center justify-center opacity-0 group-hover:opacity-100">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
      <label className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-cerise cursor-pointer">
        <Upload className="w-3.5 h-3.5" /> {busy ? 'Uploading…' : 'Add photos'}
        <input type="file" accept="image/*" multiple className="hidden" disabled={busy}
          onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) addFiles(fs); e.target.value = ''; }} />
      </label>
    </div>
  );
}
