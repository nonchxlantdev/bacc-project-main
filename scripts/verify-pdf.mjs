/**
 * Phase 1 + Phase 2 PDF fidelity: Annex D, Annex H, and Annex G register pagination.
 * Generates overlays first so register pagination is checked even without Poppler.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;

function run(script, args = []) {
  const result = spawnSync(node, [path.join(root, script), ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status) process.exit(result.status ?? 1);
}

run('scripts/smoke-overlay.mjs');
run('scripts/smoke-overlay-h.mjs');
run('scripts/smoke-register.mjs');
run('scripts/pdf-diff.mjs', [
  'tmp-pdf-diff/overlay-blank.pdf',
  'src/assets/forms/annex-d-drainage-ed01.pdf',
]);
run('scripts/pdf-diff.mjs', [
  'tmp-pdf-diff/overlay-h-blank.pdf',
  'src/assets/forms/annex-h-work-order-ed01.pdf',
]);
run('scripts/pdf-diff.mjs', [
  'tmp-pdf-diff/overlay-g-blank.pdf',
  'src/assets/forms/annex-g-noc-register-ed01.pdf',
]);
