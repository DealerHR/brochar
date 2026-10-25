import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import CreateUserForm from '../../components/CreateUserForm';
import { ShieldCheck, Trash2 } from 'lucide-react';

type Admin = { user_id: string; email: string; created_at: string };

export default function TeamPage() {
  const { isPlatformAdmin, user } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.rpc('list_platform_admins');
    setAdmins((data ?? []) as Admin[]);
    setLoading(false);
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

      {error && <div className="mb-4 p-3.5 bg-brand-cerise/5 border border-brand-cerise/20 rounded-xl text-brand-cerise text-sm font-medium">{error}</div>}

      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm mb-6">
        <h2 className="text-sm font-black text-brand-navy mb-3">Add a platform admin</h2>
        <CreateUserForm mode="platform" onDone={load} />
      </div>

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
