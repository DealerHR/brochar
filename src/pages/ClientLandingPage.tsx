import { useEffect, useState } from 'react';
import { Link, useParams } from '../lib/router';
import { supabase, Tenant, Product } from '../lib/supabase';
import { Package, AlertCircle, Zap } from 'lucide-react';

export default function ClientLandingPage() {
  const { tenantSlug } = useParams();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: t } = await supabase.from('tenants').select('*').eq('slug', tenantSlug!).maybeSingle();
      if (!t || !t.is_active) { setNotFound(true); setLoading(false); return; }
      setTenant(t);

      // Only surface products that have a published, compiled brochure
      const { data: p } = await supabase
        .from('products')
        .select('*, brochures!inner(status, mind_file_url)')
        .eq('tenant_id', t.id)
        .eq('is_active', true)
        .eq('brochures.status', 'active')
        .not('brochures.mind_file_url', 'is', null)
        .order('display_order');
      setProducts(p ?? []);
      setLoading(false);
    }
    load();
  }, [tenantSlug]);

  if (loading) return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-navy/20 border-t-brand-navy rounded-full animate-spin" />
    </div>
  );

  if (notFound || !tenant) return (
    <div className="min-h-screen bg-brand-cream flex flex-col items-center justify-center p-6 text-center">
      <AlertCircle className="w-14 h-14 text-brand-navy/20 mb-4" />
      <h1 className="text-2xl font-black text-brand-navy mb-2">Page Not Found</h1>
      <p className="text-slate-400 text-sm">This client page is not available.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-slate-100 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          {tenant.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.name} className="h-10 object-contain" />
          ) : (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-sm" style={{ backgroundColor: tenant.brand_color }}>
              {tenant.name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-brand-navy text-lg leading-tight truncate">{tenant.name}</h1>
            {tenant.description && <p className="text-xs text-slate-400 font-medium truncate">{tenant.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: tenant.brand_color }} />
            <span className="text-xs font-bold text-slate-400 hidden sm:block">AR Ready</span>
          </div>
        </div>
      </header>

      {/* Brand color bar */}
      <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${tenant.brand_color}, #D8315B, #3FA7D6)` }} />

      {/* Hero strip */}
      <div className="bg-brand-cream/50 border-b border-slate-100 py-10 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-brand-olive font-bold text-xs uppercase tracking-widest mb-2">Interactive AR Brochures</p>
          <h2 className="text-3xl sm:text-4xl font-black text-brand-navy mb-2">Explore Our Range</h2>
          <p className="text-slate-500 text-sm font-medium max-w-lg">Scan any product brochure with your phone to launch the immersive AR experience.</p>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-16 h-16 bg-brand-cream rounded-2xl flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-brand-olive/40" />
            </div>
            <p className="text-sm font-medium">No products available yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.map(product => (
              <Link
                key={product.id}
                to={`/${tenantSlug}/${product.slug}`}
                className="group block bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className="aspect-video overflow-hidden relative bg-brand-cream/50">
                  {product.thumbnail_url ? (
                    <img src={product.thumbnail_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-12 h-12 text-brand-olive/20" />
                    </div>
                  )}
                  <div className="absolute top-3 right-3 bg-brand-navy/80 backdrop-blur-sm text-brand-cream text-xs font-black px-2.5 py-1 rounded-full">
                    AR
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="font-black text-brand-navy text-base mb-1 group-hover:text-brand-cerise transition">{product.name}</h3>
                  {product.description && (
                    <p className="text-slate-400 text-sm line-clamp-2 mb-4 font-medium">{product.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-auto">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full text-white shadow-sm transition group-hover:shadow-md"
                      style={{ backgroundColor: tenant.brand_color }}>
                      <Zap className="w-3 h-3" /> Launch AR
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-100 py-8 mt-4">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between flex-wrap gap-3">
          <p className="text-xs text-slate-400 font-medium">Powered by <span className="font-black text-brand-navy">Broch</span><span className="font-black text-brand-cerise">AR</span></p>
          <p className="text-xs text-slate-400 font-medium">&copy; {new Date().getFullYear()} {tenant.name}</p>
        </div>
      </footer>
    </div>
  );
}
