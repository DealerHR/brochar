import { useEffect, useState } from 'react';
import { Link } from '../../lib/router';
import { supabase, Tenant } from '../../lib/supabase';
import { Plus, ChevronRight } from 'lucide-react';

export default function ClientsListPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from('tenants').select('*').order('created_at', { ascending: false });
    if (data) {
      setTenants(data);
      const counts: Record<string, number> = {};
      await Promise.all(data.map(async (t) => {
        const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id);
        counts[t.id] = count ?? 0;
      }));
      setProductCounts(counts);
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-brand-cerise font-bold text-xs uppercase tracking-widest mb-1">Manage</p>
          <h1 className="text-3xl font-black text-brand-navy">Clients</h1>
          <p className="text-slate-400 text-sm mt-1">Brands and their AR brochure products</p>
        </div>
        <Link
          to="/admin/clients/new"
          className="inline-flex items-center gap-2 bg-brand-cerise hover:bg-brand-cerise/90 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-brand-cerise/20"
        >
          <Plus className="w-4 h-4" /> Add Client
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-2xl border border-slate-100 h-20 animate-pulse" />)}
        </div>
      ) : tenants.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm">
          <div className="w-14 h-14 bg-brand-cream rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Plus className="w-7 h-7 text-brand-olive" />
          </div>
          <p className="text-brand-navy font-bold text-lg mb-1">No clients yet</p>
          <p className="text-slate-400 text-sm mb-5">Create your first brand client to get started.</p>
          <Link to="/admin/clients/new"
            className="inline-flex items-center gap-2 bg-brand-navy text-white font-bold px-5 py-2.5 rounded-xl text-sm transition hover:bg-brand-navy/90">
            <Plus className="w-4 h-4" /> Create First Client
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {tenants.map((tenant, idx) => {
            const borders = ['border-l-brand-navy', 'border-l-brand-cerise', 'border-l-brand-sky', 'border-l-brand-olive'];
            return (
              <Link
                key={tenant.id}
                to={`/admin/clients/${tenant.id}`}
                className={`flex items-center gap-4 bg-white rounded-2xl border border-slate-100 border-l-4 ${borders[idx % borders.length]} p-4 hover:shadow-md transition-all duration-200 group`}
              >
                {tenant.logo_url ? (
                  <img src={tenant.logo_url} alt={tenant.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-black text-xl shadow-sm" style={{ backgroundColor: tenant.brand_color }}>
                    {tenant.name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-brand-navy text-base">{tenant.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${tenant.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                      {tenant.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">{productCounts[tenant.id] ?? 0} product{productCounts[tenant.id] !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full border-2 border-white shadow-md" style={{ backgroundColor: tenant.brand_color }} />
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-cerise transition" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
