import { useEffect, useRef, useState } from 'react';
import { useParams } from '../lib/router';
import { supabase, Brochure, BrochurePage, Hotspot, Product, Tenant } from '../lib/supabase';
import { Volume2, Play, X, AlertCircle, ChevronLeft } from 'lucide-react';

declare global {
  interface Window {
    MINDAR: {
      IMAGE: {
        Compiler: new () => unknown;
        MindARThree: new (opts: unknown) => MindARThree;
        THREE: typeof THREE;
      };
    };
    Worker: new (url: string, opts?: WorkerOptions) => Worker;
  }
}

interface MindARThree {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  start: () => Promise<void>;
  stop: () => void;
  addAnchor: (targetIndex: number) => { group: THREE.Group; onTargetFound: () => void; onTargetLost: () => void };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type THREE = any;

const CDN = 'https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.1.4/dist/';

function loadScript(src: string): Promise<void> {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = () => res(); s.onerror = rej;
    document.head.appendChild(s);
  });
}

// Cross-browser fullscreen helpers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = document as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const docEl = document.documentElement as any;

async function enterFullscreen() {
  try {
    if (docEl.requestFullscreen) await docEl.requestFullscreen({ navigationUI: 'hide' });
    else if (docEl.webkitRequestFullscreen) await docEl.webkitRequestFullscreen();
    // Allow viewport to fully settle at the new screen dimensions before MindAR reads them
    await new Promise(r => setTimeout(r, 250));
  } catch {
    // Unsupported (iOS Safari < 16.4) or user dismissed — AR continues without fullscreen
  }
}

async function leaveFullscreen() {
  try {
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
    }
  } catch { /* ignore */ }
}

// Returns true when the device is physically in landscape.
// Prefers the Screen Orientation API (screen.orientation.type) which reflects the
// PHYSICAL orientation regardless of CSS viewport / fullscreen state — important
// because iOS Safari in fullscreen frequently does NOT update window.innerWidth/
// innerHeight on rotation, so the viewport-only signal stays stale.
// Falls back to matchMedia / innerWidth comparison on browsers without the API.
function readIsLandscape(): boolean {
  const so = (screen as Screen & { orientation?: { type?: string } }).orientation;
  if (so?.type) return so.type.startsWith('landscape');
  if (window.matchMedia) return window.matchMedia('(orientation: landscape)').matches;
  return window.innerWidth > window.innerHeight;
}

function extractYouTubeId(url: string): string {
  const m = url.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/);
  return m?.[1] ?? url;
}

type PopupState = { hotspot: Hotspot; showVideo: boolean } | null;

export default function ARPlayerPage() {
  const { tenantSlug, productSlug } = useParams();
  const mindARRef = useRef<MindARThree | null>(null);
  // MindAR container lives OUTSIDE React's DOM tree, appended to body as position:fixed.
  // fixed + inset:0 guarantees full-viewport coverage; absolute children (video, canvas)
  // are positioned within this containing block.
  const arDivRef = useRef<HTMLDivElement | null>(null);

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [brochure, setBrochure] = useState<Brochure | null>(null);
  const [pages, setPages] = useState<BrochurePage[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Loading experience...');
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState('');
  const [popup, setPopup] = useState<PopupState>(null);
  const [started, setStarted] = useState(false);
  const [activePageHotspots, setActivePageHotspots] = useState<Hotspot[]>([]);
  const [isLandscape, setIsLandscape] = useState(readIsLandscape);
  // Mutable ref so the animation loop can read/write without capturing stale state
  const isLandscapeRef = useRef(readIsLandscape());
  // Debug state — refreshed every frame by the AR animation loop (see startAR) so it
  // always reflects what the code actually sees, even when resize/orientationchange
  // events fail to fire (common in fullscreen on iOS Safari). Remove once confirmed.
  const [dbg, setDbg] = useState({ w: window.innerWidth, h: window.innerHeight, evts: 0, type: 'unknown' });
  const dbgEvtsRef = useRef(0);
  // Throttle debug-panel updates so we don't re-render React 60x/sec.
  const dbgTickRef = useRef(0);

  useEffect(() => {
    const update = () => {
      dbgEvtsRef.current += 1;
      const so = (screen as Screen & { orientation?: { type?: string } }).orientation;
      setDbg({ w: window.innerWidth, h: window.innerHeight, evts: dbgEvtsRef.current, type: so?.type ?? 'n/a' });
      const next = readIsLandscape();
      if (next !== isLandscapeRef.current) {
        isLandscapeRef.current = next;
        setIsLandscape(next);
      }
    };
    const onRotate = () => { update(); setTimeout(update, 150); setTimeout(update, 400); };
    window.addEventListener('orientationchange', onRotate);
    window.addEventListener('resize', update);
    // screen.orientation 'change' — the most reliable signal on mobile, fires even
    // when CSS viewport events do not.
    const so = (screen as Screen & { orientation?: EventTarget & { type?: string } }).orientation;
    const onSOChange = () => update();
    so?.addEventListener?.('change', onSOChange);
    return () => {
      window.removeEventListener('orientationchange', onRotate);
      window.removeEventListener('resize', update);
      so?.removeEventListener?.('change', onSOChange);
    };
  }, []);

  const dotsRef = useRef<Array<{ dot: THREE.Mesh; hotspot: Hotspot }>>([]);
  const lastTapRef = useRef(0);
  const lastPopupOpenRef = useRef(0);
  const listenersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    // Create a clean, isolated container for MindAR directly on the body.
    // position:relative ensures its position:absolute children (video, canvas) are
    // positioned against the container, not the viewport.
    const div = document.createElement('div');
    // position:fixed with inset:0 guarantees full-viewport coverage unconditionally
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;overflow:hidden;background:#000;z-index:0;';
    document.body.appendChild(div);
    arDivRef.current = div;

    // Lock scrolling so React overlays don't scroll behind the AR view
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    loadData();

    return () => {
      mindARRef.current?.stop();
      mindARRef.current = null;
      div.remove();
      arDivRef.current = null;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      listenersRef.current.forEach(fn => fn());
      listenersRef.current = [];
      leaveFullscreen();
    };
  }, []);

  async function loadData() {
    setLoadingMsg('Fetching experience data...');
    const { data: t } = await supabase.from('tenants').select('*').eq('slug', tenantSlug!).maybeSingle();
    setTenant(t);
    const { data: p } = await supabase.from('products').select('*').eq('slug', productSlug!).maybeSingle();
    if (!t || !p) { setError('Experience not found.'); return; }
    setProduct(p);

    const { data: br } = await supabase.from('brochures').select('*').eq('product_id', p.id).eq('status', 'active').maybeSingle();
    if (!br?.mind_file_url) { setError('AR experience is not yet available for this product.'); return; }
    setBrochure(br);

    const { data: pg } = await supabase.from('brochure_pages').select('*').eq('brochure_id', br.id).order('page_index');
    const { data: hs } = await supabase.from('hotspots').select('*')
      .in('page_id', (pg ?? []).map(x => x.id)).order('display_order');
    setPages(pg ?? []);
    setHotspots(hs ?? []);

    await supabase.from('ar_events').insert({ brochure_id: br.id, event_type: 'session_start' });
    setLoading(false);
    setLoadingMsg('');
  }

  async function startAR() {
    if (!brochure?.mind_file_url || !arDivRef.current) return;

    // Request fullscreen FIRST while the user gesture (button click) is still active.
    // Once fullscreen is granted, window.innerWidth/Height = true screen dimensions,
    // so MindAR's _resize() will get the correct viewport and fill the screen completely.
    await enterFullscreen();

    setLoading(true);
    setLoadingMsg('Loading MindAR engine...');
    setLoadProgress(10);

    try {
      const [cr, ctr] = await Promise.all([
        fetch(CDN + 'compiler.worker.prod.js'),
        fetch(CDN + 'controller.worker.prod.js'),
      ]);
      const compilerBlob = URL.createObjectURL(new Blob([await cr.text()], { type: 'application/javascript' }));
      const controllerBlob = URL.createObjectURL(new Blob([await ctr.text()], { type: 'application/javascript' }));

      const _W = window.Worker;
      window.Worker = function (url: string, opts?: WorkerOptions) {
        if (typeof url === 'string' && !url.startsWith('blob:')) {
          if (/compiler[./]worker/.test(url)) url = compilerBlob;
          if (/controller[./]worker/.test(url)) url = controllerBlob;
        }
        return new _W(url, opts);
      } as unknown as typeof Worker;

      setLoadProgress(30);
      setLoadingMsg('Loading AR engine...');
      // mindar-image-three.prod.js bundles TF.js + Three.js + MindAR + Compiler — load it ONCE.
      // Loading mindar-image.prod.js first was causing TF.js to double-initialize, corrupting
      // the WebGL backend and producing hundreds of "kernel already registered" warnings.
      await loadScript(CDN + 'mindar-image-three.prod.js');
      setLoadProgress(75);

      setLoadingMsg('Fetching targets...');
      const mindResponse = await fetch(brochure.mind_file_url);
      const mindBuffer = await mindResponse.arrayBuffer();
      const mindBlob = URL.createObjectURL(new Blob([mindBuffer]));
      setLoadProgress(85);

      setLoadingMsg('Starting camera...');
      const THREE = window.MINDAR.IMAGE.THREE;

      const container = arDivRef.current!;

      // Set explicit pixel dimensions on the container BEFORE MindAR reads them.
      // position:fixed;inset:0 should equal window.innerWidth/Height, but some browsers
      // return 0 or stale values for clientWidth on fixed elements during initialisation.
      // With explicit inline dimensions clientWidth is always the value we set here.
      function syncContainerSize() {
        container.style.width = window.innerWidth + 'px';
        container.style.height = window.innerHeight + 'px';
      }
      syncContainerSize();

      // Register the resize handler NOW (before mindar.start) so it fires BEFORE
      // MindAR's own resize listener and updates clientWidth before MindAR reads it.
      const onWindowResize = () => syncContainerSize();
      window.addEventListener('resize', onWindowResize);
      listenersRef.current.push(() => window.removeEventListener('resize', onWindowResize));

      const mindar = new window.MINDAR.IMAGE.MindARThree({
        container,
        imageTargetSrc: mindBlob,
        maxTrack: 1,
        uiLoading: 'no',
        uiScanning: 'no',
        uiError: 'no',
      });

      mindARRef.current = mindar;
      const { renderer, scene, camera } = mindar;

      const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
      scene.add(light);

      // Sort pages by page_index to match compilation order in the .mind file.
      // Anchors are indexed by position in the sorted array, not by page_index value
      // (page_index may have gaps if pages were deleted after the .mind was compiled).
      const sortedPages = [...pages].sort((a, b) => a.page_index - b.page_index);

      // Shared debounce timer — cleared when any page is found so the bar
      // doesn't disappear during the brief gap between losing one page and
      // finding the same (or another) page.
      let lostTimer: ReturnType<typeof setTimeout> | null = null;

      for (let i = 0; i < sortedPages.length; i++) {
        const page = sortedPages[i];
        const anchor = mindar.addAnchor(i);
        const pageHotspots = hotspots.filter(h => h.page_id === page.id);

        // Load image to get true pixel aspect ratio for coordinate mapping.
        // MindAR's anchor coordinate system:
        //   origin = image centre; x ∈ [-0.5, 0.5] (left→right);
        //   y ∈ [-aspect/2, +aspect/2] (bottom→top); aspect = naturalHeight/naturalWidth
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = page.image_url;
        await new Promise(r => { img.onload = r; img.onerror = r; });
        // Guard against failed image loads (CORS, 404) — NaN aspect would misplace all dots
        const aspect = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 1;

        for (const hotspot of pageHotspots) {
          const x = (hotspot.pos_x / 100) - 0.5;
          const y = (0.5 - hotspot.pos_y / 100) * aspect;

          const cvs = document.createElement('canvas');
          cvs.width = 128; cvs.height = 128;
          const ctx = cvs.getContext('2d')!;
          const color = hotspot.dot_color;

          ctx.clearRect(0, 0, 128, 128);
          // Outer glow ring
          ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2);
          ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.globalAlpha = 0.25; ctx.stroke();
          // Middle ring
          ctx.beginPath(); ctx.arc(64, 64, 38, 0, Math.PI * 2);
          ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.globalAlpha = 0.6; ctx.stroke();
          // Filled centre disc
          ctx.beginPath(); ctx.arc(64, 64, 22, 0, Math.PI * 2);
          ctx.fillStyle = color; ctx.globalAlpha = 1; ctx.fill();
          // Number label
          ctx.font = 'bold 20px sans-serif';
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText((pageHotspots.indexOf(hotspot) + 1).toString(), 64, 64);

          const texture = new THREE.CanvasTexture(cvs);
          const geo = new THREE.PlaneGeometry(0.22, 0.22);
          const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(x, y, 0.001);
          anchor.group.add(mesh);
          dotsRef.current.push({ dot: mesh, hotspot });
        }

        anchor.onTargetFound = async () => {
          // Cancel any pending "lost" timer so the bar doesn't flicker when
          // tracking briefly drops then recovers.
          if (lostTimer) { clearTimeout(lostTimer); lostTimer = null; }
          setActivePageHotspots(pageHotspots);
          if (brochure) {
            await supabase.from('ar_events').insert({
              brochure_id: brochure.id, page_id: page.id, event_type: 'target_found',
            });
          }
        };
        anchor.onTargetLost = () => {
          // 500ms grace period before hiding — prevents flicker from momentary
          // tracking wobble while the user is holding the brochure steadily.
          lostTimer = setTimeout(() => setActivePageHotspots([]), 500);
        };
      }

      setLoadProgress(95);
      await mindar.start();
      setLoadProgress(100);

      setStarted(true);
      setLoading(false);

      window.Worker = _W;
      URL.revokeObjectURL(compilerBlob);
      URL.revokeObjectURL(controllerBlob);

      // MindAR's DOM structure inside the container after start():
      //   <canvas>  WebGL renderer  — appended in constructor, z-index: auto
      //   <div>     CSS3DRenderer   — appended in constructor, z-index: auto (transparent)
      //   <video>   camera feed     — appended during start(), z-index: -2  ← MindAR sets this
      //
      // The video's z-index:-2 keeps it behind the canvases. The WebGL canvas (alpha:true)
      // lets the video show through the transparent background, with dots painted on top.
      //
      // ONLY set individual properties — never style.cssText, which replaces the entire
      // style block and wipes MindAR's z-index:-2 (making the video land on top and hide
      // all dots). Similarly, never reassign the canvas's cssText — renderer.setSize()
      // stores the CSS width/height there, and wiping it makes getBoundingClientRect()
      // return physical-pixel dimensions (width × devicePixelRatio), breaking all tap math.
      const vid = container.querySelector('video') as HTMLVideoElement | null;
      if (vid) {
        // Replace MindAR's manual cover calculation with CSS — simpler and always correct.
        // Position and z-index are intentionally left alone (MindAR already set them right).
        vid.style.top = '0';
        vid.style.left = '0';
        vid.style.width = '100%';
        vid.style.height = '100%';
        vid.style.objectFit = 'cover';
      }

      // Orientation change: update container dimensions first, then let MindAR's own
      // resize handler re-calibrate (it fires on the dispatched resize event below).
      const onOrientationChange = () => setTimeout(() => {
        syncContainerSize();
        window.dispatchEvent(new Event('resize'));
      }, 300);
      window.addEventListener('orientationchange', onOrientationChange);
      listenersRef.current.push(() => window.removeEventListener('orientationchange', onOrientationChange));

      // Pulse animation — scale modulation on the dot meshes.
      // Also re-checks orientation EVERY frame using the Screen Orientation API (not just
      // viewport dimensions), because resize/orientationchange events often don't fire in
      // fullscreen on iOS Safari, leaving the React overlay stuck in the wrong layout.
      // The debug panel is throttled to ~4 Hz so it doesn't trigger 60 React re-renders/sec.
      let tick = 0;
      renderer.setAnimationLoop(() => {
        const nextLandscape = readIsLandscape();
        if (nextLandscape !== isLandscapeRef.current) {
          isLandscapeRef.current = nextLandscape;
          setIsLandscape(nextLandscape);
        }
        dbgTickRef.current += 1;
        if (dbgTickRef.current % 16 === 0) {
          const so = (screen as Screen & { orientation?: { type?: string } }).orientation;
          setDbg({ w: window.innerWidth, h: window.innerHeight, evts: dbgEvtsRef.current, type: so?.type ?? 'n/a' });
        }
        tick += 0.05;
        for (const { dot } of dotsRef.current) {
          dot.scale.setScalar(1 + 0.12 * Math.sin(tick));
        }
        renderer.render(scene, camera);
      });

      // Tap detection: project each dot's world position to screen space and
      // compare against the tap coordinates.
      function onTap(clientX: number, clientY: number) {
        const now = Date.now();
        if (now - lastTapRef.current < 400) return;
        lastTapRef.current = now;

        if (dotsRef.current.length === 0) return;
        const cvs2 = renderer.domElement;
        const rect = cvs2.getBoundingClientRect();
        const THRESHOLD = 120;

        for (const { dot, hotspot } of dotsRef.current) {
          const pos = new THREE.Vector3();
          dot.getWorldPosition(pos);
          pos.project(camera);
          const sx = (pos.x + 1) / 2 * rect.width + rect.left;
          const sy = (-pos.y + 1) / 2 * rect.height + rect.top;
          if (Math.hypot(clientX - sx, clientY - sy) < THRESHOLD) {
            handleHotspotTap(hotspot);
            return;
          }
        }
      }

      // Track touchstart so we can ignore touchend if the finger dragged (scroll gesture).
      let touchStartX = 0, touchStartY = 0;
      const touchStartH = (e: TouchEvent) => {
        const t = e.touches[0];
        if (t) { touchStartX = t.clientX; touchStartY = t.clientY; }
      };
      const touchEndH = (e: TouchEvent) => {
        const t = e.changedTouches[0];
        if (!t) return;
        // Only treat as a tap if the finger barely moved (not a scroll/swipe)
        if (Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY) < 12) {
          onTap(t.clientX, t.clientY);
        }
      };
      // Fallback click handler for non-touch (desktop testing)
      const clickH = (e: MouseEvent) => {
        if (e.sourceCapabilities?.firesTouchEvents) return; // already handled by touchend
        onTap(e.clientX, e.clientY);
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
      setError('Failed to start AR. Please ensure camera access is granted and try again.');
      setLoading(false);
    }
  }

  async function handleHotspotTap(hotspot: Hotspot) {
    lastPopupOpenRef.current = Date.now();
    setPopup({ hotspot, showVideo: false });
    if (brochure) {
      await supabase.from('ar_events').insert({
        brochure_id: brochure.id, hotspot_id: hotspot.id, event_type: 'hotspot_tapped',
      });
    }
  }

  function speakHotspot(hotspot: Hotspot) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(`${hotspot.label}. ${hotspot.description ?? ''}`);
    utter.lang = 'en-IN';
    window.speechSynthesis.speak(utter);
  }

  function closePopup() {
    // The browser fires a synthetic click ~300ms after touchend. If that click lands on
    // the backdrop (which appears the moment the popup opens), it immediately closes the
    // popup — making quick taps look like they don't work. Guard against this by ignoring
    // close requests for 600ms after the popup was opened.
    if (Date.now() - lastPopupOpenRef.current < 600) return;
    window.speechSynthesis.cancel();
    setPopup(null);
  }

  async function exitAR() {
    window.speechSynthesis.cancel();
    mindARRef.current?.stop();
    mindARRef.current = null;
    await leaveFullscreen();
    window.history.back();
  }

  if (error) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
      <AlertCircle className="w-12 h-12 text-slate-600 mb-4" />
      <h2 className="text-lg font-bold text-white mb-2">Experience Unavailable</h2>
      <p className="text-slate-400 text-sm max-w-xs">{error}</p>
    </div>
  );

  const brandColor = tenant?.brand_color ?? '#3b82f6';

  // React renders ONLY the overlay layers (z-index ≥ 20).
  // The AR camera + WebGL canvas live in arDivRef (body child, position:fixed) — see useEffect.
  return (
    <>
      {/* Back / close button — always visible while AR is running */}
      {started && !popup && (
        <button
          onClick={exitAR}
          style={{ position: 'fixed', top: '1rem', left: '1rem', zIndex: 50 }}
          className="w-11 h-11 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-lg active:scale-95 transition-transform">
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
      )}

      {/* DEBUG PANEL — shows live orientation data to diagnose rotation detection.
          Remove this block once the issue is confirmed fixed. */}
      {started && (
        <div style={{ position: 'fixed', bottom: '6rem', left: '0.75rem', zIndex: 60 }}
          className="bg-black/75 text-white rounded-xl px-3 py-2 text-xs font-mono leading-relaxed pointer-events-none select-none">
          <div>VP: {dbg.w} x {dbg.h}</div>
          <div>orientation: {dbg.type}</div>
          <div>isLandscape: {isLandscape ? 'YES' : 'NO'}</div>
          <div>Events: {dbg.evts}</div>
        </div>
      )}
      {/* Loading overlay */}
      {loading && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 20 }}
          className="bg-slate-950 flex flex-col items-center justify-center px-8">
          {tenant?.logo_url && (
            <img src={tenant.logo_url} alt={tenant.name} className="h-12 object-contain mb-4 opacity-80" />
          )}
          <h1 className="text-white font-bold text-xl mb-1">{product?.name ?? 'AR Experience'}</h1>
          <p className="text-slate-400 text-sm mb-8">{tenant?.name}</p>
          <div className="w-full max-w-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">{loadingMsg}</span>
              <span className="text-xs text-slate-400">{loadProgress}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div className="h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${loadProgress}%`, backgroundColor: brandColor }} />
            </div>
          </div>
          {!started && loadProgress === 0 && (
            <button onClick={startAR}
              className="mt-8 text-white font-semibold px-8 py-3 rounded-full text-sm shadow-lg transition active:scale-95"
              style={{ backgroundColor: brandColor }}>
              Start AR Experience
            </button>
          )}
        </div>
      )}

      {/* Start screen — data loaded, AR not yet started */}
      {!loading && !started && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 20 }}
          className="bg-slate-950 flex flex-col items-center justify-center px-8">
          {tenant?.logo_url && (
            <img src={tenant.logo_url} alt={tenant.name} className="h-12 object-contain mb-4 opacity-80" />
          )}
          <h1 className="text-white font-bold text-xl mb-1">{product?.name ?? 'AR Experience'}</h1>
          <p className="text-slate-400 text-sm mb-2">{tenant?.name}</p>
          <p className="text-slate-500 text-xs mb-8 text-center max-w-xs">
            Point your camera at the printed brochure to discover interactive AR hotspots
          </p>
          <button onClick={startAR}
            className="text-white font-semibold px-8 py-3.5 rounded-full text-sm shadow-lg transition active:scale-95"
            style={{ backgroundColor: brandColor }}>
            Start AR Experience
          </button>
          <p className="text-slate-600 text-xs mt-4">Camera access required</p>
        </div>
      )}

      {/* Hotspot popup
          Portrait: slides up as a bottom sheet (max 70 vh)
          Landscape: slides in from the right as a side drawer (full height, fixed width) */}
      {popup && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 30 }}
          className={`flex ${isLandscape ? 'flex-row items-stretch justify-end' : 'flex-col justify-end'}`}
        >
          <div className="bg-black/40 absolute inset-0" onClick={closePopup} />
          <div className={`relative bg-white shadow-2xl overflow-y-auto ${
            isLandscape
              ? 'rounded-l-2xl h-full w-80 max-w-[70vw]'
              : 'rounded-t-2xl w-full max-h-[70vh]'
          }`}>
            {/* Colour stripe: top in portrait, left edge in landscape */}
            {isLandscape ? (
              <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ backgroundColor: brandColor }} />
            ) : (
              <div className="h-1 rounded-t-2xl" style={{ backgroundColor: brandColor }} />
            )}
            <div className={`p-5 ${isLandscape ? 'pl-6' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <h2 className="text-lg font-bold text-slate-900 pr-6">{popup.hotspot.label}</h2>
                <button onClick={closePopup}
                  className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {popup.hotspot.description && (
                <p className="text-slate-600 text-sm leading-relaxed mb-4">{popup.hotspot.description}</p>
              )}

              {popup.hotspot.image_url && (
                <div className="mb-4 rounded-xl overflow-hidden border border-slate-100">
                  <img src={popup.hotspot.image_url} alt={popup.hotspot.label}
                    className="w-full object-contain max-h-48" />
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {popup.hotspot.audio_type !== 'none' && (
                  <button
                    onClick={() => {
                      if (popup.hotspot.audio_type === 'upload' && popup.hotspot.audio_url) {
                        new Audio(popup.hotspot.audio_url).play();
                      } else {
                        speakHotspot(popup.hotspot);
                      }
                    }}
                    className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full text-white transition active:scale-95"
                    style={{ backgroundColor: brandColor }}>
                    <Volume2 className="w-4 h-4" /> Listen
                  </button>
                )}
                {popup.hotspot.video_type !== 'none' && !popup.showVideo && (
                  <button
                    onClick={() => setPopup(p => p ? { ...p, showVideo: true } : p)}
                    className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full bg-slate-900 text-white transition active:scale-95">
                    <Play className="w-4 h-4" /> Watch
                  </button>
                )}
              </div>

              {popup.showVideo && popup.hotspot.video_type !== 'none' && (
                <div className="mt-4 rounded-xl overflow-hidden bg-black aspect-video">
                  {popup.hotspot.video_type === 'youtube' ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${extractYouTubeId(popup.hotspot.video_ref ?? '')}?autoplay=1&rel=0&playsinline=1&enablejsapi=1`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full border-0"
                    />
                  ) : (
                    <video
                      src={popup.hotspot.video_ref ?? ''}
                      controls
                      autoPlay
                      playsInline
                      className="w-full h-full"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hotspot quick-access bar
          Portrait  → bottom-centre horizontal pill, slides up/down.
          Landscape → right-edge vertical pill, slides left/right.
          The outer wrapper is pointer-events-none so it never blocks AR touches when hidden. */}
      {started && (() => {
        const show = activePageHotspots.length > 0 && !popup;
        const portraitStyle: React.CSSProperties = {
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 25,
          transform: show ? 'translateY(0)' : 'translateY(120%)',
        };
        const landscapeStyle: React.CSSProperties = {
          position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 25,
          transform: show ? 'translateX(0)' : 'translateX(120%)',
        };
        return (
          <div
            style={isLandscape ? landscapeStyle : portraitStyle}
            className="flex pointer-events-none transition-transform duration-300 ease-out"
          >
            {isLandscape ? (
              /* Landscape: vertically centred column on the right edge */
              <div className="flex flex-col items-end justify-center h-full pr-4 gap-0">
                <div className="flex flex-col items-center gap-3 bg-black/55 backdrop-blur-md rounded-full px-3 py-5 shadow-2xl border border-white/10 pointer-events-auto">
                  {activePageHotspots.map((hotspot, idx) => (
                    <button
                      key={hotspot.id}
                      onClick={() => handleHotspotTap(hotspot)}
                      className="relative w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg active:scale-90 transition-transform select-none"
                      style={{ backgroundColor: hotspot.dot_color }}
                    >
                      <span className="absolute inset-0 rounded-full opacity-40 animate-ping" style={{ backgroundColor: hotspot.dot_color }} />
                      <span className="relative z-10">{idx + 1}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Portrait: horizontally centred row at the bottom */
              <div className="flex flex-col items-center w-full pb-10 px-6">
                <p className="text-white/60 text-xs mb-2 font-medium tracking-wide select-none">Tap a hotspot</p>
                <div className="flex items-center gap-3 bg-black/55 backdrop-blur-md rounded-full px-5 py-3 shadow-2xl border border-white/10 pointer-events-auto">
                  {activePageHotspots.map((hotspot, idx) => (
                    <button
                      key={hotspot.id}
                      onClick={() => handleHotspotTap(hotspot)}
                      className="relative w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg active:scale-90 transition-transform select-none"
                      style={{ backgroundColor: hotspot.dot_color }}
                    >
                      <span className="absolute inset-0 rounded-full opacity-40 animate-ping" style={{ backgroundColor: hotspot.dot_color }} />
                      <span className="relative z-10">{idx + 1}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </>
  );
}
