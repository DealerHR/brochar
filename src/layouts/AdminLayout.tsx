import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from '../lib/router';
import { useAuth } from '../contexts/AuthContext';
import ChangePasswordModal from '../components/ChangePasswordModal';
import {
  LayoutDashboard, Users, BarChart2, LogOut, Menu, X, ChevronRight, Zap, ShieldCheck, KeyRound
} from 'lucide-react';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, adminOnly: false },
  { to: '/admin/clients', label: 'Clients', icon: Users, end: false, adminOnly: false },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart2, end: false, adminOnly: false },
  { to: '/admin/team', label: 'Platform Team', icon: ShieldCheck, end: false, adminOnly: true },
];

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const { signOut, user, isPlatformAdmin, memberships } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 w-64 bg-brand-navy flex flex-col z-30 transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/10">
          <div className="w-8 h-8 bg-brand-cerise rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-brand-cerise/30">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-black text-lg">
            <span className="text-white">Broch</span><span className="text-brand-cerise">AR</span>
          </span>
          <button className="ml-auto text-white/40 hover:text-white lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {navItems.filter(n => !n.adminOnly || isPlatformAdmin).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                  isActive
                    ? 'bg-brand-cerise text-white shadow-lg shadow-brand-cerise/30'
                    : 'text-white/50 hover:text-white hover:bg-white/8'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span>{label}</span>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto opacity-70" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 pb-5 border-t border-white/10 pt-4">
          <div className="flex items-center gap-3 px-3 py-2.5 mb-1 rounded-xl bg-white/5">
            <div className="w-8 h-8 bg-brand-cerise rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black text-white uppercase">
              {user?.email?.[0] ?? 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">
                {isPlatformAdmin ? 'Platform admin' : memberships.length === 1 ? `Client ${memberships[0].role}` : 'Client user'}
              </p>
              <p className="text-xs text-white/40 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => setChangingPassword(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-white/40 hover:text-white hover:bg-white/8 transition"
          >
            <KeyRound className="w-4 h-4" />
            <span>Change password</span>
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-white/40 hover:text-white hover:bg-white/8 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 h-16 flex items-center px-4 lg:px-6 sticky top-0 z-10 shadow-sm">
          <button className="lg:hidden text-slate-500 hover:text-brand-navy mr-3 transition" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="lg:hidden flex items-center gap-2">
            <span className="font-black text-lg">
              <span className="text-brand-navy">Broch</span><span className="text-brand-cerise">AR</span>
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {user?.user_metadata?.must_change_password && (
              <button onClick={() => setChangingPassword(true)}
                className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 hover:bg-amber-100 transition">
                You are using a temporary password — change it
              </button>
            )}
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-xs text-slate-400 font-medium hidden sm:block">Platform Live</span>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
