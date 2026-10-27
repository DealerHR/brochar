// Shrinks photos in the browser before they are uploaded, so the floor app and
// the recognise function move small files. A phone photo of 3–6 MB becomes
// roughly 50–120 KB at these sizes with no visible loss on a phone screen.

/** Longest side and JPEG quality for each kind of photo. */
export const IMAGE_PRESETS = {
  /** Floor recognition reference photos: what the model compares against. */
  reference: { maxSide: 640, quality: 0.78 },
  /** Product thumbnails shown in the floor app and on the client page. */
  thumbnail: { maxSide: 800, quality: 0.8 },
} as const;

async function decode(src: Blob): Promise<{ draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; width: number; height: number; close: () => void }> {
  // createImageBitmap honours EXIF rotation and is faster than <img> where available.
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(src, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(src);
  const img = new Image();
  img.src = url;
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Could not read the photo.')); });
  return { draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

/** Returns a JPEG no larger than maxSide on its longest side. */
export async function compressImage(src: Blob, preset: { maxSide: number; quality: number }): Promise<Blob> {
  const d = await decode(src);
  try {
    const scale = Math.min(1, preset.maxSide / Math.max(d.width, d.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(d.width * scale));
    canvas.height = Math.max(1, Math.round(d.height * scale));
    const ctx = canvas.getContext('2d')!;
    // JPEG has no transparency: paint white under PNGs with alpha.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    d.draw(ctx, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', preset.quality));
    if (!blob) throw new Error('Could not compress the photo.');
    // Never upload something bigger than the original (already-small files).
    return blob.size < src.size || src.type !== 'image/jpeg' ? blob : src;
  } finally { d.close(); }
}

/** Downloads an already-uploaded photo and compresses it (for photos added before compression existed). */
export async function compressFromUrl(url: string, preset: { maxSide: number; quality: number }): Promise<{ blob: Blob; before: number }> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Could not download ${url}`);
  const src = await r.blob();
  return { blob: await compressImage(src, preset), before: src.size };
}

export const formatKB = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
