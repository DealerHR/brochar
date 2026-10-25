import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from '../lib/router';
import { Eye, EyeOff, Zap, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      setError('Invalid email or password. Please try again.');
    } else {
      navigate('/admin');
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-brand-cream relative overflow-hidden flex-col items-center justify-center p-12 border-r border-slate-200">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-olive/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-brand-sky/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#65743A 1px, transparent 1px), linear-gradient(90deg, #65743A 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative z-10 max-w-sm text-center">
          <div className="inline-flex items-center gap-2 mb-8">
            <div className="w-12 h-12 bg-brand-olive rounded-2xl flex items-center justify-center shadow-lg shadow-brand-olive/20">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <span className="text-3xl font-black">
              <span className="text-brand-navy">Broch</span><span className="text-brand-cerise">AR</span>
            </span>
          </div>
          <h2 className="text-4xl font-black text-brand-navy mb-4 leading-tight">
            Your brochures,<br />
            <span className="text-brand-cerise">reimagined</span>
          </h2>
          <p className="text-slate-500 text-base leading-relaxed mb-10">
            Build AR brochure experiences that customers can scan with any smartphone. No app needed.
          </p>
          <div className="grid grid-cols-2 gap-3 text-left">
            {[
              { val: '200+', label: 'Brands' },
              { val: '50K+', label: 'Sessions' },
              { val: '3x', label: 'Engagement' },
              { val: '98%', label: 'Satisfaction' },
            ].map(({ val, label }) => (
              <div key={label} className="bg-white border border-brand-olive/15 rounded-xl px-4 py-3 shadow-sm">
                <p className="text-xl font-black text-brand-olive">{val}</p>
                <p className="text-slate-400 text-xs font-medium mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-brand-cream/20">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <div className="w-10 h-10 bg-brand-cerise rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black">
              <span className="text-brand-navy">Broch</span><span className="text-brand-cerise">AR</span>
            </span>
          </div>

          <h1 className="text-3xl font-black text-brand-navy mb-1">Welcome back</h1>
          <p className="text-slate-500 text-sm mb-8">Sign in to your admin dashboard</p>

          {error && (
            <div className="mb-5 p-3.5 bg-brand-cerise/5 border border-brand-cerise/20 rounded-xl text-brand-cerise text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-brand-navy mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-white border-2 border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-navy placeholder-slate-400 transition"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-brand-navy mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full bg-white border-2 border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm pr-11 focus:outline-none focus:border-brand-navy placeholder-slate-400 transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-60 text-white font-bold py-3.5 px-4 rounded-xl transition text-sm mt-2 flex items-center justify-center gap-2 shadow-lg shadow-brand-navy/20"
            >
              {loading ? 'Signing in...' : (<>Sign in <ArrowRight className="w-4 h-4" /></>)}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            <button onClick={() => navigate('/')} className="text-brand-cerise hover:underline font-medium">
              Back to BrochAR home
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
