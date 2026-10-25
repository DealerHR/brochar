import { useEffect, useRef, useState } from 'react';
import { Tenant } from '../lib/supabase';
import { askQuestion, AskResult, listenOnce, recognitionLocale, speak, speechRecognitionAvailable, stopSpeaking } from '../lib/ask';
import { Mic, Keyboard, X, Send, MessageCircle, Phone, Volume2, VolumeX, RotateCcw, Sparkles, BookOpen } from 'lucide-react';

type Props = {
  tenant: Tenant;
  productSlug: string;
  team: boolean;
  sessionId?: string;
  source?: string;
  brandColor: string;
  onClose: () => void;
  onSourceTap?: (hotspotId: string) => void;
};

type Stage = 'idle' | 'listening' | 'thinking' | 'answer' | 'error';

/**
 * Ask AI: one question, one answer. Opens listening straight away when the
 * phone supports speech recognition; otherwise opens the keyboard.
 */
export default function AskCard({ tenant, productSlug, team, sessionId, source, brandColor, onClose, onSourceTap }: Props) {
  const canListen = speechRecognitionAvailable();
  const [stage, setStage] = useState<Stage>('idle');
  const [typing, setTyping] = useState(!canListen);
  const [partial, setPartial] = useState('');
  const [question, setQuestion] = useState('');
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const locale = recognitionLocale(tenant.assistant_language ?? 'auto');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { mutedRef.current = muted; }, [muted]);

  // Start listening as soon as the card opens (the tap that opened it is the user gesture).
  useEffect(() => {
    if (canListen && !typing) startListening();
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (typing) inputRef.current?.focus(); }, [typing]);

  async function startListening() {
    setError(''); setResult(null); setPartial(''); setQuestion('');
    setStage('listening');
    try {
      const text = await listenOnce(locale, setPartial);
      setQuestion(text);
      await submit(text);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'error';
      if (reason === 'not-allowed' || reason === 'service-not-allowed') {
        setError('Microphone access is off. Type your question instead.');
      } else if (reason === 'no-speech' || reason === 'aborted') {
        setError('I did not catch that. Tap the mic and try again, or type.');
      } else {
        setError('Could not use the microphone here. Type your question instead.');
      }
      setStage('idle');
      if (reason === 'not-allowed' || reason === 'unsupported') setTyping(true);
    }
  }

  async function submit(text: string) {
    const q = text.trim();
    if (q.length < 2) return;
    setQuestion(q); setError(''); setStage('thinking');
    try {
      const r = await askQuestion({ tenant_slug: tenant.slug, product_slug: productSlug, team, question: q, session_id: sessionId, source });
      setResult(r);
      setStage('answer');
      if (!mutedRef.current) speak(r.answer, r.language);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not answer right now.');
      setStage('error');
    }
  }

  function reset() { stopSpeaking(); setResult(null); setQuestion(''); setTyped(''); setPartial(''); setError(''); setStage('idle'); if (canListen && !typing) startListening(); }

  const whatsapp = (tenant.whatsapp_number ?? '').replace(/[^0-9+]/g, '');
  const phone = (tenant.phone_number ?? '').replace(/[^0-9+]/g, '');
  const btn = "inline-flex items-center justify-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl text-white active:scale-[0.98] transition";

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 35 }} className="flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45" onClick={() => { stopSpeaking(); onClose(); }} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full flex flex-col overflow-hidden animate-card-in" style={{ maxWidth: 440, maxHeight: '82vh' }} role="dialog" aria-label="Ask about this brochure">
        <div className="h-1.5 flex-shrink-0" style={{ backgroundColor: brandColor }} />
        <div className="flex items-center gap-2 px-5 pt-4 pb-2">
          <Sparkles className="w-4 h-4" style={{ color: brandColor }} />
          <span className="text-sm font-black text-slate-800 flex-1">Ask about this brochure</span>
          <button onClick={() => { setMuted(m => !m); if (!muted) stopSpeaking(); }} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500" aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button onClick={() => { stopSpeaking(); onClose(); }} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 pb-5 overflow-y-auto overscroll-contain">
          {/* Listening */}
          {stage === 'listening' && (
            <div className="flex flex-col items-center py-4">
              <div className="relative w-20 h-20 mb-3">
                <span className="absolute inset-0 rounded-full opacity-30 animate-ping" style={{ backgroundColor: brandColor }} />
                <span className="absolute inset-2 rounded-full flex items-center justify-center" style={{ backgroundColor: brandColor }}><Mic className="w-8 h-8 text-white" /></span>
              </div>
              <p className="text-sm font-bold text-slate-800">Listening…</p>
              <p className="text-sm text-slate-500 mt-1 min-h-[1.25rem] text-center">{partial || 'Ask anything about this product'}</p>
              <button onClick={() => setTyping(true)} className="mt-4 text-xs font-bold text-slate-400 inline-flex items-center gap-1"><Keyboard className="w-3.5 h-3.5" /> Type instead</button>
            </div>
          )}

          {/* Thinking */}
          {stage === 'thinking' && (
            <div className="py-3">
              <p className="text-sm text-slate-500 mb-3">You asked: <span className="text-slate-800 font-semibold">{question}</span></p>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: `${brandColor}55`, borderTopColor: brandColor }} /> Finding the answer…
              </div>
            </div>
          )}

          {/* Answer */}
          {stage === 'answer' && result && (
            <div className="py-1">
              <p className="text-xs text-slate-400 mb-2">You asked: <span className="text-slate-600 font-semibold">{question}</span></p>
              <p className="text-base text-slate-900 leading-relaxed">{result.answer}</p>
              {result.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {result.sources.map(s => (
                    <button key={s.id} onClick={() => s.kind === 'hotspot' && onSourceTap?.(s.id)}
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full border ${s.kind === 'hotspot' ? 'border-slate-200 text-slate-600 hover:border-slate-400' : 'border-slate-100 text-slate-400 cursor-default'}`}>
                      <BookOpen className="w-3 h-3" /> {s.label}
                    </button>
                  ))}
                </div>
              )}
              {result.tier === 'explain' && <p className="text-[11px] text-slate-400 mt-2">General explanation — check the brochure or dealer for what this variant includes.</p>}
              {result.handoff && (whatsapp || phone) && (
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {whatsapp && <a href={`https://wa.me/${whatsapp.replace('+', '')}?text=${encodeURIComponent(`Hi, I have a question about ${productSlug}: ${question}`)}`} target="_blank" rel="noopener noreferrer" className={btn} style={{ backgroundColor: '#25D366' }}><MessageCircle className="w-4 h-4" /> WhatsApp</a>}
                  {phone && <a href={`tel:${phone}`} className={btn} style={{ backgroundColor: brandColor }}><Phone className="w-4 h-4" /> Call</a>}
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <button onClick={reset} className={`${btn} flex-1`} style={{ backgroundColor: brandColor }}>{canListen && !typing ? <Mic className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />} Ask another</button>
                <button onClick={() => { stopSpeaking(); onClose(); }} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100">Done</button>
              </div>
            </div>
          )}

          {/* Error / idle with message */}
          {(stage === 'error' || (stage === 'idle' && error)) && (
            <div className="py-2">
              <p className="text-sm text-brand-cerise font-medium mb-3">{error}</p>
              <div className="flex gap-2">
                {canListen && <button onClick={startListening} className={`${btn} flex-1`} style={{ backgroundColor: brandColor }}><Mic className="w-4 h-4" /> Try again</button>}
                <button onClick={() => setTyping(true)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 inline-flex items-center justify-center gap-2"><Keyboard className="w-4 h-4" /> Type</button>
              </div>
            </div>
          )}

          {/* Typed input */}
          {typing && stage !== 'thinking' && stage !== 'answer' && (
            <form onSubmit={e => { e.preventDefault(); submit(typed); }} className="flex gap-2 pt-2">
              <input ref={inputRef} value={typed} onChange={e => setTyped(e.target.value)} placeholder="Type your question…"
                className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none" style={{ borderColor: typed ? brandColor : undefined }} />
              <button type="submit" className="w-11 h-11 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: brandColor }} aria-label="Ask"><Send className="w-4 h-4" /></button>
              {canListen && <button type="button" onClick={() => { setTyping(false); startListening(); }} className="w-11 h-11 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600" aria-label="Speak"><Mic className="w-4 h-4" /></button>}
            </form>
          )}

          <p className="text-[10px] text-slate-400 text-center mt-4">Answers come from this brochure and {tenant.name}'s notes. For prices and offers, please ask the dealer.</p>
        </div>
      </div>
    </div>
  );
}
