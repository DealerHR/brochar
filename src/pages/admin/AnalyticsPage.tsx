import { useEffect, useState } from 'react';
import { supabase, Tenant, Product } from '../../lib/supabase';
import { LineChart } from '../../lib/charts';
import { Calendar, TrendingUp, Target, MousePointerClick, Cpu } from 'lucide-react';

type DailyStat = { date: string; sessions: number; detections: number; taps: number };
type ProductRow = { product_id: string; product_name: string; tenant_name: string; sessions: number; detections: number; taps: number };

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export default function AnalyticsPage() {
  const [dateFrom, setDateFrom] = useState(daysAgo(7));
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [tenantFilter, setTenantFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('tenants').select('*').then(({ data }) => setTenants(data ?? []));
  }, []);

  useEffect(() => {
    if (tenantFilter) {
      supabase.from('products').select('*').eq('tenant_id', tenantFilter).then(({ data }) => setProducts(data ?? []));
    } else {
      supabase.from('products').select('*').then(({ data }) => setProducts(data ?? []));
    }
  }, [tenantFilter]);

  useEffect(() => { loadStats(); }, [dateFrom, dateTo, tenantFilter, productFilter]);

  async function loadStats() {
    setLoading(true);
    let q = supabase.from('ar_events').select('event_type, date_key, brochure_id').gte('date_key', dateFrom).lte('date_key', dateTo);
    if (productFilter) {
      const { data: brs } = await supabase.from('brochures').select('id').eq('product_id', productFilter);
      const ids = brs?.map(b => b.id) ?? [];
      if (ids.length === 0) { setDailyStats([]); setProductRows([]); setLoading(false); return; }
      q = q.in('brochure_id', ids);
    } else if (tenantFilter) {
      const { data: prods } = await supabase.from('products').select('id').eq('tenant_id', tenantFilter);
      const prodIds = prods?.map(p => p.id) ?? [];
      if (prodIds.length > 0) {
        const { data: brs } = await supabase.from('brochures').select('id').in('product_id', prodIds);
        const ids = brs?.map(b => b.id) ?? [];
        if (ids.length === 0) { setDailyStats([]); setProductRows([]); setLoading(false); return; }
        q = q.in('brochure_id', ids);
      }
    }
    const { data: events } = await q;
    const byDate: Record<string, DailyStat> = {};
    for (const ev of events ?? []) {
      if (!byDate[ev.date_key]) byDate[ev.date_key] = { date: ev.date_key, sessions: 0, detections: 0, taps: 0 };
      if (ev.event_type === 'session_start') byDate[ev.date_key].sessions++;
      if (ev.event_type === 'target_found') byDate[ev.date_key].detections++;
      if (ev.event_type === 'hotspot_tapped') byDate[ev.date_key].taps++;
    }
    setDailyStats(Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)));
    const brochureIds = [...new Set((events ?? []).map(e => e.brochure_id))];
    if (brochureIds.length > 0) {
      const { data: brs } = await supabase.from('brochures').select('id, product_id').in('id', brochureIds);
      const { data: prods } = await supabase.from('products').select('id, name, tenant_id');
      const { data: tens } = await supabase.from('tenants').select('id, name');
      const tenantMap = Object.fromEntries((tens ?? []).map(t => [t.id, t.name]));
      const prodMap = Object.fromEntries((prods ?? []).map(p => [p.id, p]));
      const brMap = Object.fromEntries((brs ?? []).map(b => [b.id, b.product_id]));
      const pRows: Record<string, ProductRow> = {};
      for (const ev of events ?? []) {
        const prodId = brMap[ev.brochure_id];
        const prod = prodMap[prodId];
        if (!prod) continue;
        if (!pRows[prodId]) pRows[prodId] = { product_id: prodId, product_name: prod.name, tenant_name: tenantMap[prod.tenant_id] ?? '', sessions: 0, detections: 0, taps: 0 };
        if (ev.event_type === 'session_start') pRows[prodId].sessions++;
        if (ev.event_type === 'target_found') pRows[prodId].detections++;
        if (ev.event_type === 'hotspot_tapped') pRows[prodId].taps++;
      }
      setProductRows(Object.values(pRows).sort((a, b) => b.sessions - a.sessions));
    } else {
      setProductRows([]);
    }
    setLoading(false);
  }

  const totals = dailyStats.reduce((acc, d) => ({ sessions: acc.sessions + d.sessions, detections: acc.detections + d.detections, taps: acc.taps + d.taps }), { sessions: 0, detections: 0, taps: 0 });
  const avgTapsPerSession = totals.sessions > 0 ? (totals.taps / totals.sessions).toFixed(1) : '0';
  const filterClass = "border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-navy text-slate-700 bg-white transition";

  return (
    <div>
      <div className="mb-8">
        <p className="text-brand-cerise font-bold text-xs uppercase tracking-widest mb-1">Insights</p>
        <h1 className="text-3xl font-black text-brand-navy">Analytics</h1>
        <p className="text-slate-400 text-sm mt-1">AR session data across all products</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 bg-white rounded-2xl border border-slate-100 p-4 shadow-sm items-center">
        <Calendar className="w-4 h-4 text-brand-navy" />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={filterClass} />
        <span className="text-slate-400 text-sm font-medium">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={filterClass} />
        <select value={tenantFilter} onChange={e => { setTenantFilter(e.target.value); setProductFilter(''); }} className={filterClass}>
          <option value="">All Clients</option>
          {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={productFilter} onChange={e => setProductFilter(e.target.value)} className={filterClass}>
          <option value="">All Products</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Sessions', value: totals.sessions, icon: Cpu, bg: 'bg-brand-navy/10', color: 'text-brand-navy' },
          { label: 'Target Detections', value: totals.detections, icon: Target, bg: 'bg-brand-olive/10', color: 'text-brand-olive' },
          { label: 'Hotspot Taps', value: totals.taps, icon: MousePointerClick, bg: 'bg-brand-cerise/10', color: 'text-brand-cerise' },
          { label: 'Avg Taps/Session', value: avgTapsPerSession, icon: TrendingUp, bg: 'bg-brand-sky/10', color: 'text-brand-sky' },
        ].map(({ label, value, icon: Icon, bg, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">{label}</p>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${bg}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            <p className={`text-2xl font-black ${color}`}>{loading ? '—' : value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-6 shadow-sm">
        <h2 className="text-sm font-black text-brand-navy mb-4 uppercase tracking-wide">Daily Sessions</h2>
        {loading ? (
          <div className="h-40 animate-pulse bg-brand-cream/50 rounded-xl" />
        ) : dailyStats.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-slate-400 text-sm">No data in this range</div>
        ) : (
          <LineChart data={dailyStats} xKey="date" height={200} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}
            lines={[
              { dataKey: 'sessions', stroke: '#0A2463', strokeWidth: 2.5, name: 'Sessions' },
              { dataKey: 'detections', stroke: '#65743A', strokeWidth: 2.5, name: 'Detections' },
              { dataKey: 'taps', stroke: '#D8315B', strokeWidth: 2.5, name: 'Taps' },
            ]}
          />
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-black text-brand-navy uppercase tracking-wide">Per Product Breakdown</h2>
        </div>
        {loading ? (
          <div className="p-5 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-8 bg-brand-cream/50 rounded-xl animate-pulse" />)}</div>
        ) : productRows.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">No data available for this period</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-brand-cream/40">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-black text-brand-navy uppercase tracking-wide">Product</th>
                <th className="text-left px-5 py-3 text-xs font-black text-brand-navy uppercase tracking-wide">Client</th>
                <th className="text-right px-5 py-3 text-xs font-black text-brand-navy uppercase tracking-wide">Sessions</th>
                <th className="text-right px-5 py-3 text-xs font-black text-brand-navy uppercase tracking-wide">Detections</th>
                <th className="text-right px-5 py-3 text-xs font-black text-brand-navy uppercase tracking-wide">Taps</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {productRows.map(row => (
                <tr key={row.product_id} className="hover:bg-brand-cream/20 transition">
                  <td className="px-5 py-3 font-bold text-brand-navy">{row.product_name}</td>
                  <td className="px-5 py-3 text-slate-400 font-medium">{row.tenant_name}</td>
                  <td className="px-5 py-3 text-right font-bold text-brand-navy">{row.sessions}</td>
                  <td className="px-5 py-3 text-right font-bold text-brand-olive">{row.detections}</td>
                  <td className="px-5 py-3 text-right font-bold text-brand-cerise">{row.taps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
