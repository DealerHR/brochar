import { useEffect, useRef, useState } from 'react';
import {
  HotspotBlock, LinkData, GalleryData, SpecTableData, PdfData, ActionData, QuizData, PitchData, Tenant,
} from '../lib/supabase';
import { isHttpUrl } from '../lib/validation';
import {
  ExternalLink, FileText, Phone, MessageCircle, Send, X, CheckCircle2, XCircle, Lightbulb, HelpCircle, ChevronLeft, ChevronRight,
} from 'lucide-react';

export type LeadSubmit = (lead: { name: string; phone: string; message: string; hotspotId: string }) => Promise<void>;

type Props = {
  block: HotspotBlock;
  tenant: Tenant;
  brandColor: string;
  learnMode: boolean;
  onLinkOpen: (url: string, label: string, mode: 'overlay' | 'newtab') => void;
  onLead: LeadSubmit;
  onMedia?: () => void;
};

/** Renders one hotspot content block inside the AR card. */
export default function BlockView({ block, tenant, brandColor, learnMode, onLinkOpen, onLead, onMedia }: Props) {
  switch (block.kind) {
    case 'link': {
      const d = block.data as LinkData;
      if (!isHttpUrl(d.url)) return null;
      return (
        <button onClick={() => { onLinkOpen(d.url, d.label || 'Link', d.open_mode); onMedia?.(); }}
          className="w-full flex items-center gap-2 text-left text-sm font-semibold px-4 py-3 rounded-xl border-2 border-slate-100 hover:border-slate-200 text-slate-800 transition active:scale-[0.99]">
          <ExternalLink className="w-4 h-4 flex-shrink-0" style={{ color: brandColor }} />
          <span className="flex-1 truncate">{d.label || d.url}</span>
        </button>
      );
    }
    case 'gallery': {
      const d = block.data as GalleryData;
      const imgs = d.images.filter(isHttpUrl);
      if (!imgs.length) return null;
      return <Gallery images={imgs} brandColor={brandColor} />;
    }
    case 'spec_table': {
      const d = block.data as SpecTableData;
      const rows = d.rows.filter(r => r.label.trim() || r.value.trim());
      if (!rows.length) return null;
      return (
        <div className="rounded-xl border border-slate-100 overflow-hidden">
          {d.title && <div className="px-4 py-2 text-xs font-black uppercase tracking-wide text-white" style={{ backgroundColor: brandColor }}>{d.title}</div>}
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={i % 2 ? 'bg-slate-50' : 'bg-white'}>
                  <td className="px-4 py-2 text-slate-500 font-medium w-2/5 align-top">{r.label}</td>
                  <td className="px-4 py-2 text-slate-900 font-semibold">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'pdf': {
      const d = block.data as PdfData;
      if (!isHttpUrl(d.url)) return null;
      return (
        <a href={d.url} target="_blank" rel="noopener noreferrer" onClick={() => onMedia?.()}
          className="w-full flex items-center gap-2 text-sm font-semibold px-4 py-3 rounded-xl border-2 border-slate-100 hover:border-slate-200 text-slate-800 transition">
          <FileText className="w-4 h-4 flex-shrink-0" style={{ color: brandColor }} />
          <span className="flex-1 truncate">{d.label || 'View document'}</span>
          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
        </a>
      );
    }
    case 'action': {
      const d = block.data as ActionData;
      return <ActionBlock d={d} tenant={tenant} brandColor={brandColor} hotspotId={block.hotspot_id} onLead={onLead} onMedia={onMedia} />;
    }
    case 'quiz': {
      if (!learnMode) return null;
      return <QuizBlock d={block.data as QuizData} brandColor={brandColor} />;
    }
    case 'pitch': {
      if (!learnMode) return null;
      const d = block.data as PitchData;
      if (!d.pitch && !d.objection && !d.response) return null;
      return (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 text-sm space-y-2">
          <div className="flex items-center gap-1.5 text-amber-800 font-black text-xs uppercase tracking-wide"><Lightbulb className="w-3.5 h-3.5" /> Sales pitch</div>
          {d.pitch && <p className="text-slate-800 leading-relaxed">“{d.pitch}”</p>}
          {d.objection && (
            <div className="pt-2 border-t border-amber-200">
              <p className="text-xs font-bold text-amber-800 mb-0.5">If the customer says</p>
              <p className="text-slate-700 italic">“{d.objection}”</p>
            </div>
          )}
          {d.response && (
            <div>
              <p className="text-xs font-bold text-amber-800 mb-0.5">You can answer</p>
              <p className="text-slate-800 leading-relaxed">{d.response}</p>
            </div>
          )}
        </div>
      );
    }
  }
}

function Gallery({ images, brandColor }: { images: string[]; brandColor: string }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  function go(n: number) {
    const next = Math.max(0, Math.min(images.length - 1, n));
    setI(next);
    ref.current?.scrollTo({ left: next * (ref.current.clientWidth), behavior: 'smooth' });
  }
  return (
    <div className="relative">
      <div ref={ref} className="flex overflow-x-auto snap-x snap-mandatory rounded-xl border border-slate-100 bg-slate-100 scrollbar-none"
        style={{ scrollbarWidth: 'none' }}
        onScroll={e => { const el = e.currentTarget; const idx = Math.round(el.scrollLeft / el.clientWidth); if (idx !== i) setI(idx); }}>
        {images.map(u => (
          <img key={u} src={u} alt="" className="w-full flex-shrink-0 snap-center object-contain max-h-56" />
        ))}
      </div>
      {images.length > 1 && (
        <>
          <button onClick={() => go(i - 1)} className="absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => go(i + 1)} className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
          <div className="flex justify-center gap-1 mt-2">
            {images.map((_, k) => <span key={k} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: k === i ? brandColor : '#cbd5e1' }} />)}
          </div>
        </>
      )}
    </div>
  );
}

function ActionBlock({ d, tenant, brandColor, hotspotId, onLead, onMedia }: {
  d: ActionData; tenant: Tenant; brandColor: string; hotspotId: string; onLead: LeadSubmit; onMedia?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const number = (d.phone || (d.type === 'whatsapp' ? tenant.whatsapp_number : tenant.phone_number) || '').replace(/[^0-9+]/g, '');
  const btn = "w-full inline-flex items-center justify-center gap-2 text-sm font-bold px-4 py-3 rounded-xl text-white transition active:scale-[0.99]";

  if (d.type === 'call') {
    if (!number) return null;
    return <a href={`tel:${number}`} onClick={() => onMedia?.()} className={btn} style={{ backgroundColor: brandColor }}><Phone className="w-4 h-4" /> {d.label || 'Call us'}</a>;
  }
  if (d.type === 'whatsapp') {
    if (!number) return null;
    const wa = `https://wa.me/${number.replace('+', '')}${d.message ? `?text=${encodeURIComponent(d.message)}` : ''}`;
    return <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => onMedia?.()} className={btn} style={{ backgroundColor: '#25D366' }}><MessageCircle className="w-4 h-4" /> {d.label || 'Chat on WhatsApp'}</a>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (name.trim().length < 1) { setError('Please enter your name.'); return; }
    if (phone.replace(/[^0-9]/g, '').length < 6) { setError('Please enter a valid mobile number.'); return; }
    setBusy(true);
    try { await onLead({ name: name.trim(), phone: phone.trim(), message: message.trim(), hotspotId }); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not send. Please try again.'); }
    finally { setBusy(false); }
  }

  if (done) return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
      <CheckCircle2 className="w-4 h-4" /> Thanks, {name.split(' ')[0]}. We will call you back soon.
    </div>
  );
  if (!open) return <button onClick={() => setOpen(true)} className={btn} style={{ backgroundColor: brandColor }}><Send className="w-4 h-4" /> {d.label || 'Request a call back'}</button>;

  const input = "w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition";
  return (
    <form onSubmit={submit} className="rounded-xl border-2 border-slate-100 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-800">{d.label || 'Request a call back'}</span>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-400"><X className="w-4 h-4" /></button>
      </div>
      {error && <p className="text-xs text-brand-cerise font-medium">{error}</p>}
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className={input} style={{ borderColor: name ? brandColor : undefined }} autoComplete="name" />
      <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Mobile number" inputMode="tel" className={input} autoComplete="tel" />
      <input value={message} onChange={e => setMessage(e.target.value)} placeholder="Anything you want to ask? (optional)" className={input} />
      <button type="submit" disabled={busy} className={btn} style={{ backgroundColor: brandColor }}>{busy ? 'Sending…' : 'Send'}</button>
      <p className="text-[11px] text-slate-400 text-center">Your details go only to {tenant.name}.</p>
    </form>
  );
}

function QuizBlock({ d, brandColor }: { d: QuizData; brandColor: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { setPicked(null); }, [d.question]);
  const options = d.options.map((o, i) => ({ o, i })).filter(x => x.o.trim());
  if (!d.question.trim() || options.length < 2) return null;
  const correct = picked === d.correct;
  return (
    <div className="rounded-xl border-2 border-slate-100 p-4 text-sm">
      <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide mb-2" style={{ color: brandColor }}><HelpCircle className="w-3.5 h-3.5" /> Quick check</div>
      <p className="font-semibold text-slate-900 mb-3">{d.question}</p>
      <div className="space-y-1.5">
        {options.map(({ o, i }) => {
          const state = picked === null ? 'idle' : i === d.correct ? 'right' : i === picked ? 'wrong' : 'dim';
          return (
            <button key={i} disabled={picked !== null} onClick={() => setPicked(i)}
              className={`w-full text-left px-3 py-2.5 rounded-lg border-2 transition flex items-center gap-2 ${
                state === 'right' ? 'border-emerald-400 bg-emerald-50 text-emerald-900' :
                state === 'wrong' ? 'border-brand-cerise bg-brand-cerise/5 text-slate-800' :
                state === 'dim' ? 'border-slate-100 text-slate-400' : 'border-slate-200 text-slate-800 active:bg-slate-50'}`}>
              {state === 'right' && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
              {state === 'wrong' && <XCircle className="w-4 h-4 text-brand-cerise flex-shrink-0" />}
              <span>{o}</span>
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className={`mt-3 text-sm rounded-lg px-3 py-2 ${correct ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
          <span className="font-bold">{correct ? 'Correct.' : 'Not quite.'}</span>{' '}
          {d.explanation || (correct ? 'Well remembered.' : `The right answer is "${d.options[d.correct]}".`)}
          <button onClick={() => setPicked(null)} className="block mt-1 text-xs font-bold underline">Try again</button>
        </div>
      )}
    </div>
  );
}
