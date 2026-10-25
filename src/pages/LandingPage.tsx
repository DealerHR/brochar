import { useState } from 'react';
import { useNavigate } from '../lib/router';
import { Zap, Target, MousePointerClick, BarChart3, Users, Layers, ArrowRight, Play, Check, ChevronRight } from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-olive rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-brand-navy font-black text-xl tracking-tight">
              Broch<span className="text-brand-cerise">AR</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')}
              className="text-slate-500 hover:text-brand-navy text-sm font-semibold transition px-3 py-2">
              Sign In
            </button>
            <button onClick={() => navigate('/login')}
              className="bg-brand-olive hover:bg-brand-olive/90 text-white text-sm font-black px-4 py-2 rounded-xl transition shadow-md shadow-brand-olive/20">
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-28 pb-16 bg-white relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-0 w-72 h-72 bg-brand-olive/8 rounded-full blur-3xl" />
          <div className="absolute top-1/3 right-0 w-64 h-64 bg-brand-sky/8 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/3 w-96 h-48 bg-brand-cerise/5 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
          <div className="flex flex-col lg:flex-row items-center gap-14">
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-brand-olive/10 border border-brand-olive/20 rounded-full px-4 py-2 mb-6">
                <div className="w-2 h-2 bg-brand-olive rounded-full animate-pulse" />
                <span className="text-brand-olive text-xs font-bold uppercase tracking-widest">AR-Powered Brochures</span>
              </div>
              <h1 className="text-5xl sm:text-6xl font-black text-brand-navy leading-[1.05] mb-6">
                Bring Your<br />
                <span className="text-brand-cerise">Brochures</span><br />
                <span className="text-brand-olive">To Life</span>
              </h1>
              <p className="text-slate-500 text-lg font-medium leading-relaxed mb-8 max-w-lg mx-auto lg:mx-0">
                Transform static print into immersive AR experiences. Customers scan your brochure — hotspots reveal videos, audio, and rich content instantly.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-3 justify-center lg:justify-start">
                <button onClick={() => navigate('/login')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-brand-cerise hover:bg-brand-cerise/90 text-white font-black px-8 py-4 rounded-2xl transition shadow-xl shadow-brand-cerise/20 text-base">
                  Start Building Free <ArrowRight className="w-5 h-5" />
                </button>
                <button onClick={() => setVideoOpen(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold px-6 py-4 rounded-2xl transition text-base">
                  <Play className="w-4 h-4 text-brand-cerise" /> Watch Demo
                </button>
              </div>
            </div>

            {/* Phone mockup */}
            <div className="flex-shrink-0 w-64 lg:w-72 relative">
              <div className="bg-slate-900 border-4 border-slate-200 rounded-[2.5rem] shadow-2xl overflow-hidden aspect-[9/19]">
                <div className="bg-slate-900 h-full flex flex-col">
                  <div className="bg-black px-4 pt-3 pb-2 flex items-center justify-between">
                    <span className="text-white text-xs font-bold">9:41</span>
                    <div className="w-20 h-4 bg-black rounded-full" />
                    <div className="flex gap-1">
                      <div className="w-3 h-1.5 bg-white/60 rounded-sm" />
                      <div className="w-1 h-1.5 bg-white/40 rounded-sm" />
                    </div>
                  </div>
                  <div className="flex-1 bg-gradient-to-b from-slate-800 to-slate-900 relative flex items-center justify-center p-4">
                    <div className="absolute inset-4 border-2 border-brand-sky/40 rounded-2xl">
                      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-brand-sky rounded-tl-lg" />
                      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-brand-sky rounded-tr-lg" />
                      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-brand-sky rounded-bl-lg" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-brand-sky rounded-br-lg" />
                    </div>
                    <div className="text-center z-10">
                      <div className="w-12 h-12 bg-brand-cerise/20 border border-brand-cerise/40 rounded-full flex items-center justify-center mx-auto mb-2 animate-pulse">
                        <Target className="w-6 h-6 text-brand-cerise" />
                      </div>
                      <span className="text-white/60 text-xs font-medium">Scanning brochure...</span>
                    </div>
                    <div className="absolute top-1/3 left-1/3 w-6 h-6 bg-brand-cerise rounded-full border-2 border-white shadow-lg flex items-center justify-center animate-pulse">
                      <span className="text-white text-xs font-black">1</span>
                    </div>
                    <div className="absolute bottom-1/3 right-1/3 w-6 h-6 bg-brand-olive rounded-full border-2 border-white shadow-lg flex items-center justify-center">
                      <span className="text-white text-xs font-black">2</span>
                    </div>
                  </div>
                  <div className="bg-black/50 px-4 py-3 flex items-center justify-between">
                    <div className="w-6 h-6 bg-white/10 rounded-full" />
                    <div className="w-8 h-8 bg-brand-cerise/80 rounded-full flex items-center justify-center">
                      <div className="w-3 h-3 bg-white rounded-full" />
                    </div>
                    <div className="w-6 h-6 bg-white/10 rounded-full" />
                  </div>
                </div>
              </div>

              {/* Floating cards */}
              <div className="absolute -left-10 top-1/4 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 w-36 animate-float">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-5 h-5 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <Check className="w-3 h-3 text-emerald-600" />
                  </div>
                  <span className="text-xs font-black text-brand-navy">Target Found</span>
                </div>
                <p className="text-xs text-slate-400 font-medium">AR loading...</p>
              </div>
              <div className="absolute -right-8 bottom-1/3 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 w-32">
                <p className="text-xs font-bold text-slate-400 mb-1">Sessions Today</p>
                <p className="text-2xl font-black text-brand-cerise">247</p>
                <p className="text-xs text-emerald-500 font-bold mt-0.5">+18%</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-brand-cream border-y border-brand-olive/15 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { value: '200+', label: 'Active Brands' },
              { value: '50K+', label: 'AR Sessions' },
              { value: '3x', label: 'Engagement Lift' },
              { value: '98%', label: 'Client Satisfaction' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-4xl font-black text-brand-navy">{value}</p>
                <p className="text-sm font-bold text-brand-olive mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-brand-olive font-bold text-xs uppercase tracking-widest mb-3">Features</p>
            <h2 className="text-4xl font-black text-brand-navy">Everything you need</h2>
            <p className="text-slate-400 text-lg mt-3 max-w-xl mx-auto font-medium">A complete platform to build, deploy, and track AR brochure experiences at scale.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Layers, color: 'bg-brand-olive/10', ic: 'text-brand-olive', title: 'Visual Page Builder', desc: 'Upload PDF or image pages and place interactive hotspots anywhere with a single click.' },
              { icon: Target, color: 'bg-brand-cerise/10', ic: 'text-brand-cerise', title: 'Image Target Compilation', desc: 'In-browser MindAR compilation. No server uploads. Your images never leave your device.' },
              { icon: MousePointerClick, color: 'bg-brand-sky/10', ic: 'text-brand-sky', title: 'Rich Hotspot Media', desc: 'Each hotspot can play audio (TTS or uploaded), video (YouTube or file), or rich descriptions.' },
              { icon: Zap, color: 'bg-brand-olive/10', ic: 'text-brand-olive', title: 'No App Required', desc: 'Customers launch the AR experience right in their browser. No downloads, no friction.' },
              { icon: Users, color: 'bg-brand-cerise/10', ic: 'text-brand-cerise', title: 'Multi-Client Platform', desc: 'Manage multiple brand clients from one dashboard. Each gets their own branded portal.' },
              { icon: BarChart3, color: 'bg-brand-sky/10', ic: 'text-brand-sky', title: 'Real-Time Analytics', desc: 'Track sessions, target detections, and hotspot taps per product and per client.' },
            ].map(({ icon: Icon, color, ic, title, desc }) => (
              <div key={title} className="bg-white border border-slate-100 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${color} group-hover:scale-110 transition`}>
                  <Icon className={`w-6 h-6 ${ic}`} />
                </div>
                <h3 className="font-black text-brand-navy text-base mb-2">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed font-medium">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 sm:px-6 bg-brand-cream/60 border-y border-brand-olive/10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-brand-olive font-bold text-xs uppercase tracking-widest mb-3">Process</p>
            <h2 className="text-4xl font-black text-brand-navy">How it works</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { n: '01', title: 'Upload Your Brochure', desc: 'Upload PDF or image files. The system auto-converts each page into an AR image target.', color: 'text-brand-cerise', bg: 'bg-brand-cerise/10 border-brand-cerise/20' },
              { n: '02', title: 'Add Hotspots', desc: 'Click anywhere on the page to place interactive hotspots. Attach videos, audio, or text.', color: 'text-brand-olive', bg: 'bg-brand-olive/10 border-brand-olive/20' },
              { n: '03', title: 'Share & Track', desc: 'Publish your brochure. Customers scan it with any phone browser — no app needed.', color: 'text-brand-sky', bg: 'bg-brand-sky/10 border-brand-sky/20' },
            ].map(({ n, title, desc, color, bg }) => (
              <div key={n} className={`bg-white border rounded-2xl p-6 ${bg}`}>
                <p className={`font-black text-5xl mb-4 ${color}`}>{n}</p>
                <h3 className="font-black text-brand-navy text-base mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <div className="bg-brand-cream/60 border border-brand-olive/15 rounded-3xl p-12">
            <p className="text-brand-olive font-bold text-xs uppercase tracking-widest mb-4">Get Started Today</p>
            <h2 className="text-4xl font-black text-brand-navy mb-4">Ready to launch your first AR brochure?</h2>
            <p className="text-slate-500 text-lg mb-8 font-medium">Join leading brands using BrochAR to turn print into immersive experiences.</p>
            <button onClick={() => navigate('/login')}
              className="inline-flex items-center gap-2 bg-brand-cerise hover:bg-brand-cerise/90 text-white font-black px-10 py-4 rounded-2xl text-lg transition shadow-xl shadow-brand-cerise/20">
              Get Started Free <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-brand-cream border-t border-brand-olive/15 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-brand-olive rounded-lg flex items-center justify-center">
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="text-brand-navy font-black">Broch<span className="text-brand-cerise">AR</span></span>
          </div>
          <p className="text-slate-400 text-xs font-medium">&copy; {new Date().getFullYear()} LearnTech Consulting. All rights reserved.</p>
        </div>
      </footer>

      {/* Video modal */}
      {videoOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setVideoOpen(false)}>
          <div className="bg-white rounded-2xl p-4 w-full max-w-2xl shadow-2xl">
            <div className="aspect-video bg-slate-100 rounded-xl flex items-center justify-center">
              <div className="text-center text-slate-400">
                <Play className="w-16 h-16 mx-auto mb-3 text-brand-olive/40" />
                <p className="font-bold text-brand-navy">Demo video coming soon</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
