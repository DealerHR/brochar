import { useEffect, useRef, useState } from 'react';
import { useParams } from '../lib/router';
import {
  supabase, Brochure, BrochurePage, Hotspot, HotspotBlock, Product, Tenant, LinkData, PdfData, ActionData, viewLabel,
} from '../lib/supabase';
import { ArSession } from '../lib/analytics';
import { isHttpUrl } from '../lib/validation';
import { captureFrame, recogniseProduct, recordChoice, RecogniseResult } from '../lib/recognise';
import HotspotCard from '../components/HotspotCard';
import LinkOverlay from '../components/LinkOverlay';
import PdfOverlay from '../components/PdfOverlay';
import AskCard from '../components/AskCard';
import {
  AlertCircle, Camera, Mic, LayoutGrid, X, ChevronLeft, Share2, Video, Image as ImageIcon, FileText, Link as LinkIcon,
  Music, ListChecks, Check, RefreshCw, ScanSearch,
} from 'lucide-react';

/*
  Showroom floor app: /{tenant}/floor
  The salesperson opens this from the home screen. The camera is live at once.
  Point at the product, tap the shutter: the product is recognised and its
  hotspots appear as tiles over the camera. Every step has a one-tap manual path.
  Everything here is sales-team view (team-only blocks and knowledge are shown),
  which is why the link must not be printed on the customer brochure.
*/

type Bundle = { brochure: Brochure; pages: BrochurePage[]; hotspots: Hotspot[]; blocks: Record<string, HotspotBlock[]> };
type Phase = 'loading' | 'camera-denied' | 'ready' | 'error';

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
async function enterFullscreen() {
  if (isIOS) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = document.documentElement as any;
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  } catch { /* refused or unsupported */ }
}

const kindIcon = (kind?: HotspotBlock['kind']) => {
  switch (kind) {
    case 'video': return Video;
    case 'image': case 'gallery': return ImageIcon;
    case 'pdf': case 'spec_table': return FileText;
    case 'link': return LinkIcon;
    case 'audio': return Music;
    case 'quiz': return ListChecks;
    default: return FileText;
  }
};

export default function FloorPage() {
  const { tenantSlug } = useParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<ArSession | null>(null);
  const bundleRef = useRef<Bundle | null>(null);
  const autoOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullscreenAsked = useRef(false);

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [bundleError, setBundleError] = useState('');
  const [recognising, setRecognising] = useState(false);
  const [result, setResult] = useState<RecogniseResult | null>(null);
  const [resultError, setResultError] = useState('');
  const [showGrid, setShowGrid] = useState(false);
  const [lastSlug, setLastSlug] = useState<string | null>(null);
  const [popup, setPopup] = useState<Hotspot | null>(null);
  const [linkOverlay, setLinkOverlay] = useState<{ url: string; label: string } | null>(null);
  const [pdfOverlay, setPdfOverlay] = useState<{ url: string; label: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Side of the product the phone last looked at; orders the feature tiles.
  const [view, setView] = useState<string>('any');
  const [relooking, setRelooking] = useState(false);

  const brandColor = tenant?.brand_color ?? '#0A2463';
  const askEnabled = !!tenant && tenant.assistant_scope !== 'off';
  const storageKey = `brochar:floor:${tenantSlug}`;

  /* mount: load tenant + products, open camera */
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (async () => {
      const { data: t } = await supabase.from('tenants').select('*').eq('slug', tenantSlug!).eq('is_active', true).maybeSingle();
      if (!t) { setError('Showroom not found.'); setPhase('error'); return; }
      setTenant(t);
      const { data: ps } = await supabase.from('products').select('*').eq('tenant_id', t.id).eq('is_active', true).eq('floor_enabled', true).order('display_order');
      setProducts(ps ?? []);
      try { setLastSlug(localStorage.getItem(storageKey)); } catch { /* private mode */ }
      await openCamera(t);
    })();
    return () => {
      document.body.style.overflow = prevBody;
      stopCamera();
      window.speechSynthesis?.cancel();
      if (autoOpenTimer.current) clearTimeout(autoOpenTimer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function openCamera(t: Tenant) {
    stopCamera();
    const wantsMic = t.assistant_scope !== 'off';
    const video: MediaTrackConstraints = { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } };
    try {
      let stream: MediaStream;
      try {
        // One prompt for camera and microphone (the mic is for Ask).
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: wantsMic });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      }
      stream.getAudioTracks().forEach(tr => tr.stop());
      streamRef.current = stream;
      const el = videoRef.current;
      if (el) { el.srcObject = stream; await el.play().catch(() => {}); }
      setPhase('ready');
    } catch (err) {
      console.warn('camera', err);
      setPhase('camera-denied');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(tr => tr.stop());
    streamRef.current = null;
  }

  function firstTap() {
    if (fullscreenAsked.current) return;
    fullscreenAsked.current = true;
    void enterFullscreen();
  }

  /* ---------- recognise ---------- */

  async function shoot() {
    firstTap();
    const video = videoRef.current;
    if (!video || recognising || !tenant) return;
    const image = captureFrame(video);
    if (!image) { setResultError('Camera is not ready yet.'); return; }
    setRecognising(true); setResult(null); setResultError('');
    if (navigator.vibrate) navigator.vibrate(30);
    try {
      const r = await recogniseProduct({ tenant_slug: tenant.slug, image, team: true, session_id: sessionRef.current?.sessionId });
      setResult(r);
      setView(r.view ?? 'any');
      const top = r.candidates[0];
      if (top && top.confidence === 'high') {
        // Opens by itself after a moment; "Not this?" cancels.
        autoOpenTimer.current = setTimeout(() => { autoOpenTimer.current = null; choose(top.product_id, r.id); }, 1600);
      }
    } catch (err) {
      setResultError(err instanceof Error ? err.message : 'Could not recognise the product.');
    } finally {
      setRecognising(false);
    }
  }

  /**
   * While a product is open: look again at the product to update the side in view.
   * Switches product only on a confident match for a different one.
   */
  async function relook() {
    const video = videoRef.current;
    if (!video || relooking || !tenant || !product) return;
    const image = captureFrame(video);
    if (!image) return;
    setRelooking(true);
    if (navigator.vibrate) navigator.vibrate(30);
    try {
      const r = await recogniseProduct({ tenant_slug: tenant.slug, image, team: true, session_id: sessionRef.current?.sessionId });
      setView(r.view ?? 'any');
      const top = r.candidates[0];
      if (top && top.confidence === 'high' && top.product_id !== product.id) {
        const p = products.find(x => x.id === top.product_id);
        if (p) { recordChoice(r.id, p.id); await openProduct(p); }
      } else {
        recordChoice(r.id, product.id);
      }
    } catch (err) {
      console.warn('relook', err);
    } finally { setRelooking(false); }
  }

  function cancelAutoOpen() {
    if (autoOpenTimer.current) { clearTimeout(autoOpenTimer.current); autoOpenTimer.current = null; }
  }

  async function choose(productId: string, recognitionId?: string) {
    cancelAutoOpen();
    const p = products.find(x => x.id === productId);
    if (!p) return;
    recordChoice(recognitionId, productId);
    setResult(null); setShowGrid(false); setPopup(null);
    await openProduct(p);
  }

  /* ---------- product ---------- */

  async function openProduct(p: Product) {
    setProduct(p); setBundle(null); setBundleError('');
    try { localStorage.setItem(storageKey, p.slug); setLastSlug(p.slug); } catch { /* ignore */ }
    const { data: br } = await supabase.from('brochures').select('*').eq('product_id', p.id).maybeSingle();
    if (!br) { setBundleError('This product has no content yet.'); return; }
    const { data: pg } = await supabase.from('brochure_pages').select('*').eq('brochure_id', br.id).order('page_index');
    const pages = pg ?? [];
    const hotspots: Hotspot[] = pages.length
      ? ((await supabase.from('hotspots').select('*').in('page_id', pages.map(x => x.id)).order('display_order')).data ?? [])
      : [];
    const blocks: Record<string, HotspotBlock[]> = {};
    if (hotspots.length) {
      const { data: bl } = await supabase.from('hotspot_blocks').select('*').in('hotspot_id', hotspots.map(h => h.id)).order('position');
      for (const b of (bl ?? []) as HotspotBlock[]) (blocks[b.hotspot_id] ??= []).push(b);
    }
    // Hotspots in page order, then their order on the page.
    const order = new Map(pages.map((x, i) => [x.id, i]));
    hotspots.sort((a, b) => (order.get(a.page_id) ?? 0) - (order.get(b.page_id) ?? 0) || a.display_order - b.display_order);
    const bd = { brochure: br, pages, hotspots, blocks };
    bundleRef.current = bd; setBundle(bd);
    const session = new ArSession(br.id, 'floor');
    sessionRef.current = session;
    session.sessionStart();
  }

  function closeProduct() {
    window.speechSynthesis?.cancel();
    setProduct(null); setBundle(null); bundleRef.current = null; sessionRef.current = null;
    setPopup(null); setAsking(false); setLinkOverlay(null); setPdfOverlay(null);
    setView('any');
  }

  function tapHotspot(h: Hotspot) {
    window.speechSynthesis?.cancel();
    sessionRef.current?.hotspotTapped(h.id, h.page_id);
    const blocks = bundleRef.current?.blocks[h.id] ?? [];
    if (h.tap_action === 'launch') {
      const first = blocks.find(b => ['link', 'pdf', 'action'].includes(b.kind));
      if (first && launchBlock(h, first)) return;
    }
    setPopup(h);
  }

  function launchBlock(hotspot: Hotspot, b: HotspotBlock): boolean {
    const media = () => sessionRef.current?.mediaPlayed(hotspot.id, hotspot.page_id);
    if (b.kind === 'link') {
      const d = b.data as LinkData;
      if (!isHttpUrl(d.url)) return false;
      media();
      if (d.open_mode === 'newtab') window.open(d.url, '_blank', 'noopener');
      else setLinkOverlay({ url: d.url, label: d.label || hotspot.label });
      return true;
    }
    if (b.kind === 'pdf') {
      const d = b.data as PdfData;
      if (!isHttpUrl(d.url)) return false;
      media();
      setPdfOverlay({ url: d.url, label: d.label || hotspot.label });
      return true;
    }
    if (b.kind === 'action') {
      const d = b.data as ActionData;
      const number = (d.phone || (d.type === 'whatsapp' ? tenant?.whatsapp_number : tenant?.phone_number) || '').replace(/[^0-9+]/g, '');
      if (d.type === 'call' && number) { media(); window.location.href = `tel:${number}`; return true; }
      if (d.type === 'whatsapp' && number) {
        media();
        window.open(`https://wa.me/${number.replace('+', '')}${d.message ? `?text=${encodeURIComponent(d.message)}` : ''}`, '_blank', 'noopener');
        return true;
      }
    }
    return false;
  }

  async function submitLead(lead: { name: string; phone: string; message: string; hotspotId: string }) {
    const brochure = bundleRef.current?.brochure;
    if (!brochure) throw new Error('Not ready');
    const { error } = await supabase.from('leads').insert({
      brochure_id: brochure.id, hotspot_id: lead.hotspotId, session_id: sessionRef.current?.sessionId ?? null,
      name: lead.name, phone: lead.phone, message: lead.message || null, source: 'floor',
    });
    if (error) throw new Error('Could not send. Please try again.');
  }

  function shareToCustomer() {
    if (!tenant || !product) return;
    const url = `${window.location.origin}/${tenant.slug}/${product.slug}?src=qr`;
    const text = `${product.name} – ${tenant.name}\nPoint your phone at the brochure to explore it in AR, or open: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    setShareOpen(false);
  }

  /* ---------- render ---------- */

  const overlayOpen = !!popup || asking || !!linkOverlay || !!pdfOverlay;

  if (phase === 'error') return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
      <AlertCircle className="w-12 h-12 text-slate-600 mb-4" />
      <h2 className="text-lg font-bold text-white mb-2">Floor app unavailable</h2>
      <p className="text-slate-400 text-sm max-w-xs">{error}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none" onPointerDown={firstTap}>
      {/* Live camera */}
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
      {product && <div className="absolute inset-0 bg-slate-950/60" />}

      {/* Loading / denied */}
      {phase === 'loading' && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center px-8 text-center">
          {tenant?.logo_url
            ? <img src={tenant.logo_url} alt="" className="h-14 max-w-[60vw] object-contain mb-8 opacity-95" />
            : <div className="w-12 h-12 rounded-2xl mb-8 flex items-center justify-center text-white font-black text-xl" style={{ backgroundColor: brandColor }}>{tenant?.name?.[0] ?? ''}</div>}
          <div className="w-9 h-9 border-[3px] rounded-full animate-spin" style={{ borderColor: `${brandColor}55`, borderTopColor: brandColor }} />
        </div>
      )}
      {phase === 'camera-denied' && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center px-8 text-center">
          <Camera className="w-10 h-10 text-slate-500 mb-4" />
          <p className="text-slate-300 text-sm max-w-xs mb-5">The camera could not be started. Allow camera access for this site, then try again. You can still pick a product from the list.</p>
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <button onClick={() => tenant && openCamera(tenant)} className="inline-flex items-center justify-center gap-2 text-white font-semibold px-6 py-3 rounded-full text-sm shadow-lg active:scale-95" style={{ backgroundColor: brandColor }}>
              <Camera className="w-4 h-4" /> Allow camera
            </button>
            <button onClick={() => setShowGrid(true)} className="inline-flex items-center justify-center gap-2 text-white/90 font-semibold px-6 py-3 rounded-full text-sm bg-white/10 border border-white/15">
              <LayoutGrid className="w-4 h-4" /> Choose from list
            </button>
          </div>
        </div>
      )}

      {/* Scan mode */}
      {phase === 'ready' && !product && (
        <>
          <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
            <div className="flex items-center gap-2">
              {tenant?.logo_url ? <img src={tenant.logo_url} alt="" className="h-7 max-w-[40vw] object-contain" /> : <span className="text-white font-black text-sm">{tenant?.name}</span>}
            </div>
            <span className="inline-flex items-center gap-1.5 bg-amber-400 text-amber-950 text-[11px] font-black px-2.5 py-1 rounded-full">Sales floor</span>
          </div>

          {/* Framing guide */}
          {!recognising && !result && !resultError && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[78vw] max-w-sm aspect-[4/3] rounded-3xl border-2 border-white/40" />
              <p className="absolute bottom-[10.5rem] text-white/90 text-sm font-semibold drop-shadow">Point at the product and tap</p>
            </div>
          )}

          {recognising && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="w-12 h-12 border-[3px] border-white/30 border-t-white rounded-full animate-spin mb-4" />
              <p className="text-white font-semibold drop-shadow">Looking…</p>
            </div>
          )}

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 pb-7 pt-10 bg-gradient-to-t from-black/70 to-transparent">
            {lastSlug && !result && !resultError && (() => {
              const lp = products.find(p => p.slug === lastSlug);
              return lp ? (
                <div className="flex justify-center mb-4">
                  <button onClick={() => openProduct(lp)} className="inline-flex items-center gap-2 bg-white/15 backdrop-blur text-white text-xs font-bold px-4 py-2 rounded-full border border-white/20">
                    <RefreshCw className="w-3.5 h-3.5" /> Continue with {lp.name}
                  </button>
                </div>
              ) : null;
            })()}
            <div className="grid grid-cols-3 items-center px-8">
              <div />
              <div className="flex justify-center">
                <button onClick={shoot} disabled={recognising} aria-label="Recognise product"
                  className="w-[76px] h-[76px] rounded-full bg-white/20 border-[3px] border-white flex items-center justify-center active:scale-95 transition disabled:opacity-50">
                  <span className="w-[60px] h-[60px] rounded-full bg-white flex items-center justify-center">
                    <ScanSearch className="w-7 h-7" style={{ color: brandColor }} />
                  </span>
                </button>
              </div>
              <div className="flex justify-end">
                <button onClick={() => setShowGrid(true)} aria-label="Choose from list"
                  className="w-12 h-12 rounded-full bg-black/50 border border-white/25 flex items-center justify-center text-white active:scale-95">
                  <LayoutGrid className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Result sheet */}
          {(result || resultError) && (
            <div className="absolute inset-x-0 bottom-0 z-20 p-3">
              <div className="bg-white rounded-3xl shadow-2xl p-4 animate-card-in">
                {resultError ? (
                  <>
                    <p className="text-sm font-bold text-slate-800 mb-1">Could not recognise it</p>
                    <p className="text-xs text-slate-500 mb-3">{resultError}</p>
                  </>
                ) : result && result.candidates.length === 0 ? (
                  <>
                    <p className="text-sm font-bold text-slate-800 mb-1">No match</p>
                    <p className="text-xs text-slate-500 mb-3">Try again closer, with the badge or label in view, or pick from the list.</p>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
                      {result!.candidates[0].confidence === 'high' ? 'Opening…' : 'Is it one of these?'}
                    </p>
                    <div className="space-y-2 mb-3">
                      {result!.candidates.map((c, i) => (
                        <button key={c.product_id} onClick={() => choose(c.product_id, result!.id)}
                          className={`w-full flex items-center gap-3 rounded-2xl p-2 text-left active:scale-[0.99] transition ${i === 0 ? 'bg-slate-50 border-2' : 'border border-slate-200'}`}
                          style={i === 0 ? { borderColor: brandColor } : undefined}>
                          {c.thumbnail_url ? <img src={c.thumbnail_url} alt="" className="w-14 h-14 rounded-xl object-cover bg-slate-100 flex-shrink-0" />
                            : <div className="w-14 h-14 rounded-xl bg-slate-100 flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{c.name}</p>
                            <p className="text-[11px] text-slate-500 line-clamp-2">{c.reason}</p>
                          </div>
                          {i === 0 && c.confidence === 'high' && <Check className="w-5 h-5 flex-shrink-0" style={{ color: brandColor }} />}
                        </button>
                      ))}
                    </div>
                    {result!.label_text && <p className="text-[11px] text-slate-400 mb-3">Read on the product: “{result!.label_text}”</p>}
                  </>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { cancelAutoOpen(); setResult(null); setResultError(''); }}
                    className="flex-1 text-sm font-bold py-2.5 rounded-xl bg-slate-100 text-slate-700">
                    {result?.candidates[0]?.confidence === 'high' ? 'Not this?' : 'Try again'}
                  </button>
                  <button onClick={() => { cancelAutoOpen(); setShowGrid(true); }}
                    className="flex-1 text-sm font-bold py-2.5 rounded-xl text-white inline-flex items-center justify-center gap-1.5" style={{ backgroundColor: brandColor }}>
                    <LayoutGrid className="w-4 h-4" /> Choose from list
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Product mode */}
      {product && (
        <div className="absolute inset-0 flex flex-col">
          <div className="flex items-center gap-2 p-3 pt-4">
            <button onClick={closeProduct} aria-label="Change product"
              className="w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white active:scale-95">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-white font-black text-base leading-tight truncate">{product.name}</p>
              <p className="text-white/60 text-[11px] truncate">{view !== 'any' ? `Looking at: ${viewLabel(view)}` : 'Tap a feature to show it'}</p>
            </div>
            <button onClick={relook} disabled={relooking} aria-label="Look again"
              className="w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white active:scale-95 disabled:opacity-50">
              {relooking ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <ScanSearch className="w-5 h-5" />}
            </button>
            <button onClick={() => setShareOpen(true)} aria-label="Send to customer"
              className="w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white active:scale-95">
              <Share2 className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-28 overscroll-contain">
            {!bundle && !bundleError && (
              <div className="flex justify-center pt-16"><div className="w-8 h-8 border-[3px] border-white/30 border-t-white rounded-full animate-spin" /></div>
            )}
            {bundleError && <p className="text-white/70 text-sm text-center pt-16">{bundleError}</p>}
            {bundle && bundle.hotspots.length === 0 && <p className="text-white/70 text-sm text-center pt-16">No features added yet.</p>}
            {bundle && bundle.hotspots.length > 0 && (() => {
              const numberOf = new Map(bundle.hotspots.map((h, i) => [h.id, i + 1]));
              const here = view === 'any' ? [] : bundle.hotspots.filter(h => h.view === view);
              const rest = view === 'any' ? bundle.hotspots : bundle.hotspots.filter(h => h.view !== view);
              const tile = (h: Hotspot) => {
                const blocks = bundle.blocks[h.id] ?? [];
                const main = blocks.find(b => b.kind === 'video') ?? blocks.find(b => b.kind !== 'text') ?? blocks[0];
                const Icon = kindIcon(main?.kind);
                const hasTeam = blocks.some(b => b.audience === 'team');
                const thumb = blocks.find(b => b.kind === 'image')?.data as { url?: string } | undefined;
                return (
                  <button key={h.id} onClick={() => tapHotspot(h)}
                    className="relative text-left rounded-2xl overflow-hidden bg-white/10 border border-white/15 active:scale-[0.98] transition min-h-[118px] flex flex-col justify-end p-3">
                    {thumb?.url && <img src={thumb.url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />}
                    <div className="relative">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-black" style={{ backgroundColor: h.dot_color }}>{numberOf.get(h.id)}</span>
                        <Icon className="w-4 h-4 text-white/80" />
                        {hasTeam && <span className="ml-auto text-[9px] font-black uppercase tracking-wide bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded">Team</span>}
                      </div>
                      <p className="text-white font-bold text-sm leading-snug line-clamp-2">{h.label}</p>
                    </div>
                  </button>
                );
              };
              return (
                <>
                  {here.length > 0 && (
                    <>
                      <p className="text-white/70 text-[11px] font-black uppercase tracking-wide mb-2 mt-1">On this side</p>
                      <div className="grid grid-cols-2 gap-2.5 mb-4">{here.map(tile)}</div>
                      {rest.length > 0 && <p className="text-white/50 text-[11px] font-black uppercase tracking-wide mb-2">More features</p>}
                    </>
                  )}
                  {view !== 'any' && here.length === 0 && (
                    <p className="text-white/50 text-[11px] mb-2 mt-1">No feature is tagged for the {viewLabel(view).toLowerCase()} yet. All features:</p>
                  )}
                  <div className="grid grid-cols-2 gap-2.5">{rest.map(tile)}</div>
                </>
              );
            })()}
          </div>

          {askEnabled && !overlayOpen && (
            <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
              <button onClick={() => setAsking(true)}
                className="pointer-events-auto inline-flex items-center gap-2 pl-4 pr-5 py-3 rounded-full text-white text-sm font-bold shadow-2xl border border-white/20 active:scale-95 transition"
                style={{ backgroundColor: brandColor }}>
                <Mic className="w-5 h-5" /> Ask
              </button>
            </div>
          )}
        </div>
      )}

      {/* Product grid */}
      {showGrid && (
        <div className="absolute inset-0 z-30 bg-slate-950/95 flex flex-col">
          <div className="flex items-center justify-between p-4">
            <p className="text-white font-black">Choose a product</p>
            <button onClick={() => setShowGrid(false)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-8">
            {products.length === 0 && <p className="text-white/60 text-sm text-center pt-10">No products are set up for the floor yet.</p>}
            <div className="grid grid-cols-2 gap-3">
              {products.map(p => (
                <button key={p.id} onClick={() => { setShowGrid(false); setResult(null); setResultError(''); cancelAutoOpen(); openProduct(p); }}
                  className="rounded-2xl overflow-hidden bg-white/5 border border-white/10 text-left active:scale-[0.98] transition">
                  {p.thumbnail_url ? <img src={p.thumbnail_url} alt="" className="w-full aspect-[4/3] object-cover bg-white/5" /> : <div className="w-full aspect-[4/3] bg-white/5" />}
                  <p className="text-white font-bold text-sm p-3 leading-snug">{p.name}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Share sheet */}
      {shareOpen && product && (
        <div className="absolute inset-0 z-30 bg-black/60 flex items-end p-3" onClick={() => setShareOpen(false)}>
          <div className="bg-white rounded-3xl w-full p-5 animate-card-in" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-slate-900 mb-1">Send to customer</p>
            <p className="text-xs text-slate-500 mb-4">Opens WhatsApp with the {product.name} brochure link. Pick the customer's chat there.</p>
            <button onClick={shareToCustomer} className="w-full inline-flex items-center justify-center gap-2 text-white font-bold py-3 rounded-xl" style={{ backgroundColor: '#25D366' }}>
              <Share2 className="w-4 h-4" /> Share on WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* Overlays shared with the AR player */}
      {asking && tenant && product && (
        <AskCard tenant={tenant} productSlug={product.slug} team sessionId={sessionRef.current?.sessionId} source="floor" brandColor={brandColor}
          onClose={() => setAsking(false)}
          onSourceTap={hotspotId => {
            const h = bundleRef.current?.hotspots.find(x => x.id === hotspotId);
            if (h) { setAsking(false); setPopup(h); }
          }} />
      )}
      {popup && tenant && (
        <HotspotCard hotspot={popup} number={(bundle?.hotspots.findIndex(h => h.id === popup.id) ?? 0) + 1}
          blocks={bundleRef.current?.blocks[popup.id] ?? []} tenant={tenant} brandColor={brandColor} learnMode
          onClose={() => { window.speechSynthesis?.cancel(); setPopup(null); }}
          onLinkOpen={(url, label, mode) => { if (mode === 'newtab') window.open(url, '_blank', 'noopener'); else setLinkOverlay({ url, label }); }}
          onPdfOpen={(url, label) => setPdfOverlay({ url, label })}
          onLead={submitLead}
          onMedia={() => sessionRef.current?.mediaPlayed(popup.id, popup.page_id)} />
      )}
      {linkOverlay && <LinkOverlay url={linkOverlay.url} label={linkOverlay.label} brandColor={brandColor} onClose={() => setLinkOverlay(null)} />}
      {pdfOverlay && <PdfOverlay url={pdfOverlay.url} label={pdfOverlay.label} brandColor={brandColor} onClose={() => setPdfOverlay(null)} />}
    </div>
  );
}
