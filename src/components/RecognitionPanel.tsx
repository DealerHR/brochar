import { useState } from 'react';
import { supabase, Product, ReferenceImage, ProductView, PRODUCT_VIEWS, normaliseReference } from '../lib/supabase';
import { uploadFile, removeFiles, pathFromPublicUrl } from '../lib/storage';
import { fileTooLarge, MAX_IMAGE_BYTES } from '../lib/validation';
import { compressImage, compressFromUrl, IMAGE_PRESETS, formatKB } from '../lib/image';
import { ScanSearch, Upload, Trash2, Check, Minimize2 } from 'lucide-react';

const MAX_PHOTOS = 12;
const PHOTO_VIEWS = PRODUCT_VIEWS.filter(v => v.value !== 'any');

/**
 * What the floor app needs to recognise this product from a photo: reference
 * photos tagged by side, and a note on where the identifying label is.
 * Saved on the product row.
 */
export default function RecognitionPanel({ product, storageBase, editable, onError, onSaved }: {
  product: Product; storageBase: string; editable: boolean; onError: (m: string) => void; onSaved: (p: Product) => void;
}) {
  const [hint, setHint] = useState(product.label_hint ?? '');
  const [enabled, setEnabled] = useState(product.floor_enabled ?? true);
  const [images, setImages] = useState<ReferenceImage[]>((product.reference_images ?? []).map(normaliseReference));
  const [busy, setBusy] = useState('');
  const [saved, setSaved] = useState(false);

  const dirty = hint !== (product.label_hint ?? '') || enabled !== (product.floor_enabled ?? true);

  async function persist(next: Partial<Product>) {
    const { data, error } = await supabase.from('products').update(next).eq('id', product.id).select('*').single();
    if (error) { onError(error.message); return; }
    onSaved(data as Product);
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  }

  async function addPhotos(files: FileList | null) {
    if (!files || !editable) return;
    const list = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, MAX_PHOTOS - images.length);
    if (!list.length) { onError(`Up to ${MAX_PHOTOS} reference photos.`); return; }
    try {
      const next = [...images];
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        setBusy(`Uploading ${i + 1} of ${list.length}…`);
        if (fileTooLarge(f, MAX_IMAGE_BYTES)) { onError(`${f.name} is too large.`); continue; }
        const small = await compressImage(f, IMAGE_PRESETS.reference);
        const url = await uploadFile(`${storageBase}/reference/${Date.now()}-${next.length}.jpg`, small, 'image/jpeg');
        next.push({ url: url.split('?')[0], view: 'any', kb: Math.round(small.size / 1024) });
      }
      setImages(next);
      await persist({ reference_images: next });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Upload failed.');
    } finally { setBusy(''); }
  }

  async function setView(url: string, view: ProductView) {
    const next = images.map(r => r.url === url ? { ...r, view } : r);
    setImages(next);
    await persist({ reference_images: next });
  }

  async function removePhoto(url: string) {
    if (!editable) return;
    const next = images.filter(r => r.url !== url);
    setImages(next);
    await persist({ reference_images: next });
    await removeFiles([pathFromPublicUrl(url)]);
  }

  /** Re-saves photos added before compression existed, keeping their side tags. */
  async function compressOlder() {
    if (!editable) return;
    const older = images.filter(r => !r.kb);
    let before = 0, after = 0;
    try {
      const next = [...images];
      for (let i = 0; i < older.length; i++) {
        setBusy(`Compressing ${i + 1} of ${older.length}…`);
        const r = older[i];
        const { blob, before: b } = await compressFromUrl(r.url, IMAGE_PRESETS.reference);
        const url = (await uploadFile(`${storageBase}/reference/${Date.now()}-${i}.jpg`, blob, 'image/jpeg')).split('?')[0];
        before += b; after += blob.size;
        const k = next.findIndex(x => x.url === r.url);
        if (k >= 0) next[k] = { url, view: r.view, kb: Math.round(blob.size / 1024) };
        await removeFiles([pathFromPublicUrl(r.url)]);
      }
      setImages(next);
      await persist({ reference_images: next });
      if (older.length) onError(`Compressed ${older.length} photo${older.length > 1 ? 's' : ''}: ${formatKB(before)} → ${formatKB(after)}.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Compression failed.');
    } finally { setBusy(''); }
  }

  const untagged = images.filter(r => r.view === 'any').length;
  const olderCount = images.filter(r => !r.kb).length;
  const totalKB = images.reduce((n, r) => n + (r.kb ?? 0), 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="font-black text-brand-navy flex items-center gap-2"><ScanSearch className="w-4 h-4 text-brand-cerise" /> Floor recognition</h3>
        {editable && (
          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="accent-brand-navy" /> Show on the sales floor
          </label>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4">
        The floor app lets a salesperson point the phone at the real product and open these hotspots. Add photos of the product as it
        stands in the showroom — one for each side a salesperson might point at — and tag each with its side. Up to {MAX_PHOTOS}.
        {untagged > 0 && <span className="text-amber-700 font-semibold"> {untagged} photo{untagged > 1 ? 's' : ''} not tagged yet.</span>}
        {images.length > 0 && olderCount === 0 && <span className="text-slate-400"> Total {formatKB(totalKB * 1024)}.</span>}
      </p>

      {editable && olderCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4">
          <p className="text-xs text-amber-900 flex-1">
            {olderCount} photo{olderCount > 1 ? 's were' : ' was'} added before compression and may be large. Compressing makes recognition faster.
          </p>
          <button onClick={compressOlder} disabled={!!busy}
            className="inline-flex items-center gap-1.5 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg flex-shrink-0">
            <Minimize2 className="w-3.5 h-3.5" /> {busy && busy.startsWith('Compressing') ? busy : 'Compress now'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mb-4">
        {images.map(r => (
          <div key={r.url} className="rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
            <div className="relative aspect-[4/3] group">
              <img src={r.url} alt="" className="w-full h-full object-cover" loading="lazy" />
              {r.kb ? <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-black/55 text-white px-1.5 py-0.5 rounded">{r.kb} KB</span> : null}
              {editable && (
                <button onClick={() => removePhoto(r.url)} className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <select value={r.view} onChange={e => setView(r.url, e.target.value as ProductView)} disabled={!editable}
              className={`w-full text-[11px] font-semibold px-1.5 py-1.5 bg-white border-t border-slate-200 focus:outline-none ${r.view === 'any' ? 'text-amber-700' : 'text-slate-700'}`}>
              <option value="any">Tag the side…</option>
              {PHOTO_VIEWS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
        ))}
        {editable && images.length < MAX_PHOTOS && (
          <label className={`aspect-[4/3] rounded-xl border-2 border-dashed border-slate-300 hover:border-brand-navy flex flex-col items-center justify-center text-slate-400 hover:text-brand-navy cursor-pointer transition ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload className="w-5 h-5 mb-1" />
            <span className="text-[11px] font-bold text-center px-2">{busy || 'Add photos'}</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => { addPhotos(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>

      <label className="block text-xs font-bold text-brand-navy mb-1.5">Where is the label?</label>
      <input value={hint} onChange={e => setHint(e.target.value.slice(0, 300))} disabled={!editable}
        placeholder='e.g. "Model name on the boot lid, right side" or "Nameplate on the right panel, model starts with EG"'
        className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-navy transition disabled:bg-slate-50 mb-3" />

      {editable && (
        <div className="flex items-center gap-3">
          <button onClick={() => persist({ label_hint: hint, floor_enabled: enabled })} disabled={!dirty || !!busy}
            className="inline-flex items-center gap-1.5 bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-40 text-white text-sm font-black px-4 py-2 rounded-xl transition">
            {saved ? <Check className="w-3.5 h-3.5" /> : null} {saved ? 'Saved' : 'Save'}
          </button>
          <span className="text-[11px] text-slate-400">Photos and their side tags save as soon as you change them.</span>
        </div>
      )}
    </div>
  );
}
