import path from 'node:path';
import { readFileSync } from 'node:fs';
import { launch, newPage, BASE_URL, SHOTS, ROOT } from './harness.mjs';

const raw = readFileSync(path.join(ROOT, '.env.local'), 'utf8').replace(/^\uFEFF/, '');
const env = Object.fromEntries(
  raw
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1)];
    }),
);

const { context, page, diagnostics } = await newPage(await launch(), {
  name: 'desktop',
  width: 1280,
  height: 800,
  mobile: false,
});
page.setDefaultTimeout(20000);
await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const html = await page.content();
const text = await page.locator('body').innerText();
console.log('--- body ---');
console.log(text.slice(0, 1500));
console.log('--- inputs ---');
console.log(await page.locator('input').evaluateAll((els) => els.map((e) => ({ type: e.type, auto: e.autocomplete, name: e.name }))));
console.log('pw_len', env.SEED_PASSWORD?.length);
const emailInput = page.locator('input').first();
await emailInput.fill('glenrick.spain@pgia.local');
await page.locator('input[type="password"]').fill(env.SEED_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForTimeout(4000);
console.log('--- after submit url ---', page.url());
console.log(await page.locator('body').innerText().then((t) => t.slice(0, 1200)));
console.log('pageErrors', diagnostics.pageErrors);
console.log('console', diagnostics.console.filter((c) => c.type === 'error').map((c) => c.text.slice(0, 300)));
await page.screenshot({ path: path.join(SHOTS, 'debug-login.png') });
await context.close();
