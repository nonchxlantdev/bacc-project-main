/**
 * Client-side image compression.
 *
 * Field photos come off phone cameras at 3–8 MB. Queued uncompressed they
 * exhaust browser storage quota, and an evicted queue means an inspector loses
 * work completed airside. Compress on capture, before anything is stored.
 */

const MAX_EDGE = 1400;
const QUALITY = 0.75;

export async function compressImage(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { blob, dataUrl, width, height, bytes: blob?.size ?? 0 };
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> decode */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
