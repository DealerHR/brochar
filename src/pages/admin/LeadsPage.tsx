import { useCallback, useEffect, useState } from 'react';
import { supabase, Lead, Tenant, Product } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Inbox, Download, Phone, MessageCircle, Trash2 } from 'lucide-react';

const STATUS: Record<Lead['status'], string> = { new: 'New', contacted: 'Contacted', closed: 'Closed' };

function csvEscape(v: string | null | undefined) {
  const s = (v ?? '').toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function LeadsPage() {
  const { isPlatformAdmin, memberships, canEdit } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [tenantFilter, setTenantFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | Lead['status']>('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const ownIds = memberships.map(m => m.tenant_id);

  useEffect(() => {
    let q = supabase.from('tenants').select('*').order('name');
    if (!isPlatformAdmin) q = q.in('id', ownIds);
    q.then(({ data }) => setTenants(data ?? []));
    supabase.from('products').select('*').then(({ data }) => setProducts(Object.fromEntries((data ?? []).map(p => [p.id, p]))));
  }, [isPlatformAdmin, ownIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(2000);
    if (tenantFilter) q = q.eq('tenant_id', tenantFilter);
    if (statusFilter) q = q.eq('status', statusFilter);
    const { data } = await q;
    setLeads((data ?? []) as Lead[]);
    setLoading(false);
  }, [tenantFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function setStatus(lead: Lead, status: Lead['status']) {
    const { error } = await supabase.from('leads').update({ status }).eq('id', lead.id);
    if (!error) setLeads(ls => ls.map(l => l.id === lead.id ? { ...l, status } : l));
  }

  async function remove(lead: Lead) {
    if (!window.confirm(`Delete the enquiry from ${lead.name}?`)) return;
    const { error } = await supabase.from('leads').delete().eq('id', lead.id);
    if (!error) setLeads(ls => ls.filter(l => l.id !== lead.id));
  }

  function exportCsv() {
    const tenantName = (id: string | null) => tenants.find(t => t.id === id)?.name ?? '';
    const rows = [
      ['Date', 'Client', 'Product', 'Name', 'Mobile', 'Message', 'Source', 'Status'],
      ...leads.map(l => [
        new Date(l.created_at).toLocaleString(), tenantName(l.tenant_id), products[l.product_id ?? '']?.name ?? '',
        l.name, l.phone, l.message ?? '', l.source ?? '', STATUS[l.status],
      ]),
    ];
    const csv = rows.map(r => r.map(csvEscape).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,%EF%BB%BF${encodeURIComponent(csv)}`;
    a.download = `brochar-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const filterClass = "border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-navy text-slate-700 bg-white transition";

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <p className="text-brand-cerise font-bold text-xs uppercase tracking-widest mb-1">Enquiries</p>
          <h1 className="text-3xl font-black text-brand-navy">Leads</h1>
          <p className="text-slate-400 text-sm mt-1">Call-back requests sent from the AR card</p>
        </div>
        <button onClick={exportCsv} disabled={!leads.length}
          className="inline-flex items-center gap-2 bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-50 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 bg-white rounded-2xl border border-slate-100 p-4 shadow-sm items-center">
        <select value={tenantFilter} onChange={e => setTenantFilter(e.target.value)} className={filterClass}>
          <option value="">All Clients</option>
          {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as '' | Lead['status'])} className={filterClass}>
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="closed">Closed</option>
        </select>
        <span className="text-xs text-slate-400 ml-auto">{leads.length} lead{leads.length === 1 ? '' : 's'}</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-brand-cream/50 rounded-xl animate-pulse" />)}</div>
        ) : leads.length === 0 ? (
          <div className="p-14 text-center text-slate-400">
            <Inbox className="w-10 h-10 mx-auto mb-3 text-brand-olive/40" />
            <p className="text-sm font-medium">No enquiries yet</p>
            <p className="text-xs mt-1">Add a Contact button (Enquiry form) to a hotspot to start collecting them.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-cream/40">
                <tr>
                  {['When', 'Name', 'Mobile', 'Product', 'Message', 'Via', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black text-brand-navy uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {leads.map(l => {
                  const editable = canEdit(l.tenant_id ?? '');
                  const phone = l.phone.replace(/[^0-9+]/g, '');
                  return (
                    <tr key={l.id} className="hover:bg-brand-cream/20 transition align-top">
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">{new Date(l.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 font-bold text-brand-navy">{l.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono text-slate-700">{l.phone}</span>
                        <span className="inline-flex gap-1 ml-2 align-middle">
                          <a href={`tel:${phone}`} className="text-slate-400 hover:text-brand-navy" title="Call"><Phone className="w-3.5 h-3.5" /></a>
                          <a href={`https://wa.me/${phone.replace('+', '')}`} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-emerald-600" title="WhatsApp"><MessageCircle className="w-3.5 h-3.5" /></a>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {products[l.product_id ?? '']?.name ?? '—'}
                        {isPlatformAdmin && <span className="block text-xs text-slate-400">{tenants.find(t => t.id === l.tenant_id)?.name}</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-xs">{l.message || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 uppercase">{l.source ?? ''}</td>
                      <td className="px-4 py-3">
                        {editable ? (
                          <select value={l.status} onChange={e => setStatus(l, e.target.value as Lead['status'])}
                            className={`text-xs font-bold rounded-lg px-2 py-1 border-2 bg-white ${l.status === 'new' ? 'border-brand-cerise/40 text-brand-cerise' : l.status === 'contacted' ? 'border-amber-300 text-amber-700' : 'border-slate-200 text-slate-500'}`}>
                            <option value="new">New</option>
                            <option value="contacted">Contacted</option>
                            <option value="closed">Closed</option>
                          </select>
                        ) : <span className="text-xs font-bold text-slate-500">{STATUS[l.status]}</span>}
                      </td>
                      <td className="px-4 py-3">
                        {editable && <button onClick={() => remove(l)} className="text-slate-300 hover:text-brand-cerise" title="Delete"><Trash2 className="w-4 h-4" /></button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
