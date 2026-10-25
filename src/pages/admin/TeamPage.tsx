import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, UserPlus, Trash2, Info } from 'lucide-react';

type Admin = { user_id: string; email: string; created_at: string };

export default function TeamPage() {
  const { isPlatformAdmin, user } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.rpc('list_platform_admins');
    setAdmins((data ?? []) as Admin[]);
    setLoading(false);
  }

  async function addAdmin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.rpc('add_platform_admin', { admin_email: email });
    if (error) setError(error.message);
    else { setEmail(''); await load(); }
    setBusy(false);
  }

  async function removeAdmin(a: Admin) {
    if (!window.confirm(`Remove ${a.email} as a platform admin?`)) return;
    const { error } = await supabase.from('platform_admins').delete().eq('user_id', a.user_id);
    if (error) setError(error.message);
    else await load();
  }

  if (!isPlatformAdmin) return <div className="text-slate-500">Platform admins only.</div>;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <p className="text-brand-cerise font-bold text-xs uppercase tracking-widest mb-1">Access</p>
        <h1 className="text-3xl font-black text-brand-navy">Platform Team</h1>
        <p className="text-slate-400 text-sm mt-1">Platform admins can see and edit every client. Client users are added on each client's page.</p>
      </div>

      <div className="mb-5 flex gap-3 bg-brand-sky/5 border border-brand-sky/20 rounded-2xl p-4 text-sm text-slate-600">
        <Info className="w-4 h-4 text-brand-sky flex-shrink-0 mt-0.5" />
        <p>Users are created in the Supabase dashboard (Authentication → Users). Once a user exists, add their email here or on a client's Team section.</p>
      </div>

      {error && <div className="mb-4 p-3.5 bg-brand-cerise/5 border border-brand-cerise/20 rounded-xl text-brand-cerise text-sm font-medium">{error}</div>}

      <form onSubmit={addAdmin} className="flex gap-2 mb-6">
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@learntech.in"
          className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-navy transition" />
        <button type="submit" disabled={busy}
          className="inline-flex items-center gap-2 bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-50 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition">
          <UserPlus className="w-4 h-4" /> Add admin
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
        {loading ? (
          <div className="p-6 animate-pulse h-16" />
        ) : admins.map(a => (
          <div key={a.user_id} className="flex items-center gap-3 px-5 py-3.5">
            <div className="w-8 h-8 bg-brand-navy rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-brand-navy truncate">{a.email}{a.user_id === user?.id && <span className="text-slate-400 font-medium"> (you)</span>}</p>
              <p className="text-xs text-slate-400">Added {new Date(a.created_at).toLocaleDateString()}</p>
            </div>
            {a.user_id !== user?.id && (
              <button onClick={() => removeAdmin(a)} className="text-slate-300 hover:text-brand-cerise transition" title="Remove">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
