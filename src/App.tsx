import { BrowserRouter, Routes, Route, Navigate } from './lib/router';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import ClientsListPage from './pages/admin/ClientsListPage';
import NewClientPage from './pages/admin/NewClientPage';
import ClientDetailPage from './pages/admin/ClientDetailPage';
import NewProductPage from './pages/admin/NewProductPage';
import ProductBuilderPage from './pages/admin/ProductBuilderPage';
import AnalyticsPage from './pages/admin/AnalyticsPage';
import TeamPage from './pages/admin/TeamPage';
import LeadsPage from './pages/admin/LeadsPage';
import ClientLandingPage from './pages/ClientLandingPage';
import ARPlayerPage from './pages/ARPlayerPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { ShieldOff } from 'lucide-react';

function NoAccess() {
  const { signOut, user } = useAuth();
  return (
    <div className="min-h-screen bg-brand-cream/30 flex flex-col items-center justify-center p-6 text-center">
      <ShieldOff className="w-12 h-12 text-brand-navy/30 mb-4" />
      <h1 className="text-2xl font-black text-brand-navy mb-2">No workspace access</h1>
      <p className="text-slate-500 text-sm max-w-sm mb-6">
        {user?.email} is signed in but has not been added to any client workspace yet. Ask your BrochAR administrator to add you.
      </p>
      <button onClick={() => signOut()} className="bg-brand-navy text-white text-sm font-bold px-5 py-2.5 rounded-xl">
        Sign out
      </button>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, hasAdminAccess } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-brand-cerise border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!session) return <Navigate to="/login" replace />;
  if (!hasAdminAccess) return <NoAccess />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="clients" element={<ClientsListPage />} />
            <Route path="clients/new" element={<NewClientPage />} />
            <Route path="clients/:clientId" element={<ClientDetailPage />} />
            <Route path="clients/:clientId/products/new" element={<NewProductPage />} />
            <Route path="clients/:clientId/products/:productId" element={<ProductBuilderPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="team" element={<TeamPage />} />
          </Route>

          {/* Public client pages */}
          <Route path="/:tenantSlug" element={<ClientLandingPage />} />
          <Route path="/:tenantSlug/:productSlug" element={<ARPlayerPage />} />
          <Route path="/:tenantSlug/:productSlug/team" element={<ARPlayerPage teamMode />} />
          <Route path="/:tenantSlug/:productSlug/learn" element={<ARPlayerPage teamMode />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
