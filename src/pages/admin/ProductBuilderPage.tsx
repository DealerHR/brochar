import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from '../../lib/router';
import { supabase, Brochure, BrochurePage, Hotspot, Product, Tenant } from '../../lib/supabase';
import {
  ArrowLeft, Upload, FileImage, Trash2, Plus, X, Volume2, Video, Save,
  Zap, CheckCircle2, FilePlus, ExternalLink, ImageIcon
} from 'lucide-react';

declare global {
  interface Window {
    pdfjsLib: { getDocument: (opts: unknown) => { promise: Promise<unknown> } };
    MINDAR: { IMAGE: { Compiler: new () => { compileImageTargets: (imgs: HTMLImageElement[], cb: (p: number) => void) => Promise<unknown> } } };
    Worker: new (url: string, opts?: WorkerOptions) => Worker;
  }
}

type HotspotForm = {
  label: string;
  description: string;
  dot_color: string;
  audio_type: 'tts' | 'upload' | 'none';
  audio_url: string;
  video_type: 'none' | 'youtube' | 'upload';
  video_ref: string;
  image_url: string;
  display_order: number;
};

const CDN = 'https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.1.4/dist/';

function loadScript(src: string): Promise<void> {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = () => res(); s.onerror = rej;
    document.head.appendChild(s);
  });
}

export default function ProductBuilderPage() {
  const { clientId, productId } = useParams();
  const navigate = useNavigate();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [brochure, setBrochure] = useState<Brochure | null>(null);
  const [pages, setPages] = useState<BrochurePage[]>([]);
  const [hotspots, setHotspots] = useState<Record<string, Hotspot[]>>({});
  const [selectedPage, setSelectedPage] = useState<BrochurePage | null>(null);
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null);
  const [hotspotForm, setHotspotForm] = useState<HotspotForm | null>(null);
  const [placingMode, setPlacingMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string[]>([]);
  const [compiling, setCompiling] = useState(false);
  const [compileProgress, setCompileProgress] = useState(0);
  const [savingHotspot, setSavingHotspot] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [hotspotImageFile, setHotspotImageFile] = useState<File | null>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const pageFileInputRef = useRef<HTMLInputElement>(null);
  // Tracks drag state without causing re-renders on every mousemove
  const dragRef = useRef<{ hotspotId: string; pageId: string; moved: boolean } | null>(null);

  useEffect(() => { load(); }, [productId]);

  useEffect(() => {
    setSelectedHotspot(null);
    setHotspotForm(null);
    setAudioFile(null);
    setVideoFile(null);
    setHotspotImageFile(null);
  }, [selectedPage?.id]);

  async function load() {
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tenants').select('*').eq('id', clientId!).maybeSingle(),
      supabase.from('products').select('*').eq('id', productId!).maybeSingle(),
    ]);
    setTenant(t);
    setProduct(p);

    const { data: br } = await supabase.from('brochures').select('*').eq('product_id', productId!).maybeSingle();
    setBrochure(br);

    if (br) await loadPages(br.id);
    setLoading(false);
  }

  async function loadPages(brochureId: string) {
    const { data: pg } = await supabase.from('brochure_pages').select('*').eq('brochure_id', brochureId).order('page_index');
    const ps = pg ?? [];
    setPages(ps);
    if (ps.length > 0 && !selectedPage) setSelectedPage(ps[0]);
    await loadHotspots(ps.map(p => p.id));
  }

  async function loadHotspots(pageIds: string[]) {
    if (!pageIds.length) return;
    const { data } = await supabase.from('hotspots').select('*').in('page_id', pageIds).order('display_order');
    const map: Record<string, Hotspot[]> = {};
    for (const h of data ?? []) {
      if (!map[h.page_id]) map[h.page_id] = [];
      map[h.page_id].push(h);
    }
    setHotspots(map);
  }

  async function ensureBrochure(): Promise<Brochure> {
    if (brochure) return brochure;
    const { data } = await supabase.from('brochures').insert({ product_id: productId, title: product?.name ?? 'Brochure', status: 'draft' }).select().single();
    setBrochure(data!);
    return data!;
  }

  async function handleFileUpload(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    setUploadProgress([]);
    const br = await ensureBrochure();
    const existingCount = pages.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const pageIndex = existingCount + i;
      setUploadProgress(p => [...p, `Uploading page ${pageIndex + 1}...`]);

      if (file.type === 'application/pdf') {
        await uploadPDF(file, br.id, pageIndex);
      } else {
        await uploadImage(file, br.id, pageIndex);
      }
    }
    await loadPages(br.id);
    setUploading(false);
    setUploadProgress([]);
    // Reset the input so selecting the same file again fires onChange next time.
    if (pageFileInputRef.current) pageFileInputRef.current.value = '';
  }

  async function uploadImage(file: File, brochureId: string, pageIndex: number) {
    const path = `${clientId}/${productId}/pages/page_${pageIndex}.jpg`;
    await supabase.storage.from('brochure-assets').upload(path, file, { upsert: true, contentType: 'image/jpeg' });
    const { data: urlData } = supabase.storage.from('brochure-assets').getPublicUrl(path);
    // Append a timestamp so the CDN serves the freshly-uploaded file instead of a stale
    // cached version when the same path is reused after deletion and re-upload.
    const imageUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    await supabase.from('brochure_pages').insert({ brochure_id: brochureId, page_index: pageIndex, image_url: imageUrl });
  }

  async function uploadPDF(file: File, brochureId: string, startIndex: number) {
    if (!window.pdfjsLib) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = () => res(); s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdfData = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: pdfData }).promise as { numPages: number; getPage: (n: number) => Promise<{ getViewport: (opts: { scale: number }) => { width: number; height: number }; render: (opts: unknown) => { promise: Promise<void> } }> };

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const pageIndex = startIndex + pageNum - 1;
      setUploadProgress(p => [...p.slice(0, -1), `Converting PDF page ${pageNum}/${pdf.numPages}...`]);
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 150 / 72 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/jpeg', 0.9));
      await uploadImage(new File([blob], `page_${pageIndex}.jpg`), brochureId, pageIndex);
    }
  }

  async function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    // Fix 1: ignore click if a drag just finished
    if (dragRef.current?.moved) return;
    if (!placingMode || !selectedPage || !brochure) return;
    const rect = imageRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const { data } = await supabase.from('hotspots').insert({
      page_id: selectedPage.id,
      label: 'New Hotspot',
      description: '',
      pos_x: parseFloat(x.toFixed(2)),
      pos_y: parseFloat(y.toFixed(2)),
      dot_color: '#D8315B',
      audio_type: 'tts',
      video_type: 'none',
      display_order: (hotspots[selectedPage.id]?.length ?? 0),
    }).select().single();
    if (data) {
      setHotspots(h => ({ ...h, [selectedPage.id]: [...(h[selectedPage.id] ?? []), data] }));
      openHotspot(data);
    }
    setPlacingMode(false);
  }

  function openHotspot(h: Hotspot) {
    setSelectedHotspot(h);
    setAudioFile(null);
    setVideoFile(null);
    setHotspotImageFile(null);
    setHotspotForm({
      label: h.label,
      description: h.description ?? '',
      dot_color: h.dot_color,
      audio_type: h.audio_type,
      audio_url: h.audio_url ?? '',
      video_type: h.video_type,
      video_ref: h.video_ref ?? '',
      image_url: h.image_url ?? '',
      display_order: h.display_order,
    });
  }

  // Fix 1: drag handlers for repositioning hotspots
  function onHotspotPointerDown(e: React.PointerEvent<HTMLButtonElement>, h: Hotspot) {
    if (placingMode) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { hotspotId: h.id, pageId: h.page_id, moved: false };
  }

  function onHotspotPointerMove(e: React.PointerEvent<HTMLButtonElement>, h: Hotspot) {
    if (!dragRef.current || dragRef.current.hotspotId !== h.id || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const nx = Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100));
    const ny = Math.max(2, Math.min(98, ((e.clientY - rect.top) / rect.height) * 100));
    dragRef.current.moved = true;
    setHotspots(prev => ({
      ...prev,
      [h.page_id]: (prev[h.page_id] ?? []).map(item =>
        item.id === h.id ? { ...item, pos_x: parseFloat(nx.toFixed(2)), pos_y: parseFloat(ny.toFixed(2)) } : item
      ),
    }));
  }

  async function onHotspotPointerUp(e: React.PointerEvent<HTMLButtonElement>, h: Hotspot) {
    if (!dragRef.current || dragRef.current.hotspotId !== h.id) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const wasMoved = dragRef.current.moved;
    dragRef.current = null;

    if (wasMoved) {
      // persist final position
      const current = hotspots[h.page_id]?.find(item => item.id === h.id);
      if (current) {
        await supabase.from('hotspots').update({ pos_x: current.pos_x, pos_y: current.pos_y }).eq('id', h.id);
      }
    } else {
      openHotspot(h);
    }
  }

  async function saveHotspot() {
    if (!selectedHotspot || !hotspotForm) return;
    setSavingHotspot(true);
    let audio_url = hotspotForm.audio_url;
    let video_ref = hotspotForm.video_ref;
    let image_url = hotspotForm.image_url;

    if (audioFile && hotspotForm.audio_type === 'upload') {
      const path = `${clientId}/${productId}/audio/${selectedHotspot.id}.mp3`;
      await supabase.storage.from('brochure-assets').upload(path, audioFile, { upsert: true });
      const { data } = supabase.storage.from('brochure-assets').getPublicUrl(path);
      audio_url = data.publicUrl;
    }
    if (videoFile && hotspotForm.video_type === 'upload') {
      const path = `${clientId}/${productId}/video/${selectedHotspot.id}.mp4`;
      await supabase.storage.from('brochure-assets').upload(path, videoFile, { upsert: true });
      const { data } = supabase.storage.from('brochure-assets').getPublicUrl(path);
      video_ref = data.publicUrl;
    }
    if (hotspotImageFile) {
      const ext = hotspotImageFile.name.split('.').pop() ?? 'jpg';
      const path = `${clientId}/${productId}/hotspot-images/${selectedHotspot.id}.${ext}`;
      await supabase.storage.from('brochure-assets').upload(path, hotspotImageFile, { upsert: true });
      const { data } = supabase.storage.from('brochure-assets').getPublicUrl(path);
      image_url = data.publicUrl;
    }

    // The user may have dragged the dot while the form was open. selectedHotspot is a
    // snapshot from when the form opened, so its pos_x/pos_y may be stale. Read the
    // current position from the live hotspots state so dragging + saving keeps the dot
    // in the dragged position rather than snapping it back to where it started.
    const liveHotspot = hotspots[selectedHotspot.page_id]?.find(h => h.id === selectedHotspot.id);
    const pos_x = liveHotspot?.pos_x ?? selectedHotspot.pos_x;
    const pos_y = liveHotspot?.pos_y ?? selectedHotspot.pos_y;

    await supabase.from('hotspots').update({ ...hotspotForm, audio_url, video_ref, image_url }).eq('id', selectedHotspot.id);
    const updated = { ...selectedHotspot, ...hotspotForm, audio_url, video_ref, image_url, pos_x, pos_y };
    setHotspots(h => ({
      ...h,
      [selectedHotspot.page_id]: (h[selectedHotspot.page_id] ?? []).map(item => item.id === selectedHotspot.id ? updated : item),
    }));
    setSavingHotspot(false);
    setSelectedHotspot(null);
    setHotspotForm(null);
    setAudioFile(null);
    setVideoFile(null);
    setHotspotImageFile(null);
  }

  async function deleteHotspot() {
    if (!selectedHotspot) return;
    await supabase.from('hotspots').delete().eq('id', selectedHotspot.id);
    setHotspots(h => ({
      ...h,
      [selectedHotspot.page_id]: (h[selectedHotspot.page_id] ?? []).filter(item => item.id !== selectedHotspot.id),
    }));
    setSelectedHotspot(null);
    setHotspotForm(null);
  }

  async function deletePage(page: BrochurePage) {
    await supabase.from('brochure_pages').delete().eq('id', page.id);
    setPages(p => p.filter(x => x.id !== page.id));
    if (selectedPage?.id === page.id) setSelectedPage(pages.find(p => p.id !== page.id) ?? null);
  }

  async function compileTargets() {
    if (pages.length === 0) return alert('Upload at least one page first.');
    setCompiling(true);
    setCompileProgress(0);
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

      // Fix 5: only load mindar-image.prod.js (compiler only, no THREE.js = no kernel re-registration warnings)
      if (!document.querySelector('script[src*="mindar-image.prod.js"]')) {
        await loadScript(CDN + 'mindar-image.prod.js');
      }
      const SavedCompiler = window.MINDAR.IMAGE.Compiler;

      const imgs = await Promise.all(pages.map(pg => new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => res(img); img.onerror = rej;
        img.src = pg.image_url;
      })));

      const compiler = new SavedCompiler();
      const totalImages = imgs.length;
      // Fix 4: MindAR reports progress as 0..N (one 0-1 cycle per image), normalize to 0-100
      await compiler.compileImageTargets(imgs, (prog: number) => {
        setCompileProgress(Math.min(100, Math.round((prog / totalImages) * 100)));
      });

      const exportedBuffer = await (compiler as unknown as { exportData: () => Promise<ArrayBuffer> }).exportData();
      const mindBlob = new Blob([exportedBuffer], { type: 'application/octet-stream' });
      const mindFile = new File([mindBlob], 'targets.mind');

      const path = `${clientId}/${productId}/targets.mind`;
      await supabase.storage.from('brochure-assets').upload(path, mindFile, { upsert: true });
      const { data: urlData } = supabase.storage.from('brochure-assets').getPublicUrl(path);

      const br = await ensureBrochure();
      await supabase.from('brochures').update({ mind_file_url: urlData.publicUrl, compiled_at: new Date().toISOString() }).eq('id', br.id);
      await load();

      window.Worker = _W;
      URL.revokeObjectURL(compilerBlob);
      URL.revokeObjectURL(controllerBlob);
    } catch (err) {
      console.error(err);
      alert('Compilation failed. See console for details.');
    } finally {
      setCompiling(false);
      setCompileProgress(0);
    }
  }

  async function setStatus(status: 'draft' | 'active' | 'inactive') {
    const br = brochure ?? await ensureBrochure();
    await supabase.from('brochures').update({ status }).eq('id', br.id);
    setBrochure(b => b ? { ...b, status } : null);
  }

  const pageHotspots = selectedPage ? (hotspots[selectedPage.id] ?? []) : [];

  if (loading) return <div className="animate-pulse h-64 bg-white rounded-2xl border border-slate-100" />;

  const statusColors: Record<string, string> = {
    draft: 'bg-amber-50 text-amber-600 border-amber-200',
    active: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    inactive: 'bg-slate-100 text-slate-500 border-slate-200',
  };

  return (
    <div>
      <button onClick={() => navigate(`/admin/clients/${clientId}`)}
        className="flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-brand-navy mb-4 transition">
        <ArrowLeft className="w-4 h-4" /> Back to {tenant?.name ?? 'client'}
      </button>

      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-brand-cerise font-bold text-xs uppercase tracking-widest mb-0.5">Builder</p>
          <h1 className="text-2xl font-black text-brand-navy truncate">{product?.name}</h1>
          <p className="text-slate-400 text-sm">AR Brochure Editor</p>
        </div>

        {brochure && (
          <span className={`text-xs px-2.5 py-1 rounded-full font-bold border uppercase tracking-wide ${statusColors[brochure.status]}`}>
            {brochure.status}
          </span>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {brochure && (
            <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
              {(['draft', 'active', 'inactive'] as const).map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-bold capitalize transition ${brochure.status === s ? 'bg-brand-navy text-white shadow-sm' : 'text-slate-500 hover:text-brand-navy'}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={compileTargets}
            disabled={compiling || pages.length === 0}
            className="inline-flex items-center gap-2 bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-50 text-white text-sm font-black px-4 py-2.5 rounded-xl transition shadow-lg shadow-brand-navy/20"
          >
            <Zap className="w-4 h-4 text-brand-cerise" />
            {compiling ? `Compiling ${compileProgress}%` : 'Compile Targets'}
          </button>
        </div>
      </div>

      {compiling && (
        <div className="mb-4 bg-brand-navy/5 border border-brand-navy/15 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-brand-cerise animate-pulse" />
            <span className="text-sm font-bold text-brand-navy">Compiling image targets... {compileProgress}%</span>
          </div>
          {/* Fix 4: overflow-hidden on container prevents bar escaping bounds */}
          <div className="w-full bg-brand-cream rounded-full h-2 overflow-hidden">
            <div className="bg-brand-cerise h-2 rounded-full transition-all duration-300" style={{ width: `${compileProgress}%` }} />
          </div>
        </div>
      )}

      {brochure?.compiled_at && (
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          Targets compiled {new Date(brochure.compiled_at).toLocaleString()}
        </div>
      )}

      <div className="flex gap-4 h-[calc(100vh-300px)] min-h-[500px]">
        {/* Left: page list */}
        <div className="w-52 flex-shrink-0 flex flex-col gap-2 overflow-y-auto pr-1">
          <label className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-xl p-3 cursor-pointer transition text-sm font-bold ${uploading ? 'border-brand-cerise/40 text-brand-cerise bg-brand-cerise/5' : 'border-slate-200 text-slate-400 hover:border-brand-olive hover:text-brand-olive hover:bg-brand-cream/30'}`}>
            {uploading ? (
              <span className="text-xs">{uploadProgress[uploadProgress.length - 1] ?? 'Uploading...'}</span>
            ) : (
              <><FilePlus className="w-4 h-4" /> Add Pages</>
            )}
            <input ref={pageFileInputRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
              onChange={e => handleFileUpload(e.target.files ? Array.from(e.target.files) : [])}
              disabled={uploading} />
          </label>

          {pages.map(page => (
            <div
              key={page.id}
              onClick={() => setSelectedPage(page)}
              className={`relative group rounded-xl border-2 overflow-hidden cursor-pointer transition flex-shrink-0 ${selectedPage?.id === page.id ? 'border-brand-cerise shadow-md shadow-brand-cerise/10' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <img src={page.image_url} alt={`Page ${page.page_index + 1}`} className="w-full aspect-[3/4] object-cover" />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-brand-navy/80 to-transparent p-2">
                <div className="flex items-center justify-between">
                  <span className="text-white text-xs font-bold">Page {page.page_index + 1}</span>
                  <span className="text-white text-xs bg-white/20 rounded-full px-1.5 font-bold">{(hotspots[page.id] ?? []).length}</span>
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deletePage(page); }}
                className="absolute top-1 right-1 bg-brand-cerise text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Center: page editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedPage ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-bold text-brand-navy">Page {selectedPage.page_index + 1}</span>
                <p className="text-xs text-slate-400 ml-1">Drag hotspots to reposition</p>
                <button
                  onClick={() => setPlacingMode(!placingMode)}
                  className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-bold transition ml-auto ${placingMode ? 'bg-brand-cerise text-white shadow-sm' : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-brand-cerise hover:text-brand-cerise'}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {placingMode ? 'Click to place hotspot' : 'Add Hotspot'}
                </button>
              </div>
              <div
                ref={imageRef}
                className={`relative flex-1 rounded-2xl overflow-hidden bg-brand-navy ${placingMode ? 'cursor-crosshair' : 'cursor-default'}`}
                onClick={handleImageClick}
              >
                <img
                  src={selectedPage.image_url}
                  alt={`Page ${selectedPage.page_index + 1}`}
                  className="w-full h-full object-contain select-none pointer-events-none"
                  draggable={false}
                />
                {/* Fix 1: draggable hotspot dots */}
                {pageHotspots.map(h => (
                  <button
                    key={h.id}
                    onClick={e => e.stopPropagation()}
                    onPointerDown={e => onHotspotPointerDown(e, h)}
                    onPointerMove={e => onHotspotPointerMove(e, h)}
                    onPointerUp={e => onHotspotPointerUp(e, h)}
                    style={{ left: `${h.pos_x}%`, top: `${h.pos_y}%`, transform: 'translate(-50%, -50%)', backgroundColor: h.dot_color }}
                    className={`absolute w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none transition-shadow ${selectedHotspot?.id === h.id ? 'ring-2 ring-white ring-offset-2' : 'hover:shadow-xl'}`}
                  >
                    <span className="text-white text-xs font-black pointer-events-none">{pageHotspots.indexOf(h) + 1}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 rounded-2xl bg-brand-cream/30 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
              <FileImage className="w-10 h-10 mb-3 text-brand-olive/40" />
              <p className="text-sm font-medium">Upload pages to get started</p>
            </div>
          )}
        </div>

        {/* Right: hotspot editor */}
        {selectedHotspot && hotspotForm && (
          <div className="w-80 flex-shrink-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <span className="font-black text-brand-navy text-sm">Hotspot Editor</span>
              <button onClick={() => { setSelectedHotspot(null); setHotspotForm(null); }} className="text-slate-400 hover:text-brand-navy transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-brand-navy mb-1.5">Label</label>
                <input value={hotspotForm.label} onChange={e => setHotspotForm(f => f ? { ...f, label: e.target.value } : f)}
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-navy transition" />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-navy mb-1.5">Description</label>
                <textarea value={hotspotForm.description} onChange={e => setHotspotForm(f => f ? { ...f, description: e.target.value } : f)}
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-navy transition resize-none" rows={3} />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-navy mb-1.5">Dot Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={hotspotForm.dot_color} onChange={e => setHotspotForm(f => f ? { ...f, dot_color: e.target.value } : f)}
                    className="w-10 h-10 rounded-xl border-2 border-slate-200 cursor-pointer p-0.5" />
                  <input value={hotspotForm.dot_color} onChange={e => setHotspotForm(f => f ? { ...f, dot_color: e.target.value } : f)}
                    className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand-navy transition" />
                </div>
              </div>

              {/* Audio section */}
              <div>
                <label className="block text-xs font-bold text-brand-navy mb-1.5">
                  <Volume2 className="w-3.5 h-3.5 inline mr-1" />Audio
                </label>
                <div className="space-y-1.5">
                  {(['tts', 'upload', 'none'] as const).map(t => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={hotspotForm.audio_type === t} onChange={() => setHotspotForm(f => f ? { ...f, audio_type: t } : f)} className="accent-brand-cerise" />
                      <span className="text-sm text-slate-700 font-medium">{t === 'tts' ? 'Text to Speech' : t === 'upload' ? 'Upload Audio' : 'None'}</span>
                    </label>
                  ))}
                </div>
                {hotspotForm.audio_type === 'upload' && (
                  <div className="mt-2 space-y-1.5">
                    {/* Fix 2: show existing audio with delete option */}
                    {hotspotForm.audio_url && !audioFile && (
                      <div className="flex items-center gap-2 bg-brand-olive/5 border border-brand-olive/20 rounded-xl px-3 py-2">
                        <Volume2 className="w-3.5 h-3.5 text-brand-olive flex-shrink-0" />
                        <a href={hotspotForm.audio_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-brand-olive font-medium flex-1 truncate hover:underline flex items-center gap-1">
                          Current audio <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                        <button onClick={() => setHotspotForm(f => f ? { ...f, audio_url: '' } : f)}
                          className="text-brand-cerise hover:text-brand-cerise/70 transition flex-shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-sm text-brand-cerise font-bold cursor-pointer hover:text-brand-cerise/80 transition">
                      <Upload className="w-4 h-4" />
                      {audioFile ? audioFile.name : hotspotForm.audio_url ? 'Replace audio' : 'Upload MP3'}
                      <input type="file" accept="audio/*" className="hidden" onChange={e => setAudioFile(e.target.files?.[0] ?? null)} />
                    </label>
                    {audioFile && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="truncate flex-1">{audioFile.name}</span>
                        <button onClick={() => setAudioFile(null)} className="text-brand-cerise flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Video section */}
              <div>
                <label className="block text-xs font-bold text-brand-navy mb-1.5">
                  <Video className="w-3.5 h-3.5 inline mr-1" />Video
                </label>
                <div className="space-y-1.5">
                  {(['none', 'youtube', 'upload'] as const).map(t => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={hotspotForm.video_type === t} onChange={() => setHotspotForm(f => f ? { ...f, video_type: t } : f)} className="accent-brand-cerise" />
                      <span className="text-sm text-slate-700 font-medium">{t === 'none' ? 'None' : t === 'youtube' ? 'YouTube' : 'Upload Video'}</span>
                    </label>
                  ))}
                </div>
                {hotspotForm.video_type === 'youtube' && (
                  <input value={hotspotForm.video_ref} onChange={e => setHotspotForm(f => f ? { ...f, video_ref: e.target.value } : f)}
                    className="mt-2 w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-navy transition"
                    placeholder="https://youtube.com/watch?v=..." />
                )}
                {hotspotForm.video_type === 'upload' && (
                  <div className="mt-2 space-y-1.5">
                    {/* Fix 2: show existing video with delete option */}
                    {hotspotForm.video_ref && !videoFile && (
                      <div className="flex items-center gap-2 bg-brand-sky/5 border border-brand-sky/20 rounded-xl px-3 py-2">
                        <Video className="w-3.5 h-3.5 text-brand-sky flex-shrink-0" />
                        <a href={hotspotForm.video_ref} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-brand-sky font-medium flex-1 truncate hover:underline flex items-center gap-1">
                          Current video <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                        <button onClick={() => setHotspotForm(f => f ? { ...f, video_ref: '' } : f)}
                          className="text-brand-cerise hover:text-brand-cerise/70 transition flex-shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-sm text-brand-cerise font-bold cursor-pointer hover:text-brand-cerise/80 transition">
                      <Upload className="w-4 h-4" />
                      {videoFile ? videoFile.name : hotspotForm.video_ref ? 'Replace video' : 'Upload Video'}
                      <input type="file" accept="video/*" className="hidden" onChange={e => setVideoFile(e.target.files?.[0] ?? null)} />
                    </label>
                    {videoFile && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="truncate flex-1">{videoFile.name}</span>
                        <button onClick={() => setVideoFile(null)} className="text-brand-cerise flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Image section */}
              <div>
                <label className="block text-xs font-bold text-brand-navy mb-1.5">
                  <ImageIcon className="w-3.5 h-3.5 inline mr-1" />Display Image
                </label>
                {hotspotForm.image_url && !hotspotImageFile && (
                  <div className="mb-2 relative rounded-xl overflow-hidden border-2 border-slate-200 group">
                    <img src={hotspotForm.image_url} alt="Hotspot" className="w-full h-28 object-cover" />
                    <button
                      onClick={() => setHotspotForm(f => f ? { ...f, image_url: '' } : f)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-brand-cerise text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {hotspotImageFile && (
                  <div className="mb-2 relative rounded-xl overflow-hidden border-2 border-brand-cerise/40 group">
                    <img src={URL.createObjectURL(hotspotImageFile)} alt="Preview" className="w-full h-28 object-cover" />
                    <button
                      onClick={() => setHotspotImageFile(null)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-brand-cerise text-white flex items-center justify-center">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm text-brand-cerise font-bold cursor-pointer hover:text-brand-cerise/80 transition">
                  <Upload className="w-4 h-4" />
                  {hotspotImageFile ? hotspotImageFile.name : hotspotForm.image_url ? 'Replace image' : 'Upload Image'}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => setHotspotImageFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={saveHotspot} disabled={savingHotspot}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 bg-brand-navy hover:bg-brand-navy/90 text-white text-sm font-black py-2.5 rounded-xl transition shadow-sm">
                  <Save className="w-3.5 h-3.5" /> {savingHotspot ? 'Saving...' : 'Save'}
                </button>
                <button onClick={deleteHotspot}
                  className="inline-flex items-center justify-center w-10 h-10 bg-brand-cerise/10 hover:bg-brand-cerise/20 text-brand-cerise rounded-xl transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
