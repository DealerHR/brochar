import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from '../lib/router';
import {
  supabase, Brochure, BrochurePage, Hotspot, HotspotBlock, Product, Tenant, LinkData, PdfData, ActionData,
} from '../lib/supabase';
import { MINDAR_CDN, loadScript, withMindARWorkers, requireMindAR, MindARThree } from '../lib/mindar';
import { ArSession } from '../lib/analytics';
import { isHttpUrl } from '../lib/validation';
import HotspotCard from '../components/HotspotCard';
import LinkOverlay from '../components/LinkOverlay';
import PdfOverlay from '../components/PdfOverlay';
import AskCard from '../components/AskCard';
import { AlertCircle, ChevronLeft, UserCheck, Eye, Camera, Mic } from 'lucide-react';

/* ---------- small helpers ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = document as any;

async function leaveFullscreen() {
  try {
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
    }
  } catch { /* ignore */ }
}

// Physical orientation, independent of viewport quirks in fullscreen on iOS.
function readIsLandscape(): boolean {
  const so = (screen as Screen & { orientation?: { type?: string } }).orientation;
  if (so?.type) return so.type.startsWith('landscape');
  if (window.matchMedia) return window.matchMedia('(orientation: landscape)').matches;
  return window.innerWidth > window.innerHeight;
}

type Loaded = {
  tenant: Tenant; product: Product; brochure: Brochure;
  pages: BrochurePage[]; hotspots: Hotspot[]; blocks: Record<string, HotspotBlock[]>;
};

type Phase = 'loading' | 'camera-denied' | 'running' | 'error';

/* ---------- page ---------- */

export default function ARPlayerPage({ teamMode = false }: { teamMode?: boolean }) {
  const { tenantSlug, productSlug } = useParams();
  const navigate = useNavigate();
  // Where the visitor came from: the customer QR carries ?src=qr.
  const source: 'qr' | 'link' | 'learn' = teamMode ? 'learn' : new URLSearchParams(window.location.search).get('src') === 'qr' ? 'qr' : 'link';

  const mindARRef = useRef<MindARThree | null>(null);
  // MindAR renders into this fixed, full-viewport div appended to <body>; React only draws overlays.
  const arDivRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<ArSession | null>(null);
  const listenersRef = useRef<Array<() => void>>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dotsRef = useRef<Array<{ dot: any; hotspot: Hotspot; pageId: string }>>([]);
  const lastTapRef = useRef(0);
  const lastPopupOpenRef = useRef(0);
  const loadedRef = useRef<Loaded | null>(null);
  const isLandscapeRef = useRef(readIsLandscape());

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<Loaded | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [popup, setPopup] = useState<Hotspot | null>(null);
  const [linkOverlay, setLinkOverlay] = useState<{ url: string; label: string } | null>(null);
  const [pdfOverlay, setPdfOverlay] = useState<{ url: string; label: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [, setIsLandscape] = useState(readIsLandscape());

  /* mount: AR container, scroll lock, load + auto-start */
  useEffect(() => {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;overflow:hidden;background:#000;z-index:0;';
    document.body.appendChild(div);
    arDivRef.current = div;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const onRotate = () => {
      const next = readIsLandscape();
      if (next !== isLandscapeRef.current) { isLandscapeRef.current = next; setIsLandscape(next); }
    };
    window.addEventListener('orientationchange', onRotate);
    window.addEventListener('resize', onRotate);

    (async () => {
      const loaded = await loadData();
      if (!loaded) return;
      loadedRef.current = loaded;
      setData(loaded);
      await startAR(loaded);
    })();

    return () => {
      window.speechSynthesis?.cancel();
      mindARRef.current?.stop();
      mindARRef.current = null;
      div.remove();
      arDivRef.current = null;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      window.removeEventListener('orientationchange', onRotate);
      window.removeEventListener('resize', onRotate);
      listenersRef.current.forEach(fn => fn());
      listenersRef.current = [];
      leaveFullscreen();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData(): Promise<Loaded | null> {
    const { data: t } = await supabase.from('tenants').select('*').eq('slug', tenantSlug!).eq('is_active', true).maybeSingle();
    if (!t) { fail('Experience not found.'); return null; }
    const { data: p } = await supabase.from('products').select('*')
      .eq('tenant_id', t.id).eq('slug', productSlug!).eq('is_active', true).maybeSingle();
    if (!p) { fail('Experience not found.'); return null; }
    // Anonymous visitors only receive active brochures (row security); signed-in editors also get drafts.
    const { data: br } = await supabase.from('brochures').select('*').eq('product_id', p.id).maybeSingle();
    if (!br) { fail('This brochure is not live yet. If you are the editor, sign in to preview it.'); return null; }
    if (!br.mind_file_url) { fail('The brochure pages have not been compiled yet. Open the builder and press Compile Targets.'); return null; }
    setIsPreview(br.status !== 'active');

    const { data: pg } = await supabase.from('brochure_pages').select('*').eq('brochure_id', br.id).order('page_index');
    const pages = pg ?? [];
    const pageIds = pages.map(x => x.id);
    const hotspots: Hotspot[] = pageIds.length
      ? ((await supabase.from('hotspots').select('*').in('page_id', pageIds).order('display_order')).data ?? [])
      : [];
    const blocks: Record<string, HotspotBlock[]> = {};
    if (hotspots.length) {
      const { data: bl } = await supabase.from('hotspot_blocks').select('*').in('hotspot_id', hotspots.map(h => h.id)).order('position');
      for (const b of (bl ?? []) as HotspotBlock[]) {
        // Sales-team-only blocks never reach the customer card.
        if (!teamMode && b.audience === 'team') continue;
        (blocks[b.hotspot_id] ??= []).push(b);
      }
    }
    return { tenant: t, product: p, brochure: br, pages, hotspots, blocks };
  }

  function fail(msg: string) { setError(msg); setPhase('error'); }

  async function startAR(loaded: Loaded) {
    const container = arDivRef.current;
    if (!container) return;
    const { brochure, pages, hotspots } = loaded;
    setPhase('loading');

    try {
      // mindar-image-three.prod.js bundles TF.js + Three.js + MindAR. Load it once only;
      // loading mindar-image.prod.js as well double-initialises TF.js and corrupts WebGL.
      await loadScript(MINDAR_CDN + 'mindar-image-three.prod.js');

      const session = new ArSession(brochure.id, source);
      sessionRef.current = session;

      const mindResponse = await fetch(brochure.mind_file_url!);
      const mindBlob = URL.createObjectURL(new Blob([await mindResponse.arrayBuffer()]));

      const MINDAR = requireMindAR();
      const THREE = MINDAR.IMAGE.THREE;
      const MindARThreeCtor = MINDAR.IMAGE.MindARThree;
      if (!THREE || !MindARThreeCtor) throw new Error('AR engine did not load.');

      // Explicit pixel size so MindAR never reads a stale clientWidth on a fixed element.
      const syncContainerSize = () => {
        container.style.width = window.innerWidth + 'px';
        container.style.height = window.innerHeight + 'px';
      };
      syncContainerSize();
      const onWindowResize = () => syncContainerSize();
      window.addEventListener('resize', onWindowResize);
      listenersRef.current.push(() => window.removeEventListener('resize', onWindowResize));

      const mindar = new MindARThreeCtor({ container, imageTargetSrc: mindBlob, maxTrack: 1, uiLoading: 'no', uiScanning: 'no', uiError: 'no' });
      mindARRef.current = mindar;
      const { renderer, scene, camera } = mindar;
      scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));

      // Anchor index = position in page_index order (matches compile order).
      const sortedPages = [...pages].sort((a, b) => a.page_index - b.page_index);
      let toastTimer: ReturnType<typeof setTimeout> | null = null;

      for (let i = 0; i < sortedPages.length; i++) {
        const page = sortedPages[i];
        const anchor = mindar.addAnchor(i);
        const pageHotspots = hotspots.filter(h => h.page_id === page.id);

        // Natural aspect ratio maps % positions onto MindAR's anchor plane:
        // x ∈ [-0.5, 0.5], y ∈ [-aspect/2, aspect/2], origin at image centre.
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = page.image_url;
        await new Promise(r => { img.onload = r; img.onerror = r; });
        const aspect = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 1;

        pageHotspots.forEach((hotspot, idx) => {
          const x = (hotspot.pos_x / 100) - 0.5;
          const y = (0.5 - hotspot.pos_y / 100) * aspect;
          const cvs = document.createElement('canvas');
          cvs.width = 128; cvs.height = 128;
          const ctx = cvs.getContext('2d')!;
          const color = hotspot.dot_color;
          ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.globalAlpha = 0.25; ctx.stroke();
          ctx.beginPath(); ctx.arc(64, 64, 38, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.globalAlpha = 0.6; ctx.stroke();
          ctx.beginPath(); ctx.arc(64, 64, 22, 0, Math.PI * 2); ctx.fillStyle = color; ctx.globalAlpha = 1; ctx.fill();
          ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(idx + 1), 64, 64);

          const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.22, 0.22),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cvs), transparent: true, depthTest: false, depthWrite: false }),
          );
          mesh.position.set(x, y, 0.001);
          anchor.group.add(mesh);
          dotsRef.current.push({ dot: mesh, hotspot, pageId: page.id });
        });

        anchor.onTargetFound = () => {
          session.targetFound(page.id); // once per page per session
          const n = pageHotspots.length;
          setToast(`Page ${page.page_index + 1} found · ${n} hotspot${n === 1 ? '' : 's'}`);
          if (toastTimer) clearTimeout(toastTimer);
          toastTimer = setTimeout(() => setToast(null), 2200);
        };
        anchor.onTargetLost = () => { /* dots hide with the anchor; nothing else to do */ };
      }

      // MindAR starts its tracking worker inside start(); serve it from a blob URL.
      await withMindARWorkers(() => mindar.start());
      setPhase('running');
      session.sessionStart();

      // Let CSS do the cover-fit for the camera video. Only set individual properties;
      // replacing cssText would wipe MindAR's own z-index and break the layer order.
      const vid = container.querySelector('video') as HTMLVideoElement | null;
      if (vid) { vid.style.top = '0'; vid.style.left = '0'; vid.style.width = '100%'; vid.style.height = '100%'; vid.style.objectFit = 'cover'; }

      // Rotation: MindAR sizes its projection from the camera stream it opened, so after the
      // phone turns the dots drift off the page. Restart tracking (no new permission prompt)
      // once the viewport has settled. Also covers landscape and portrait brochures alike.
      const styleVideo = () => {
        const v = container.querySelector('video') as HTMLVideoElement | null;
        if (v) { v.style.top = '0'; v.style.left = '0'; v.style.width = '100%'; v.style.height = '100%'; v.style.objectFit = 'cover'; }
      };
      let rotateTimer: ReturnType<typeof setTimeout> | null = null;
      let restarting = false;
      const restartTracking = async () => {
        if (restarting || mindARRef.current !== mindar) return;
        restarting = true;
        setRotating(true);
        try {
          mindar.stop();
          syncContainerSize();
          await new Promise(r => setTimeout(r, 150));
          await withMindARWorkers(() => mindar.start());
          styleVideo();
        } catch (err) {
          console.warn('restart after rotation failed', err);
        } finally {
          restarting = false;
          setRotating(false);
        }
      };
      const onOrientationChange = () => {
        if (rotateTimer) clearTimeout(rotateTimer);
        rotateTimer = setTimeout(restartTracking, 450);
      };
      window.addEventListener('orientationchange', onOrientationChange);
      const so = (screen as Screen & { orientation?: EventTarget }).orientation;
      so?.addEventListener?.('change', onOrientationChange);
      listenersRef.current.push(
        () => window.removeEventListener('orientationchange', onOrientationChange),
        () => so?.removeEventListener?.('change', onOrientationChange),
      );

      let tick = 0;
      renderer.setAnimationLoop(() => {
        tick += 0.05;
        for (const { dot } of dotsRef.current) dot.scale.setScalar(1 + 0.12 * Math.sin(tick));
        renderer.render(scene, camera);
      });

      // Tap → nearest dot within reach on a tracked page.
      const onTap = (clientX: number, clientY: number) => {
        const now = Date.now();
        if (now - lastTapRef.current < 400) return;
        lastTapRef.current = now;
        if (!dotsRef.current.length) return;
        const rect = renderer.domElement.getBoundingClientRect();
        const THRESHOLD = 70;
        let best: { hotspot: Hotspot; dist: number } | null = null;
        for (const { dot, hotspot } of dotsRef.current) {
          const pos = new THREE.Vector3();
          dot.getWorldPosition(pos);
          pos.project(camera);
          if (pos.z > 1 || (dot.parent && !dot.parent.visible)) continue;
          const sx = (pos.x + 1) / 2 * rect.width + rect.left;
          const sy = (-pos.y + 1) / 2 * rect.height + rect.top;
          const dist = Math.hypot(clientX - sx, clientY - sy);
          if (dist < THRESHOLD && (!best || dist < best.dist)) best = { hotspot, dist };
        }
        if (best) handleHotspotTap(best.hotspot);
      };
      let touchStartX = 0, touchStartY = 0;
      const touchStartH = (e: TouchEvent) => { const t = e.touches[0]; if (t) { touchStartX = t.clientX; touchStartY = t.clientY; } };
      const touchEndH = (e: TouchEvent) => {
        const t = e.changedTouches[0];
        if (t && Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY) < 12) onTap(t.clientX, t.clientY);
      };
      const clickH = (e: MouseEvent) => {
        const caps = (e as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities;
        if (!caps?.firesTouchEvents) onTap(e.clientX, e.clientY);
      };
      window.addEventListener('touchstart', touchStartH, { passive: true });
      window.addEventListener('touchend', touchEndH, { passive: true });
      window.addEventListener('click', clickH);
      listenersRef.current.push(
        () => window.removeEventListener('touchstart', touchStartH),
        () => window.removeEventListener('touchend', touchEndH),
        () => window.removeEventListener('click', clickH),
      );
    } catch (err) {
      console.error(err);
      // Camera refused or unavailable: offer a retry button (a tap also re-prompts on some phones).
      mindARRef.current?.stop();
      mindARRef.current = null;
      dotsRef.current = [];
      listenersRef.current.forEach(fn => fn());
      listenersRef.current = [];
      setPhase('camera-denied');
    }
  }

  /* ---------- interactions ---------- */

  function handleHotspotTap(hotspot: Hotspot) {
    lastPopupOpenRef.current = Date.now();
    window.speechSynthesis?.cancel();
    sessionRef.current?.hotspotTapped(hotspot.id, hotspot.page_id);
    const blocks = loadedRef.current?.blocks[hotspot.id] ?? [];
    if (hotspot.tap_action === 'launch') {
      const first = blocks.find(b => ['link', 'pdf', 'action'].includes(b.kind));
      if (first && launchBlock(hotspot, first)) return;
    }
    setPopup(hotspot);
  }

  /** Opens a link / PDF / contact block directly. Returns false when the card is needed instead. */
  function launchBlock(hotspot: Hotspot, b: HotspotBlock): boolean {
    const tenant = loadedRef.current?.tenant;
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
    const brochure = loadedRef.current?.brochure;
    if (!brochure) throw new Error('Not ready');
    const { error } = await supabase.from('leads').insert({
      brochure_id: brochure.id, hotspot_id: lead.hotspotId, session_id: sessionRef.current?.sessionId ?? null,
      name: lead.name, phone: lead.phone, message: lead.message || null, source,
    });
    if (error) throw new Error('Could not send. Please try again.');
  }

  function closePopup() {
    // Ignore the synthetic click that follows touchend, which would land on the backdrop.
    if (Date.now() - lastPopupOpenRef.current < 600) return;
    window.speechSynthesis?.cancel();
    setPopup(null);
  }

  async function exitAR() {
    window.speechSynthesis?.cancel();
    mindARRef.current?.stop();
    mindARRef.current = null;
    await leaveFullscreen();
    // A page opened from a QR has no history to go back to, so go to the client's page.
    navigate(`/${tenantSlug}`, true);
  }

  /* ---------- render ---------- */

  const tenant = data?.tenant ?? null;
  const brandColor = tenant?.brand_color ?? '#0A2463';
  const running = phase === 'running';
  const askEnabled = !!tenant && tenant.assistant_scope !== 'off' && (tenant.assistant_scope !== 'team' || teamMode);

  if (phase === 'error') return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} className="bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
      <AlertCircle className="w-12 h-12 text-slate-600 mb-4" />
      <h2 className="text-lg font-bold text-white mb-2">Experience unavailable</h2>
      <p className="text-slate-400 text-sm max-w-xs">{error}</p>
    </div>
  );

  return (
    <>
      {/* Loading: nothing but a spinner until the brochure is known, then the client logo
          (or the brochure's first page) above it. The camera prompt appears on its own. */}
      {(phase === 'loading' || phase === 'camera-denied') && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} className="bg-slate-950 flex flex-col items-center justify-center px-8 text-center">
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt="" className="h-14 max-w-[60vw] object-contain mb-8 opacity-95" />
          ) : data?.pages[0]?.image_url ? (
            <img src={data.pages[0].image_url} alt="" className="h-40 max-w-[60vw] object-contain rounded-lg shadow-2xl mb-8 opacity-90" />
          ) : null}
          {phase === 'loading' ? (
            <div className="w-9 h-9 border-[3px] rounded-full animate-spin" style={{ borderColor: `${brandColor}55`, borderTopColor: brandColor }} />
          ) : (
            <>
              <p className="text-slate-300 text-sm max-w-xs mb-5">The camera could not be started. Allow camera access for this site, then try again.</p>
              <button onClick={() => loadedRef.current && startAR(loadedRef.current)}
                className="inline-flex items-center gap-2 text-white font-semibold px-6 py-3 rounded-full text-sm shadow-lg active:scale-95" style={{ backgroundColor: brandColor }}>
                <Camera className="w-4 h-4" /> Allow camera and start
              </button>
            </>
          )}
        </div>
      )}

      {linkOverlay && <LinkOverlay url={linkOverlay.url} label={linkOverlay.label} brandColor={brandColor} onClose={() => setLinkOverlay(null)} />}
      {pdfOverlay && <PdfOverlay url={pdfOverlay.url} label={pdfOverlay.label} brandColor={brandColor} onClose={() => setPdfOverlay(null)} />}

      {/* Top controls */}
      {running && !popup && (
        <>
          <button onClick={exitAR} aria-label="Back"
            style={{ position: 'fixed', top: '1rem', left: '1rem', zIndex: 50 }}
            className="w-11 h-11 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-lg active:scale-95 transition-transform">
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 50 }} className="flex items-center gap-2">
            {isPreview && (
              <span className="inline-flex items-center gap-1.5 bg-white/90 text-slate-800 text-xs font-black px-3 py-1.5 rounded-full shadow-lg select-none">
                <Eye className="w-3.5 h-3.5" /> Draft preview
              </span>
            )}
            {teamMode && (
              <span className="inline-flex items-center gap-1.5 bg-amber-400 text-amber-950 text-xs font-black px-3 py-1.5 rounded-full shadow-lg select-none">
                <UserCheck className="w-3.5 h-3.5" /> Sales team view
              </span>
            )}
          </div>
        </>
      )}

      {running && rotating && (
        <div style={{ position: 'fixed', bottom: '5.5rem', left: 0, right: 0, zIndex: 25 }} className="flex justify-center pointer-events-none">
          <span className="bg-black/65 backdrop-blur-md text-white text-xs font-semibold px-4 py-2 rounded-full border border-white/10 shadow-lg">Adjusting to rotation…</span>
        </div>
      )}

      {/* Ask AI */}
      {running && askEnabled && !popup && !asking && !linkOverlay && !pdfOverlay && (
        <div style={{ position: 'fixed', bottom: '1.5rem', left: 0, right: 0, zIndex: 26 }} className="flex justify-center pointer-events-none">
          <button onClick={() => setAsking(true)}
            className="pointer-events-auto inline-flex items-center gap-2 pl-4 pr-5 py-3 rounded-full text-white text-sm font-bold shadow-2xl border border-white/20 active:scale-95 transition"
            style={{ backgroundColor: brandColor }}>
            <Mic className="w-5 h-5" /> Ask
          </button>
        </div>
      )}
      {asking && tenant && (
        <AskCard tenant={tenant} productSlug={productSlug!} team={teamMode} sessionId={sessionRef.current?.sessionId} source={source} brandColor={brandColor}
          onClose={() => setAsking(false)}
          onSourceTap={hotspotId => {
            const h = loadedRef.current?.hotspots.find(x => x.id === hotspotId);
            if (h) { setAsking(false); lastPopupOpenRef.current = Date.now(); setPopup(h); }
          }} />
      )}

      {/* Page-found toast */}
      {running && toast && !popup && (
        <div style={{ position: 'fixed', bottom: '5.5rem', left: 0, right: 0, zIndex: 25 }} className="flex justify-center pointer-events-none">
          <span className="bg-black/65 backdrop-blur-md text-white text-xs font-semibold px-4 py-2 rounded-full border border-white/10 shadow-lg animate-card-in">{toast}</span>
        </div>
      )}

      {/* Hotspot card */}
      {popup && tenant && (
        <HotspotCard
          hotspot={popup}
          number={(loadedRef.current?.hotspots.filter(h => h.page_id === popup.page_id).findIndex(h => h.id === popup.id) ?? 0) + 1}
          blocks={loadedRef.current?.blocks[popup.id] ?? []}
          tenant={tenant}
          brandColor={brandColor}
          learnMode={teamMode}
          onClose={closePopup}
          onLinkOpen={(url, label, mode) => {
            if (mode === 'newtab') window.open(url, '_blank', 'noopener');
            else setLinkOverlay({ url, label });
          }}
          onPdfOpen={(url, label) => setPdfOverlay({ url, label })}
          onLead={submitLead}
          onMedia={() => sessionRef.current?.mediaPlayed(popup.id, popup.page_id)}
        />
      )}
    </>
  );
}
