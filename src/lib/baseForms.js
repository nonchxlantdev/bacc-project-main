/**
 * URLs for the approved blank forms.
 *
 * Built at bundle time from the files themselves, so a form added to
 * `src/assets/forms/` is reachable without registering it twice. The key is the
 * file name, which is exactly what a field map's `basePdf` already holds.
 *
 * This exists for documents with nothing to overlay — Annex L is pre-printed
 * end to end, so asking the export API to stamp nothing onto it would be a
 * round-trip to produce a copy of a file we already ship. Opening the asset is
 * faster, works with no server, and shows a real file name in the viewer
 * instead of a blob UUID.
 */
const BY_PATH = import.meta.glob('../assets/forms/*.pdf', {
  query: '?url',
  import: 'default',
  eager: true,
});

const BY_NAME = Object.fromEntries(
  Object.entries(BY_PATH).map(([path, url]) => [path.split('/').pop(), url]),
);

export function baseFormUrl(fileName) {
  return fileName ? BY_NAME[fileName] ?? null : null;
}
