import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from '../lib/router';
import { Zap } from 'lucide-react';

/**
 * Landing page for the password-reset email link. Supabase puts a recovery
 * session in the URL; once the client picks it up we can set a new password.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
    setBusy(false);
    if (error) { setError(error.message); return; }
    navigate('/admin', true);
  }

  const input = "w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-navy transition";

  return (
    <div className="min-h-screen bg-brand-cream/20 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 bg-brand-cerise rounded-xl flex items-center justify-center"><Zap className="w-6 h-6 text-white" /></div>
          <span className="text-2xl font-black"><span className="text-brand-navy">Broch</span><span className="text-brand-cerise">AR</span></span>
        </div>
        <h1 className="text-2xl font-black text-brand-navy mb-1">Set a new password</h1>
        {!ready ? (
          <p className="text-sm text-slate-500">Checking your reset link… If this takes more than a few seconds, the link may have expired. Request a new one from the sign-in page.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4 mt-6">
            {error && <div className="p-3 bg-brand-cerise/5 border border-brand-cerise/20 rounded-xl text-brand-cerise text-sm font-medium">{error}</div>}
            <input type="password" required autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" className={input} />
            <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat new password" className={input} />
            <button type="submit" disabled={busy} className="w-full bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm transition">
              {busy ? 'Saving…' : 'Save and sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
