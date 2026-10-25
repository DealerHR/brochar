import { supabase } from './supabase';

export type AskSource = { kind: 'hotspot' | 'knowledge'; id: string; label: string };
export type AskResult = {
  answer: string;
  language: string;
  tier: 'fact' | 'explain' | 'handoff' | 'blocked';
  sources: AskSource[];
  handoff: boolean;
};

export async function askQuestion(input: {
  tenant_slug: string; product_slug: string; team: boolean; question: string; session_id?: string; source?: string; language?: string;
}): Promise<AskResult> {
  const { data, error } = await supabase.functions.invoke('ask', { body: input });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try { const j = await ctx.json(); if (j?.error) throw new Error(j.error); } catch (e) { if (e instanceof Error && e.message) throw e; }
    }
    throw new Error('Ask AI could not answer right now. Please try again.');
  }
  if (data?.error) throw new Error(data.error);
  return data as AskResult;
}

/* ---------- speech helpers (browser engines; server speech can replace these later) ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;

export function speechRecognitionAvailable(): boolean {
  const w = window as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Map a client preference or device language to a recognition locale. */
export function recognitionLocale(preferred: string): string {
  const base = preferred === 'auto' ? (navigator.language || 'en-IN') : preferred;
  const map: Record<string, string> = {
    en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', gu: 'gu-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', bn: 'bn-IN', ml: 'ml-IN', pa: 'pa-IN',
  };
  const short = base.toLowerCase().split('-')[0];
  return base.includes('-') ? base : (map[short] ?? 'en-IN');
}

/** Listens once and resolves with the transcript. Rejects with a short reason. */
export function listenOnce(locale: string, onPartial?: (text: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { reject(new Error('unsupported')); return; }
    const rec = new Ctor();
    rec.lang = locale;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    let finalText = '';
    let settled = false;
    const done = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    rec.onresult = (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => {
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
      }
      onPartial?.(finalText || interim);
    };
    rec.onerror = (e: { error: string }) => done(() => reject(new Error(e.error || 'error')));
    rec.onend = () => done(() => (finalText.trim() ? resolve(finalText.trim()) : reject(new Error('no-speech'))));
    try { rec.start(); } catch (err) { done(() => reject(err instanceof Error ? err : new Error('start-failed'))); }
    // Safety stop
    setTimeout(() => { try { rec.stop(); } catch { /* ignore */ } }, 12000);
  });
}

export function speak(text: string, language: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = recognitionLocale(language);
  // Prefer a voice for the exact locale, then language.
  const voices = window.speechSynthesis.getVoices();
  const short = u.lang.split('-')[0];
  const v = voices.find(x => x.lang === u.lang) ?? voices.find(x => x.lang.startsWith(short));
  if (v) u.voice = v;
  u.rate = 0.98;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
