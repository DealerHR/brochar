import { useEffect, useState } from 'react';
import { Link } from '../../lib/router';
import { supabase } from '../../lib/supabase';
import { Users, Package, Cpu, MousePointerClick, ArrowRight, Zap } from 'lucide-react';

type Stats = { clients: number; products: number; sessionsToday: number; tapsToday: number };

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ clients: 0, products: 0, sessionsToday: 0, tapsToday: 0 });
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().split('T')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    async function load() {
      const [{ count: clients }, { count: products }, { count: sessionsToday }, { count: tapsToday }] = await Promise.all([
        supabase.from('tenants').select('*', { count: 'exact', head: true }),
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('ar_events').select('*', { count: 'exact', head: true }).eq('event_type', 'session_start').eq('date_key', today),
        supabase.from('ar_events').select('*', { count: 'exact', head: true }).eq('event_type', 'hotspot_tapped').eq('date_key', today),
      ]);
      setStats({ clients: clients ?? 0, products: products ?? 0, sessionsToday: sessionsToday ?? 0, tapsToday: tapsToday ?? 0 });
      setLoading(false);
    }
    load();
  }, [today]);

  const cards = [
    { label: 'Total Clients', value: stats.clients, icon: Users, light: 'bg-brand-navy/10 text-brand-navy' },
    { label: 'Total Products', value: stats.products, icon: Package, light: 'bg-brand-olive/10 text-brand-olive' },
    { label: 'AR Sessions Today', value: stats.sessionsToday, icon: Cpu, light: 'bg-brand-sky/10 text-brand-sky' },
    { label: 'Hotspot Taps Today', value: stats.tapsToday, icon: MousePointerClick, light: 'bg-brand-cerise/10 text-brand-cerise' },
  ];

  return (
    <div>
      <div className="mb-8">
        <p className="text-brand-cerise font-bold text-sm uppercase tracking-widest mb-1">{greeting}</p>
        <h1 className="text-3xl font-black text-brand-navy">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Here's what's happening with BrochAR today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, light }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition">
            <div className="flex items-start justify-between mb-4">
              <p className="text-sm font-semibold text-slate-500">{label}</p>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${light} flex-shrink-0`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-4xl font-black text-brand-navy">
              {loading ? <span className="text-slate-200">—</span> : value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-brand-navy rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-cerise/20 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10">
            <div className="w-10 h-10 bg-brand-cerise rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-brand-cerise/30">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-white font-black text-xl mb-2">Create New Client</h2>
            <p className="text-white/50 text-sm mb-5 leading-relaxed">
              Onboard a new brand and start building their AR brochure experience.
            </p>
            <Link
              to="/admin/clients/new"
              className="inline-flex items-center gap-2 bg-brand-cerise hover:bg-brand-cerise/90 text-white font-bold px-5 py-2.5 rounded-xl transition text-sm shadow-lg shadow-brand-cerise/30"
            >
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <h2 className="text-brand-navy font-black text-lg mb-4">Platform Workflow</h2>
          <ol className="space-y-3">
            {[
              { step: '1', text: 'Create a client (brand)', color: 'bg-brand-navy text-white' },
              { step: '2', text: 'Add products to the client', color: 'bg-brand-olive text-white' },
              { step: '3', text: 'Upload brochure pages & place hotspots', color: 'bg-brand-sky text-white' },
              { step: '4', text: 'Compile image targets & set to Active', color: 'bg-brand-cerise text-white' },
              { step: '5', text: 'Share the public URL with the field team', color: 'bg-brand-navy text-white' },
            ].map(({ step, text, color }) => (
              <li key={step} className="flex items-center gap-3 text-sm text-slate-600">
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 ${color}`}>
                  {step}
                </span>
                {text}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
