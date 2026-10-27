import { supabase } from './supabase';

export type RecogniseCandidate = {
  product_id: string; slug: string; name: string; thumbnail_url: string | null;
  /** 0-100: how sure the model is. */
  score: number;
  confidence: 'high' | 'medium' | 'low'; reason: string;
};
export type RecogniseResult = {
  id?: string;
  candidates: RecogniseCandidate[];
  label_text: string;
  confidence: 'high' | 'medium' | 'low' | 'none';
  /** Score of the top candidate, 0 when there is none. */
  score: number;
  /** Side of the product in the photo, one of the PRODUCT_VIEWS values, or 'any'. */
  view: string;
};

/** Grabs the current camera frame as a JPEG (longest side ≤ maxSide), base64 without the data: prefix. */
export function captureFrame(video: HTMLVideoElement, maxSide = 768, quality = 0.72): string | null {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const scale = Math.min(1, maxSide / Math.max(vw, vh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality).replace(/^data:image\/jpeg;base64,/, '');
}

export async function recogniseProduct(input: { tenant_slug: string; image: string; session_id?: string; team?: boolean }): Promise<RecogniseResult> {
  const { data, error } = await supabase.functions.invoke('recognise', { body: input });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try { const j = await ctx.json(); if (j?.error) throw new Error(j.error); } catch (e) { if (e instanceof Error && e.message) throw e; }
    }
    throw new Error('Could not recognise the product right now. Pick it from the list.');
  }
  if (data?.error) throw new Error(data.error);
  return data as RecogniseResult;
}

/** Records which product the salesperson opened after a recognition, for later review. */
export function recordChoice(recognitionId: string | undefined, productId: string) {
  if (!recognitionId) return;
  void supabase.rpc('set_recognition_choice', { rid: recognitionId, pid: productId }).then(({ error }) => {
    if (error) console.warn('recognition choice', error.message);
  });
}

/** At or above this score the floor app opens the product without asking. */
export const AUTO_OPEN_SCORE = 75;

/**
 * Loads the client's catalogue and reference photos into the recognise function
 * and primes the model's prompt cache, so the first tap is fast. Fire and forget.
 */
export function warmRecogniser(tenant_slug: string) {
  void supabase.functions.invoke('recognise', { body: { tenant_slug, warm: true } }).catch(() => {});
}
