// Input rules shared by the admin forms. The database enforces the same rules,
// so these only exist to give a clear message before the request is sent.

export const RESERVED_TENANT_SLUGS = ['admin', 'login', 'api', 'assets', 'static', 'auth', 'storage'];

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function toSlug(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export function slugError(slug: string, kind: 'tenant' | 'product' = 'product'): string | null {
  if (!slug) return 'Slug is required.';
  if (slug.length < 2 || slug.length > 60) return 'Slug must be 2 to 60 characters.';
  if (!SLUG_RE.test(slug)) return 'Use lowercase letters, numbers and single hyphens only.';
  if (kind === 'tenant' && RESERVED_TENANT_SLUGS.includes(slug)) return `"${slug}" is reserved. Pick another slug.`;
  return null;
}

export function hexColorError(color: string): string | null {
  return HEX_RE.test(color) ? null : 'Colour must be a 6 digit hex value like #0A2463.';
}

const YT_ID_RE = /^[\w-]{11}$/;

/** Returns the 11 character YouTube id, or null if the input is not a valid YouTube link or id. */
export function youtubeId(input: string): string | null {
  const trimmed = input.trim();
  if (YT_ID_RE.test(trimmed)) return trimmed;
  const m = trimmed.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([\w-]{11})/);
  return m?.[1] ?? null;
}

/** Only allow http(s) URLs for anything we will put in src attributes. */
export function isHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export function fileTooLarge(file: File, max: number): string | null {
  return file.size > max ? `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum is ${max / 1024 / 1024} MB.` : null;
}
