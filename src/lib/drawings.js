/**
 * Annex K drawings in d1 mode: compressed on attach and capped per checklist,
 * so a checklist row set stays small in D1 (spec 3a §4).
 */
import { DRAWING_MAX_BYTES } from './dataMode.js';
import { compressImage } from './imageCompress.js';

export const DRAWING_TOO_LARGE = 'This drawing is too large even after compression.';

/** Total drawings across every section of a record's `attachments`. */
export function countDrawings(attachments) {
  if (!attachments || typeof attachments !== 'object') return 0;
  return Object.values(attachments).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
}

/** JPEG, longest edge 1400 px, quality 0.75. Throws DRAWING_TOO_LARGE over ~600 KB. */
export async function compressDrawing(file) {
  const { dataUrl, bytes } = await compressImage(file);
  if (!dataUrl || bytes > DRAWING_MAX_BYTES) throw new Error(DRAWING_TOO_LARGE);
  return { dataUri: dataUrl, contentType: 'image/jpeg' };
}
