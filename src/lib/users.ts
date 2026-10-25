import { supabase, TenantRole } from './supabase';

export type CreateUserInput = {
  email: string;
  password: string;
  tenant_id?: string;
  role?: TenantRole;
  platform_admin?: boolean;
};

/** Calls the create-user edge function. Returns the created/attached user, or throws with a readable message. */
export async function createUser(input: CreateUserInput): Promise<{ created: boolean; email: string }> {
  const { data, error } = await supabase.functions.invoke('create-user', { body: input });
  if (error) {
    // The function returns its own JSON error body on 4xx; surface that text.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try { const j = await ctx.json(); if (j?.error) throw new Error(j.error); } catch (e) { if (e instanceof Error && e.message) throw e; }
    }
    throw new Error(error.message || 'Could not create the user.');
  }
  if (data?.error) throw new Error(data.error);
  return { created: !!data?.created, email: data?.email ?? input.email };
}

const PW_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** A readable 12 character temporary password (no 0/O/1/l look-alikes). */
export function generatePassword(): string {
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, n => PW_CHARS[n % PW_CHARS.length]).join('');
}
