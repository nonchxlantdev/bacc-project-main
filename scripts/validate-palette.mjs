import { PALETTE_VALIDATION, SERIES_PALETTE_VALIDATION } from '../src/config/chartPalette.js';

function print(name, result) {
  console.log(name, result.ok ? 'PASS' : 'FAIL');
  if (!result.ok) {
    console.error(JSON.stringify(result.failures, null, 2));
    process.exitCode = 1;
  }
}

print('deficiency-level categorical', PALETTE_VALIDATION);
print('series categorical (first 4)', SERIES_PALETTE_VALIDATION);
