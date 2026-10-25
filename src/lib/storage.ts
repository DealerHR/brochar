import { supabase, STORAGE_BUCKET } from './supabase';

/*
  Storage helpers. Folder layout (enforced by storage RLS):
    tenants/{tenantId}/logo.*
    {tenantId}/products/{productId}/thumbnail.*
    {tenantId}/{productId}/pages/*.jpg
    {tenantId}/{productId}/audio/*, video/*, hotspot-images/*
    {tenantId}/{productId}/targets.mind
*/

export function publicUrl(path: string): string {
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Converts a public URL from this bucket back into its object path, or null. */
export function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/object/public/${STORAGE_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
}

export async function uploadFile(path: string, file: File | Blob, contentType?: string) {
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    upsert: true,
    contentType: contentType ?? (file instanceof File ? file.type || undefined : undefined),
  });
  if (error) throw new Error(error.message);
  // Cache-bust so a replaced file at the same path is not served stale by the CDN.
  return `${publicUrl(path)}?v=${Date.now()}`;
}

export async function removeFiles(paths: Array<string | null | undefined>) {
  const clean = paths.filter((p): p is string => !!p);
  if (!clean.length) return;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(clean);
  if (error) console.warn('storage remove', error.message);
}

/** Deletes every object under a folder prefix (recursive). */
export async function removeFolder(prefix: string) {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(prefix, { limit: 1000 });
  if (error || !data) return;
  const files: string[] = [];
  for (const entry of data) {
    const full = `${prefix}/${entry.name}`;
    // Folders come back without an id
    if (entry.id) files.push(full);
    else await removeFolder(full);
  }
  await removeFiles(files);
}

export function fileExtension(file: File, fallback = 'bin'): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  return (fromName || fallback).replace(/[^a-z0-9]/g, '') || fallback;
}
