import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from '../../lib/router';
import { supabase, Tenant, Product } from '../../lib/supabase';
import { ArrowLeft, Plus, Package, Pencil, ExternalLink, Upload, X, Check, Trash2 } from 'lucide-react';

export default function ClientDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', brand_color: '#C41E3A', description: '', is_active: true });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  useEffect(() => { load(); }, [clientId]);

  async function load() {
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tenants').select('*').eq('id', clientId!).maybeSingle(),
      supabase.from('products').select('*').eq('tenant_id', clientId!).order('display_order'),
    ]);
    if (t) {
      setTenant(t);
      setForm({ name: t.name, slug: t.slug, brand_color: t.brand_color, description: t.description ?? '', is_active: t.is_active });
    }
    setProducts(p ?? []);
    setLoading(false);
  }

  async function handleSave() {
    if (!tenant) return;
    setSaving(true);
    let logo_url = tenant.logo_url;
    if (logoFile) {
      const path = `tenants/${tenant.id}/logo.jpg`;
      await supabase.storage.from('brochure-assets').upload(path, logoFile, { upsert: true });
      const { data } = supabase.storage.from('brochure-assets').getPublicUrl(path);
      logo_url = data.publicUrl;
    }
    await supabase.from('tenants').update({ ...form, logo_url }).eq('id', tenant.id);
    await load();
    setSaving(false);
    setEditing(false);
  }

  async function handleDeleteProduct(product: Product) {
    if (!window.confirm(`Delete "${product.name}"? This will also remove its brochure and all hotspots.`)) return;
    setDeletingProductId(product.id);
    // cascade: brochure_pages → hotspots are cascade-deleted via FK; brochures too
    await supabase.from('products').delete().eq('id', product.id);
    setProducts(prev => prev.filter(p => p.id !== product.id));
    setDeletingProductId(null);
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="animate-pulse h-36 bg-white rounded-2xl border border-slate-100" />
      <div className="animate-pulse h-48 bg-white rounded-2xl border border-slate-100" />
    </div>
  );
  if (!tenant) return <div className="text-slate-500">Client not found.</div>;

  return (
    <div>
      <button onClick={() => navigate('/admin/clients')}
        className="flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-brand-navy mb-6 transition">
        <ArrowLeft className="w-4 h-4" /> All Clients
      </button>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-navy via-brand-cerise to-brand-sky" />
        <div className="flex items-start gap-5">
          <div className="relative group flex-shrink-0">
            {tenant.logo_url || logoPreview ? (
              <img src={logoPreview || tenant.logo_url!} alt={tenant.name} className="w-16 h-16 rounded-2xl object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-md" style={{ backgroundColor: tenant.brand_color }}>
                {tenant.name[0]}
              </div>
            )}
            {editing && (
              <label className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center cursor-pointer">
                <Upload className="w-5 h-5 text-white" />
                <input type="file" accept="image/*" className="hidden" onChange={e => {
                  const f = e.target.files?.[0]; if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)); }
                }} />
              </label>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-3">
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:border-brand-navy font-bold" />
                <div className="flex gap-3">
                  <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                    className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-mono flex-1 focus:outline-none focus:border-brand-navy" placeholder="slug" />
                  <input type="color" value={form.brand_color} onChange={e => setForm(f => ({ ...f, brand_color: e.target.value }))}
                    className="w-10 h-10 rounded-xl border-2 border-slate-200 cursor-pointer p-0.5" />
                </div>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm w-full resize-none focus:outline-none focus:border-brand-navy" rows={2} />
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="sr-only peer" />
                    <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-5 peer-checked:bg-brand-cerise after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition" />
                  </label>
                  <span className="text-sm font-semibold text-brand-navy">Active</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={saving}
                    className="inline-flex items-center gap-1.5 bg-brand-navy hover:bg-brand-navy/90 text-white text-sm font-bold px-4 py-2 rounded-xl transition">
                    <Check className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => { setEditing(false); setLogoPreview(''); setLogoFile(null); }}
                    className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold px-4 py-2 rounded-xl transition">
                    <X className="w-4 h-4" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h1 className="text-2xl font-black text-brand-navy">{tenant.name}</h1>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${tenant.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                    {tenant.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-sm text-slate-400 font-mono">/{tenant.slug}</p>
                {tenant.description && <p className="text-sm text-slate-500 mt-1">{tenant.description}</p>}
                <div className="flex items-center gap-4 mt-3">
                  <button onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-navy transition">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <a href={`/${tenant.slug}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-cerise hover:text-brand-cerise/80 transition">
                    <ExternalLink className="w-3.5 h-3.5" /> View public page
                  </a>
                </div>
              </>
            )}
          </div>
          <div className="w-5 h-5 rounded-full shadow-md border-2 border-white flex-shrink-0" style={{ backgroundColor: tenant.brand_color }} />
        </div>
      </div>

      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-black text-brand-navy">Products</h2>
        <Link to={`/admin/clients/${clientId}/products/new`}
          className="inline-flex items-center gap-2 bg-brand-cerise hover:bg-brand-cerise/90 text-white text-sm font-bold px-4 py-2 rounded-xl transition shadow-lg shadow-brand-cerise/20">
          <Plus className="w-4 h-4" /> Add Product
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-14 text-center shadow-sm">
          <div className="w-14 h-14 bg-brand-cream rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-7 h-7 text-brand-olive" />
          </div>
          <p className="text-brand-navy font-bold text-base mb-1">No products yet</p>
          <p className="text-slate-400 text-sm">Add the first product for this client.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map(product => (
            <div key={product.id} className="relative group">
              <Link to={`/admin/clients/${clientId}/products/${product.id}`}
                className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 block">
                <div className="aspect-video bg-brand-cream/50 overflow-hidden relative">
                  {product.thumbnail_url ? (
                    <img src={product.thumbnail_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-10 h-10 text-brand-olive/30" />
                    </div>
                  )}
                  <div className="absolute top-2.5 right-2.5 bg-brand-navy/80 text-brand-cream text-xs font-black px-2 py-0.5 rounded-full">AR</div>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-brand-navy text-sm">{product.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${product.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                      {product.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {product.description && <p className="text-xs text-slate-400 line-clamp-2">{product.description}</p>}
                </div>
              </Link>
              <button
                onClick={e => { e.preventDefault(); handleDeleteProduct(product); }}
                disabled={deletingProductId === product.id}
                className="absolute top-2 left-2 w-7 h-7 rounded-full bg-white/90 border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-brand-cerise hover:border-brand-cerise/40 transition opacity-0 group-hover:opacity-100 disabled:opacity-60"
                title="Delete product"
              >
                {deletingProductId === product.id
                  ? <span className="w-3 h-3 border-2 border-brand-cerise/40 border-t-brand-cerise rounded-full animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
