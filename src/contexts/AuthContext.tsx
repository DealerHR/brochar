import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, TenantRole } from '../lib/supabase';

type Membership = { tenant_id: string; role: TenantRole };

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** LearnTech staff: full access to every tenant. */
  isPlatformAdmin: boolean;
  memberships: Membership[];
  /** True when the user may enter the admin area at all. */
  hasAdminAccess: boolean;
  roleFor: (tenantId: string) => TenantRole | 'admin' | null;
  canView: (tenantId: string) => boolean;
  canEdit: (tenantId: string) => boolean;
  canManage: (tenantId: string) => boolean;
  refreshRoles: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);

  const loadRoles = useCallback(async (uid: string | undefined) => {
    if (!uid) { setIsPlatformAdmin(false); setMemberships([]); return; }
    const [{ data: admin }, { data: members }] = await Promise.all([
      supabase.from('platform_admins').select('user_id').eq('user_id', uid).maybeSingle(),
      supabase.from('tenant_members').select('tenant_id, role').eq('user_id', uid),
    ]);
    setIsPlatformAdmin(!!admin);
    setMemberships((members ?? []) as Membership[]);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      setSession(session);
      setUser(session?.user ?? null);
      await loadRoles(session?.user?.id);
      if (active) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      await loadRoles(session?.user?.id);
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, [loadRoles]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setIsPlatformAdmin(false);
    setMemberships([]);
  }

  const roleFor = (tenantId: string): TenantRole | 'admin' | null => {
    if (isPlatformAdmin) return 'admin';
    return memberships.find(m => m.tenant_id === tenantId)?.role ?? null;
  };
  const canView = (tenantId: string) => roleFor(tenantId) !== null;
  const canEdit = (tenantId: string) => ['admin', 'owner', 'editor'].includes(roleFor(tenantId) ?? '');
  const canManage = (tenantId: string) => ['admin', 'owner'].includes(roleFor(tenantId) ?? '');

  return (
    <AuthContext.Provider value={{
      session, user, loading, isPlatformAdmin, memberships,
      hasAdminAccess: isPlatformAdmin || memberships.length > 0,
      roleFor, canView, canEdit, canManage,
      refreshRoles: () => loadRoles(user?.id),
      signIn, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
