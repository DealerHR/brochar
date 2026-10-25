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
import ClientLandingPage from './pages/ClientLandingPage';
import ARPlayerPage from './pages/ARPlayerPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-brand-cerise border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="clients" element={<ClientsListPage />} />
            <Route path="clients/new" element={<NewClientPage />} />
            <Route path="clients/:clientId" element={<ClientDetailPage />} />
            <Route path="clients/:clientId/products/new" element={<NewProductPage />} />
            <Route path="clients/:clientId/products/:productId" element={<ProductBuilderPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
          </Route>

          {/* Public client pages */}
          <Route path="/:tenantSlug" element={<ClientLandingPage />} />
          <Route path="/:tenantSlug/:productSlug" element={<ARPlayerPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
