import { supabase, ArEventType } from './supabase';

/*
  AR event tracking.

  One session id per AR run. target_found is logged once per page per
  session, so tracking wobble does not inflate the count. Inserts are fire
  and forget: a failed analytics write must never break the experience.
  tenant_id, product_id, occurred_at and date_key are stamped by the
  database, so the client only sends ids it already knows.
*/

export type Platform = 'ios' | 'android' | 'desktop' | 'other';

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return 'desktop';
  return 'other';
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback for very old WebViews
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class ArSession {
  readonly sessionId = newId();
  readonly platform = detectPlatform();
  private seenPages = new Set<string>();

  constructor(private brochureId: string, private source: 'qr' | 'link' | 'learn' = 'link') {}

  private send(event_type: ArEventType, extra: { page_id?: string; hotspot_id?: string } = {}) {
    void supabase
      .from('ar_events')
      .insert({
        brochure_id: this.brochureId,
        session_id: this.sessionId,
        platform: this.platform,
        source: this.source,
        event_type,
        ...extra,
      })
      .then(({ error }) => { if (error) console.warn('analytics', error.message); });
  }

  sessionStart() { this.send('session_start'); }

  targetFound(pageId: string) {
    if (this.seenPages.has(pageId)) return;
    this.seenPages.add(pageId);
    this.send('target_found', { page_id: pageId });
  }

  hotspotTapped(hotspotId: string, pageId: string) { this.send('hotspot_tapped', { hotspot_id: hotspotId, page_id: pageId }); }

  mediaPlayed(hotspotId: string, pageId: string) { this.send('media_played', { hotspot_id: hotspotId, page_id: pageId }); }
}
