import { useState } from 'react';
import { useNavigate } from '../../lib/router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { uploadFile, fileExtension } from '../../lib/storage';
import { toSlug, slugError, hexColorError, fileTooLarge, MAX_IMAGE_BYTES } from '../../lib/validation';
import { ArrowLeft, Upload } from 'lucide-react';

export default function NewClientPage() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useAuth();
  const [form, setForm] = useState({ name: '', slug: '', brand_color: '#0A2463', description: '', is_active: true });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const problem = slugError(form.slug, 'tenant') ?? hexColorError(form.brand_color) ?? (logoFile ? fileTooLarge(logoFile, MAX_IMAGE_BYTES) : null);
    if (problem) { setError(problem); return; }
    setSaving(true);
    try {
      const { data: tenant, error: insertErr } = await supabase.from('tenants')
        .insert({ ...form, name: form.name.trim(), description: form.description.trim() || null }).select().single();
      if (insertErr) throw insertErr.code === '23505' ? new Error('A client with that slug already exists.') : insertErr;
      if (logoFile && tenant) {
        const logo_url = await uploadFile(`tenants/${tenant.id}/logo.${fileExtension(logoFile, 'jpg')}`, logoFile);
        await supabase.from('tenants').update({ logo_url }).eq('id', tenant.id);
      }
      navigate('/admin/clients');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create client');
    } finally {
      setSaving(false);
    }
  }

  if (!isPlatformAdmin) return <div className="text-slate-500">Only platform admins can add clients.</div>;

  const inputClass = "w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-navy text-slate-800 placeholder-slate-400 transition";

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate('/admin/clients')} className="flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-brand-navy mb-6 transition">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="mb-6">
        <p className="text-brand-cerise font-bold text-xs uppercase tracking-widest mb-1">New</p>
        <h1 className="text-3xl font-black text-brand-navy">Add Client</h1>
      </div>
      {error && <div className="mb-5 p-4 bg-brand-cerise/5 border border-brand-cerise/20 rounded-xl text-brand-cerise text-sm font-medium">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5 shadow-sm">
          <h2 className="text-brand-navy font-black text-base pb-1 border-b border-slate-100">Brand Details</h2>
          <div>
            <label className="block text-sm font-bold text-brand-navy mb-2">Logo</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-dashed border-slate-200 bg-brand-cream/30">
                {logoPreview ? <img src={logoPreview} alt="Preview" className="w-full h-full object-cover" /> : <Upload className="w-5 h-5 text-brand-olive/50" />}
              </div>
              <label className="cursor-pointer inline-flex items-center gap-2 text-sm font-bold text-brand-cerise hover:text-brand-cerise/80 transition">
                <Upload className="w-4 h-4" /> Upload logo
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)); } }} />
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-navy mb-1.5">Client Name *</label>
            <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: toSlug(e.target.value) }))} className={inputClass} placeholder="e.g. Tata Motors" />
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-navy mb-1.5">Slug *</label>
            <input type="text" required value={form.slug} onChange={e => setForm(f => ({ ...f, slug: toSlug(e.target.value) }))} className={`${inputClass} font-mono`} placeholder="tata-motors" />
            <p className="text-xs text-slate-400 mt-1.5 font-medium">Public URL: <span className="text-brand-navy font-mono">/{form.slug || 'client-slug'}</span></p>
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-navy mb-1.5">Brand Color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.brand_color} onChange={e => setForm(f => ({ ...f, brand_color: e.target.value }))} className="w-12 h-12 rounded-xl border-2 border-slate-200 cursor-pointer p-1" />
              <input type="text" value={form.brand_color} onChange={e => setForm(f => ({ ...f, brand_color: e.target.value }))} className="border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-mono w-36 focus:outline-none focus:border-brand-navy text-slate-800 transition" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-navy mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-navy text-slate-800 placeholder-slate-400 transition resize-none" rows={3} placeholder="Brief description of the client" />
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
            {saving ? 'Creating...' : 'Create Client'}
          </button>
          <button type="button" onClick={() => navigate('/admin/clients')} className="bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-bold px-6 py-3 rounded-xl text-sm transition">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
