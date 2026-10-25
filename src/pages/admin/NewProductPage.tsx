import { useEffect, useState } from 'react';
import { useNavigate, useParams } from '../../lib/router';
import { supabase, Tenant } from '../../lib/supabase';
import { uploadFile, fileExtension } from '../../lib/storage';
import { toSlug, slugError, fileTooLarge, MAX_IMAGE_BYTES } from '../../lib/validation';
import { ArrowLeft, Upload } from 'lucide-react';

export default function NewProductPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', display_order: 0, is_active: true });
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('tenants').select('*').eq('id', clientId!).maybeSingle().then(({ data }) => setTenant(data));
  }, [clientId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const problem = slugError(form.slug) ?? (thumbFile ? fileTooLarge(thumbFile, MAX_IMAGE_BYTES) : null);
    if (problem) { setError(problem); return; }
    setSaving(true);
    try {
      const { data: product, error: err } = await supabase.from('products')
        .insert({ ...form, name: form.name.trim(), description: form.description.trim() || null, tenant_id: clientId }).select().single();
      if (err) throw err.code === '23505' ? new Error('This client already has a product with that slug.') : err;
      if (thumbFile && product) {
        const thumbnail_url = await uploadFile(`${clientId}/products/${product.id}/thumbnail.${fileExtension(thumbFile, 'jpg')}`, thumbFile);
        await supabase.from('products').update({ thumbnail_url }).eq('id', product.id);
      }
      navigate(`/admin/clients/${clientId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create product');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-navy text-slate-800 placeholder-slate-400 transition";

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate(`/admin/clients/${clientId}`)} className="flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-brand-navy mb-6 transition">
        <ArrowLeft className="w-4 h-4" /> Back to {tenant?.name ?? 'client'}
      </button>
      <div className="mb-6">
        <p className="text-brand-cerise font-bold text-xs uppercase tracking-widest mb-1">New</p>
        <h1 className="text-3xl font-black text-brand-navy">Add Product</h1>
        {tenant && <p className="text-slate-400 text-sm mt-1">for {tenant.name}</p>}
      </div>
      {error && <div className="mb-5 p-4 bg-brand-cerise/5 border border-brand-cerise/20 rounded-xl text-brand-cerise text-sm font-medium">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5 shadow-sm">
          <h2 className="text-brand-navy font-black text-base pb-1 border-b border-slate-100">Product Details</h2>
          <div>
            <label className="block text-sm font-bold text-brand-navy mb-2">Thumbnail</label>
            <div className="flex items-center gap-4">
              <div className="w-24 h-16 rounded-xl overflow-hidden flex items-center justify-center border-2 border-dashed border-slate-200 bg-brand-cream/30">
                {thumbPreview ? <img src={thumbPreview} alt="Preview" className="w-full h-full object-cover" /> : <Upload className="w-5 h-5 text-brand-olive/50" />}
              </div>
              <label className="cursor-pointer inline-flex items-center gap-2 text-sm font-bold text-brand-cerise hover:text-brand-cerise/80 transition">
                <Upload className="w-4 h-4" /> Upload thumbnail
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setThumbFile(f); setThumbPreview(URL.createObjectURL(f)); } }} />
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-navy mb-1.5">Product Name *</label>
            <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: toSlug(e.target.value) }))} className={inputClass} placeholder="e.g. Next Gen Tiago" />
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-navy mb-1.5">Slug *</label>
            <input type="text" required value={form.slug} onChange={e => setForm(f => ({ ...f, slug: toSlug(e.target.value) }))} className={`${inputClass} font-mono`} placeholder="next-gen-tiago" />
            <p className="text-xs text-slate-400 mt-1.5 font-medium">URL: <span className="text-brand-navy font-mono">/{tenant?.slug ?? 'client'}/{form.slug || 'product-slug'}</span></p>
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-navy mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-navy text-slate-800 placeholder-slate-400 transition resize-none" rows={3} placeholder="Brief product description" />
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-navy mb-1.5">Display Order</label>
            <input type="number" value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} className="w-28 border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-navy text-slate-800 transition" />
          </div>
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="sr-only peer" />
              <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-5 peer-checked:bg-brand-cerise after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition" />
            </label>
            <span className="text-sm font-bold text-brand-navy">Active</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="bg-brand-cerise hover:bg-brand-cerise/90 disabled:opacity-50 text-white font-black px-6 py-3 rounded-xl text-sm transition shadow-lg shadow-brand-cerise/20">
            {saving ? 'Creating...' : 'Create Product'}
          </button>
          <button type="button" onClick={() => navigate(`/admin/clients/${clientId}`)} className="bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-bold px-6 py-3 rounded-xl text-sm transition">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
