// Edge function: create-user
//
// Lets a signed-in platform admin (or a client owner, for their own client)
// create a login for someone else. The service role key stays on the server.
//
// POST body (JSON):
//   { email, password, tenant_id?, role?, platform_admin? }
//   - password: temporary password the admin shares with the new user
//   - tenant_id + role ('owner' | 'editor' | 'viewer'): add them to a client
//   - platform_admin: true to make them a platform admin (platform admins only)
//
// If the email already exists, the account is reused and only the role is added.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'Sign in first.' });

  // Client acting as the caller: used to check who they are and what they may do.
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user: callerUser }, error: callerErr } = await caller.auth.getUser();
  if (callerErr || !callerUser) return json(401, { error: 'Sign in first.' });

  let body: { email?: string; password?: string; tenant_id?: string; role?: string; platform_admin?: boolean };
  try { body = await req.json(); } catch { return json(400, { error: 'Bad request body.' }); }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  const tenantId = body.tenant_id ?? null;
  const role = body.role ?? 'editor';
  const makePlatformAdmin = body.platform_admin === true;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Enter a valid email address.' });
  if (!['owner', 'editor', 'viewer'].includes(role)) return json(400, { error: 'Role must be owner, editor or viewer.' });
  if (!tenantId && !makePlatformAdmin) return json(400, { error: 'Choose a client or platform admin.' });

  // Permission checks run as the caller through the same SQL helpers RLS uses.
  const { data: isAdmin } = await caller.rpc('is_platform_admin');
  if (makePlatformAdmin && !isAdmin) return json(403, { error: 'Only platform admins can add platform admins.' });
  if (tenantId) {
    const { data: canManage } = await caller.rpc('can_manage_tenant', { tid: tenantId });
    if (!canManage) return json(403, { error: 'You cannot manage this client.' });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Reuse an existing account for this email, otherwise create one.
  let userId: string | null = null;
  let created = false;
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find(u => (u.email ?? '').toLowerCase() === email);
  if (existing) {
    userId = existing.id;
  } else {
    if (password.length < 8) return json(400, { error: 'Temporary password must be at least 8 characters.' });
    const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { created_by: callerUser.email, must_change_password: true },
    });
    if (createErr || !createdUser.user) return json(400, { error: createErr?.message ?? 'Could not create user.' });
    userId = createdUser.user.id;
    created = true;
  }

  if (tenantId) {
    const { error } = await admin.from('tenant_members')
      .upsert({ tenant_id: tenantId, user_id: userId, role }, { onConflict: 'tenant_id,user_id' });
    if (error) return json(400, { error: error.message });
  }
  if (makePlatformAdmin) {
    const { error } = await admin.from('platform_admins').upsert({ user_id: userId }, { onConflict: 'user_id' });
    if (error) return json(400, { error: error.message });
  }

  return json(200, { ok: true, created, user_id: userId, email });
});
