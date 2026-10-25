import { useEffect, useState, useCallback } from 'react';
import { supabase, Tenant, Product } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { LineChart } from '../../lib/charts';
import { Calendar, TrendingUp, Target, MousePointerClick, Cpu, PlayCircle } from 'lucide-react';

type DailyStat = { date: string; sessions: number; detections: number; taps: number; plays: number };
type ProductRow = { product_id: string; product_name: string; tenant_name: string; sessions: number; detections: number; taps: number; plays: number };
type EventRow = { event_type: string; date_key: string; product_id: string | null; tenant_id: string | null; session_id: string | null; source: string | null; platform: string | null };

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export default function AnalyticsPage() {
  const { isPlatformAdmin, memberships } = useAuth();
  const [dateFrom, setDateFrom] = useState(daysAgo(7));
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [tenantFilter, setTenantFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<Record<string, number>>({});
  const [platforms, setPlatforms] = useState<Record<string, number>>({});

  const ownTenantIds = memberships.map(m => m.tenant_id);

  useEffect(() => {
    let q = supabase.from('tenants').select('*').order('name');
    if (!isPlatformAdmin) q = q.in('id', ownTenantIds);
    q.then(({ data }) => setTenants(data ?? []));
  }, [isPlatformAdmin, ownTenantIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let q = supabase.from('products').select('*').order('name');
    if (tenantFilter) q = q.eq('tenant_id', tenantFilter);
    else if (!isPlatformAdmin) q = q.in('tenant_id', ownTenantIds);
    q.then(({ data }) => setProducts(data ?? []));
  }, [tenantFilter, isPlatformAdmin, ownTenantIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadStats = useCallback(async () => {
    setLoading(true);
    // ar_events carries tenant_id and product_id directly (stamped by the database),
    // so one query answers every filter. RLS limits rows to tenants the user can view.
    let q = supabase.from('ar_events')
      .select('event_type, date_key, product_id, tenant_id, session_id, source, platform')
      .gte('date_key', dateFrom).lte('date_key', dateTo).limit(50000);
    if (productFilter) q = q.eq('product_id', productFilter);
    else if (tenantFilter) q = q.eq('tenant_id', tenantFilter);
    const { data } = await q;
    const events = (data ?? []) as EventRow[];

    const bump = (row: DailyStat | ProductRow, type: string) => {
      if (type === 'session_start') row.sessions++;
      else if (type === 'target_found') row.detections++;
      else if (type === 'hotspot_tapped') row.taps++;
      else if (type === 'media_played') row.plays++;
    };

    const byDate: Record<string, DailyStat> = {};
    for (const ev of events) {
      byDate[ev.date_key] ??= { date: ev.date_key, sessions: 0, detections: 0, taps: 0, plays: 0 };
      bump(byDate[ev.date_key], ev.event_type);
    }
    setDailyStats(Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)));

    const src: Record<string, number> = {}; const plat: Record<string, number> = {};
    for (const ev of events) if (ev.event_type === 'session_start') {
      src[ev.source ?? 'link'] = (src[ev.source ?? 'link'] ?? 0) + 1;
      plat[ev.platform ?? 'other'] = (plat[ev.platform ?? 'other'] ?? 0) + 1;
    }
    setSources(src); setPlatforms(plat);

    const productIds = [...new Set(events.map(e => e.product_id).filter((x): x is string => !!x))];
    if (productIds.length === 0) { setProductRows([]); setLoading(false); return; }
    const { data: prods } = await supabase.from('products').select('id, name, tenant_id').in('id', productIds);
    const tenantIds = [...new Set((prods ?? []).map(p => p.tenant_id))];
    const { data: tens } = await supabase.from('tenants').select('id, name').in('id', tenantIds);
    const tenantMap = Object.fromEntries((tens ?? []).map(t => [t.id, t.name]));
    const prodMap = Object.fromEntries((prods ?? []).map(p => [p.id, p]));
    const rows: Record<string, ProductRow> = {};
    for (const ev of events) {
      if (!ev.product_id) continue;
      const prod = prodMap[ev.product_id];
      rows[ev.product_id] ??= {
        product_id: ev.product_id,
        product_name: prod?.name ?? 'Deleted product',
        tenant_name: prod ? (tenantMap[prod.tenant_id] ?? '') : '',
        sessions: 0, detections: 0, taps: 0, plays: 0,
      };
      bump(rows[ev.product_id], ev.event_type);
    }
    setProductRows(Object.values(rows).sort((a, b) => b.sessions - a.sessions));
    setLoading(false);
  }, [dateFrom, dateTo, tenantFilter, productFilter]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const totals = dailyStats.reduce((acc, d) => ({
    sessions: acc.sessions + d.sessions, detections: acc.detections + d.detections, taps: acc.taps + d.taps, plays: acc.plays + d.plays,
  }), { sessions: 0, detections: 0, taps: 0, plays: 0 });
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

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Sessions', value: totals.sessions, icon: Cpu, bg: 'bg-brand-navy/10', color: 'text-brand-navy' },
          { label: 'Pages Found', value: totals.detections, icon: Target, bg: 'bg-brand-olive/10', color: 'text-brand-olive' },
          { label: 'Hotspot Taps', value: totals.taps, icon: MousePointerClick, bg: 'bg-brand-cerise/10', color: 'text-brand-cerise' },
          { label: 'Media Plays', value: totals.plays, icon: PlayCircle, bg: 'bg-brand-sky/10', color: 'text-brand-sky' },
          { label: 'Avg Taps/Session', value: avgTapsPerSession, icon: TrendingUp, bg: 'bg-brand-navy/10', color: 'text-brand-navy' },
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

      {totals.sessions > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {[{ title: 'Sessions by source', data: sources, labels: { qr: 'Customer QR', link: 'Shared link', learn: 'Sales team QR' } as Record<string, string> },
            { title: 'Sessions by device', data: platforms, labels: { ios: 'iPhone / iPad', android: 'Android', desktop: 'Desktop', other: 'Other' } as Record<string, string> }].map(card => (
            <div key={card.title} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <h2 className="text-sm font-black text-brand-navy mb-3 uppercase tracking-wide">{card.title}</h2>
              <div className="space-y-2">
                {Object.entries(card.data).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3 text-sm">
                    <span className="w-28 text-slate-500 font-medium">{card.labels[k] ?? k}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-2 rounded-full bg-brand-navy" style={{ width: `${Math.round((v / totals.sessions) * 100)}%` }} />
                    </div>
                    <span className="w-16 text-right font-bold text-brand-navy">{v} <span className="text-slate-400 font-medium text-xs">({Math.round((v / totals.sessions) * 100)}%)</span></span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

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
              { dataKey: 'detections', stroke: '#65743A', strokeWidth: 2.5, name: 'Pages found' },
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
                <th className="text-right px-5 py-3 text-xs font-black text-brand-navy uppercase tracking-wide">Pages found</th>
                <th className="text-right px-5 py-3 text-xs font-black text-brand-navy uppercase tracking-wide">Taps</th>
                <th className="text-right px-5 py-3 text-xs font-black text-brand-navy uppercase tracking-wide">Plays</th>
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
                  <td className="px-5 py-3 text-right font-bold text-brand-sky">{row.plays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
