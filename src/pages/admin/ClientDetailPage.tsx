import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from '../../lib/router';
import { supabase, Tenant, Product } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { uploadFile, fileExtension, removeFolder, pathFromPublicUrl, removeFiles } from '../../lib/storage';
import { slugError, hexColorError, fileTooLarge, MAX_IMAGE_BYTES, toSlug } from '../../lib/validation';
import TenantTeam from '../../components/TenantTeam';
import QrModal from '../../components/QrModal';
import { ArrowLeft, Plus, Package, Pencil, ExternalLink, Upload, X, Check, Trash2, QrCode } from 'lucide-react';

export default function ClientDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { canEdit, canManage, canView } = useAuth();
  const editable = canEdit(clientId);
  const manageable = canManage(clientId);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: '', slug: '', brand_color: '#C41E3A', description: '', is_active: true, whatsapp_number: '', phone_number: '', enquiry_email: '',
    assistant_scope: 'brochure_plus' as Tenant['assistant_scope'], assistant_language: 'auto', assistant_monthly_cap: 2000,
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [qrProduct, setQrProduct] = useState<Product | null>(null);

  useEffect(() => { load(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tenants').select('*').eq('id', clientId!).maybeSingle(),
      supabase.from('products').select('*').eq('tenant_id', clientId!).order('display_order'),
    ]);
    if (t) {
      setTenant(t);
      setForm({
        name: t.name, slug: t.slug, brand_color: t.brand_color, description: t.description ?? '', is_active: t.is_active,
        whatsapp_number: t.whatsapp_number ?? '', phone_number: t.phone_number ?? '', enquiry_email: t.enquiry_email ?? '',
        assistant_scope: t.assistant_scope ?? 'brochure_plus', assistant_language: t.assistant_language ?? 'auto', assistant_monthly_cap: t.assistant_monthly_cap ?? 2000,
      });
    }
    setProducts(p ?? []);
    setLoading(false);
  }

  async function handleSave() {
    if (!tenant) return;
    setError('');
    const problem = slugError(form.slug, 'tenant') ?? hexColorError(form.brand_color) ?? (logoFile ? fileTooLarge(logoFile, MAX_IMAGE_BYTES) : null);
    if (problem) { setError(problem); return; }
    setSaving(true);
    try {
      let logo_url = tenant.logo_url;
      if (logoFile) {
        logo_url = await uploadFile(`tenants/${tenant.id}/logo.${fileExtension(logoFile, 'jpg')}`, logoFile);
      }
      const { error: err } = await supabase.from('tenants')
        .update({
          ...form, name: form.name.trim(), description: form.description.trim() || null, logo_url,
          whatsapp_number: form.whatsapp_number.replace(/[^0-9+]/g, '') || null,
          phone_number: form.phone_number.replace(/[^0-9+]/g, '') || null,
          enquiry_email: form.enquiry_email.trim() || null,
        }).eq('id', tenant.id);
      if (err) throw err.code === '23505' ? new Error('That slug is already used by another client.') : err;
      await load();
      setEditing(false);
      setLogoFile(null);
      setLogoPreview('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProduct(product: Product) {
    if (!window.confirm(`Delete "${product.name}"? This removes its brochure, pages, hotspots, uploaded files and analytics.`)) return;
    setDeletingProductId(product.id);
    // Rows cascade through FKs. Storage does not cascade, so clean the product folders.
    const { error: err } = await supabase.from('products').delete().eq('id', product.id);
    if (err) { setError(err.message); setDeletingProductId(null); return; }
    await removeFolder(`${clientId}/${product.id}`);
    await removeFiles([pathFromPublicUrl(product.thumbnail_url)]);
    setProducts(prev => prev.filter(p => p.id !== product.id));
    setDeletingProductId(null);
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="animate-pulse h-36 bg-white rounded-2xl border border-slate-100" />
      <div className="animate-pulse h-48 bg-white rounded-2xl border border-slate-100" />
    </div>
  );
  if (!tenant || !canView(tenant.id)) return <div className="text-slate-500">Client not found.</div>;

  return (
    <div>
      {error && <div className="mb-4 p-3.5 bg-brand-cerise/5 border border-brand-cerise/20 rounded-xl text-brand-cerise text-sm font-medium">{error}</div>}
      {qrProduct && <QrModal tenant={tenant} product={qrProduct} onClose={() => setQrProduct(null)} />}
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
                  <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: toSlug(e.target.value) }))}
                    className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-mono flex-1 focus:outline-none focus:border-brand-navy" placeholder="slug" />
                  <input type="color" value={form.brand_color} onChange={e => setForm(f => ({ ...f, brand_color: e.target.value }))}
                    className="w-10 h-10 rounded-xl border-2 border-slate-200 cursor-pointer p-0.5" />
                </div>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm w-full resize-none focus:outline-none focus:border-brand-navy" rows={2} />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">WhatsApp number</label>
                    <input value={form.whatsapp_number} onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))} placeholder="+91 98765 43210"
                      className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:border-brand-navy" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Phone number</label>
                    <input value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} placeholder="+91 ..."
                      className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:border-brand-navy" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Enquiry email</label>
                    <input value={form.enquiry_email} onChange={e => setForm(f => ({ ...f, enquiry_email: e.target.value }))} placeholder="sales@client.com"
                      className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:border-brand-navy" />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">Used by Contact buttons on hotspots unless a button sets its own number.</p>
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs font-bold text-brand-navy mb-2">Ask AI</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">Who can ask, and from what</label>
                      <select value={form.assistant_scope} onChange={e => setForm(f => ({ ...f, assistant_scope: e.target.value as Tenant['assistant_scope'] }))}
                        className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm w-full bg-white focus:outline-none focus:border-brand-navy">
                        <option value="brochure_plus">Everyone · brochure facts + general explanations</option>
                        <option value="brochure">Everyone · brochure facts only</option>
                        <option value="team">Sales team link only</option>
                        <option value="off">Off</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">Language</label>
                      <select value={form.assistant_language} onChange={e => setForm(f => ({ ...f, assistant_language: e.target.value }))}
                        className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm w-full bg-white focus:outline-none focus:border-brand-navy">
                        <option value="auto">Match the question (phone's language for the mic)</option>
                        <option value="en-IN">English</option>
                        <option value="hi-IN">Hindi</option>
                        <option value="mr-IN">Marathi</option>
                        <option value="gu-IN">Gujarati</option>
                        <option value="ta-IN">Tamil</option>
                        <option value="te-IN">Telugu</option>
                        <option value="kn-IN">Kannada</option>
                        <option value="bn-IN">Bengali</option>
                        <option value="ml-IN">Malayalam</option>
                        <option value="pa-IN">Punjabi</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">Questions per month</label>
                      <input type="number" min={0} value={form.assistant_monthly_cap} onChange={e => setForm(f => ({ ...f, assistant_monthly_cap: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:border-brand-navy" />
                    </div>
                  </div>
                </div>
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
                <p className="text-xs text-slate-400 mt-1.5">
                  <span className="font-bold text-slate-500">Contact defaults for hotspot buttons: </span>
                  {tenant.whatsapp_number || tenant.phone_number ? (
                    <>
                      {tenant.whatsapp_number && <>WhatsApp {tenant.whatsapp_number}</>}
                      {tenant.whatsapp_number && tenant.phone_number && ' · '}
                      {tenant.phone_number && <>Phone {tenant.phone_number}</>}
                    </>
                  ) : manageable ? (
                    <button onClick={() => setEditing(true)} className="text-brand-cerise font-bold hover:underline">not set — add WhatsApp and phone</button>
                  ) : 'not set'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  <span className="font-bold text-slate-500">Ask AI: </span>
                  {{ off: 'off', team: 'sales team link only', brochure: 'everyone, brochure facts only', brochure_plus: 'everyone, brochure facts and explanations' }[tenant.assistant_scope ?? 'brochure_plus']}
                  {' · '}{tenant.assistant_monthly_cap ?? 2000} questions/month
                </p>
                <div className="flex items-center gap-4 mt-3">
                  {manageable && (
                    <button onClick={() => setEditing(true)}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-navy transition">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  )}
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
        {editable && (
          <Link to={`/admin/clients/${clientId}/products/new`}
            className="inline-flex items-center gap-2 bg-brand-cerise hover:bg-brand-cerise/90 text-white text-sm font-bold px-4 py-2 rounded-xl transition shadow-lg shadow-brand-cerise/20">
            <Plus className="w-4 h-4" /> Add Product
          </Link>
        )}
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
                onClick={e => { e.preventDefault(); setQrProduct(product); }}
                className="absolute top-2 right-12 w-7 h-7 rounded-full bg-white/90 border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-brand-navy hover:border-brand-navy/40 transition opacity-0 group-hover:opacity-100"
                title="QR code"
              >
                <QrCode className="w-3.5 h-3.5" />
              </button>
              {editable && <button
                onClick={e => { e.preventDefault(); handleDeleteProduct(product); }}
                disabled={deletingProductId === product.id}
                className="absolute top-2 left-2 w-7 h-7 rounded-full bg-white/90 border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-brand-cerise hover:border-brand-cerise/40 transition opacity-0 group-hover:opacity-100 disabled:opacity-60"
                title="Delete product"
              >
                {deletingProductId === product.id
                  ? <span className="w-3 h-3 border-2 border-brand-cerise/40 border-t-brand-cerise rounded-full animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />}
              </button>}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        <TenantTeam tenantId={tenant.id} canManage={manageable} />
      </div>
    </div>
  );
}
