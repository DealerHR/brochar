import { useState } from 'react';
import { TenantRole } from '../lib/supabase';
import { createUser, generatePassword } from '../lib/users';
import { UserPlus, RefreshCw, Copy, Check } from 'lucide-react';

type Props =
  | { mode: 'tenant'; tenantId: string; onDone: () => void }
  | { mode: 'platform'; onDone: () => void };

/**
 * Creates a login for a new person and gives them a role.
 * The admin shares the temporary password; the user changes it after first sign-in.
 */
export default function CreateUserForm(props: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(generatePassword);
  const [role, setRole] = useState<TenantRole>('editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ email: string; password: string; created: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await createUser(
        props.mode === 'tenant'
          ? { email, password, tenant_id: props.tenantId, role }
          : { email, password, platform_admin: true },
      );
      setDone({ email: result.email, password, created: result.created });
      setEmail('');
      setPassword(generatePassword());
      props.onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the user.');
    } finally {
      setBusy(false);
    }
  }

  async function copyDetails() {
    if (!done) return;
    const text = `BrochAR login\nSign in: ${window.location.origin}/login\nEmail: ${done.email}\nTemporary password: ${done.password}\nPlease change your password after signing in (Sign out menu → Change password).`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  }

  const input = "border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-navy transition";

  return (
    <div>
      {error && <div className="mb-3 p-3 bg-brand-cerise/5 border border-brand-cerise/20 rounded-xl text-brand-cerise text-xs font-medium">{error}</div>}

      {done && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm">
          <p className="font-bold text-emerald-700 mb-1">
            {done.created ? 'Login created.' : 'Existing account added.'} Share these details with {done.email}:
          </p>
          {done.created ? (
            <p className="font-mono text-xs text-slate-700 bg-white border border-emerald-100 rounded-lg px-3 py-2 mt-2">
              Email: {done.email}<br />Temporary password: {done.password}
            </p>
          ) : (
            <p className="text-xs text-slate-600 mt-1">They already had a login, so their existing password still works.</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            {done.created && (
              <button onClick={copyDetails} className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:underline">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy login details'}
              </button>
            )}
            <button onClick={() => setDone(null)} className="text-xs font-bold text-slate-400 hover:text-slate-600">Dismiss</button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-wrap gap-2 items-start">
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="person@company.com"
          className={`${input} flex-1 min-w-[180px]`} />
        <div className="flex items-center gap-1">
          <input type="text" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
            className={`${input} w-40 font-mono`} title="Temporary password" />
          <button type="button" onClick={() => setPassword(generatePassword())} title="New password"
            className="w-9 h-9 rounded-xl border-2 border-slate-200 flex items-center justify-center text-slate-400 hover:text-brand-navy hover:border-brand-navy transition">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        {props.mode === 'tenant' && (
          <select value={role} onChange={e => setRole(e.target.value as TenantRole)} className={`${input} bg-white`}>
            <option value="owner">Owner</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        )}
        <button type="submit" disabled={busy}
          className="inline-flex items-center gap-1.5 bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl transition">
          <UserPlus className="w-4 h-4" /> {busy ? 'Creating…' : props.mode === 'tenant' ? 'Create user' : 'Create admin'}
        </button>
      </form>
      <p className="text-xs text-slate-400 mt-2">
        If the email already has a login, it is simply given the role. New users sign in with the temporary password and then change it.
      </p>
    </div>
  );
}
