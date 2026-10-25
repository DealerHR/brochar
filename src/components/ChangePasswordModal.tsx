import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { KeyRound, X } from 'lucide-react';

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
    setBusy(false);
    if (error) setError(error.message); else setDone(true);
  }

  const input = "w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-navy transition";

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-brand-navy flex items-center gap-2"><KeyRound className="w-5 h-5 text-brand-cerise" /> Change password</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-brand-navy"><X className="w-5 h-5" /></button>
        </div>
        {done ? (
          <>
            <p className="text-sm text-slate-600 mb-4">Your password has been changed.</p>
            <button onClick={onClose} className="w-full bg-brand-navy text-white text-sm font-bold py-2.5 rounded-xl">Close</button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {error && <div className="p-3 bg-brand-cerise/5 border border-brand-cerise/20 rounded-xl text-brand-cerise text-xs font-medium">{error}</div>}
            <input type="password" required autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" className={input} />
            <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat new password" className={input} />
            <button type="submit" disabled={busy} className="w-full bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl transition">
              {busy ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
