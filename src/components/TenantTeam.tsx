import { useEffect, useState } from 'react';
import { supabase, TenantMember, TenantRole } from '../lib/supabase';
import CreateUserForm from './CreateUserForm';
import { Users, Trash2 } from 'lucide-react';

const ROLE_HELP: Record<TenantRole, string> = {
  owner: 'Edit content, client details and team',
  editor: 'Edit products and brochures',
  viewer: 'View content and analytics only',
};

export default function TenantTeam({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const { data } = await supabase.rpc('list_tenant_members', { tid: tenantId });
    setMembers((data ?? []) as TenantMember[]);
  }

  async function changeRole(m: TenantMember, newRole: TenantRole) {
    const { error } = await supabase.rpc('set_tenant_member_role', { tid: tenantId, member_user_id: m.user_id, member_role: newRole });
    if (error) setError(error.message); else await load();
  }

  async function remove(m: TenantMember) {
    if (!window.confirm(`Remove ${m.email} from this client?`)) return;
    const { error } = await supabase.rpc('remove_tenant_member', { tid: tenantId, member_user_id: m.user_id });
    if (error) setError(error.message); else await load();
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-brand-navy" />
        <h2 className="text-base font-black text-brand-navy">Team</h2>
      </div>
      <p className="text-xs text-slate-400 mb-4">People who can sign in and work on this client.</p>

      {error && <div className="mb-3 p-3 bg-brand-cerise/5 border border-brand-cerise/20 rounded-xl text-brand-cerise text-xs font-medium">{error}</div>}

      {canManage && (
        <div className="mb-5 pb-5 border-b border-slate-100">
          <CreateUserForm mode="tenant" tenantId={tenantId} onDone={load} />
        </div>
      )}

      {members.length === 0 ? (
        <p className="text-sm text-slate-400">No client users yet. Platform admins can still manage this client.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {members.map(m => (
            <div key={m.user_id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-brand-navy truncate">{m.email}</p>
                <p className="text-xs text-slate-400">{ROLE_HELP[m.role]}</p>
              </div>
              {canManage ? (
                <>
                  <select value={m.role} onChange={e => changeRole(m, e.target.value as TenantRole)}
                    className="border-2 border-slate-200 rounded-lg px-2 py-1 text-xs bg-white font-bold text-slate-600">
                    <option value="owner">Owner</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button onClick={() => remove(m)} className="text-slate-300 hover:text-brand-cerise transition" title="Remove">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <span className="text-xs font-bold text-slate-500 capitalize">{m.role}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
