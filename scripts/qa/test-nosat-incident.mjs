/**
 * Focused live test: start Annex D, mark NO SAT, create an incident.
 *
 *   $env:NODE_OPTIONS='--use-system-ca'
 *   $env:QA_BASE_URL='http://localhost:5176'
 *   node scripts/qa/test-nosat-incident.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { launch, newPage, BASE_URL, SHOTS, ROOT } from './harness.mjs';

function loadEnvLocal() {
  try {
    const raw = readFileSync(path.join(ROOT, '.env.local'), 'utf8').replace(/^\uFEFF/, '');
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i).trim(), l.slice(i + 1)];
        }),
    );
  } catch {
    return {};
  }
}

const fileEnv = loadEnvLocal();
const EMAIL = process.env.QA_EMAIL || 'glenrick.spain@pgia.local';
const PASSWORD = (process.env.QA_PASSWORD || fileEnv.SEED_PASSWORD || '').replace(/\r$/, '');

if (!PASSWORD) {
  console.error('Need QA_PASSWORD or SEED_PASSWORD');
  process.exit(1);
}

async function liveSignIn(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="password"]').waitFor({ timeout: 20000 });
  await page.locator('form input').first().fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(
    () => /Welcome back/.test(document.body?.innerText || '') || /\/dashboard/.test(location.pathname),
    { timeout: 25000 },
  );
}

const browser = await launch();
const { context, page, diagnostics } = await newPage(browser, {
  name: 'desktop-1440x900',
  width: 1440,
  height: 900,
  mobile: false,
});
page.setDefaultTimeout(20000);

const findings = [];
function fail(msg) {
  findings.push(msg);
  console.log(`  FAIL  ${msg}`);
}
function ok(msg) {
  console.log(`  ok    ${msg}`);
}

try {
  console.log(`\n=== NO SAT → incident against ${BASE_URL} as ${EMAIL} ===\n`);
  await liveSignIn(page, EMAIL, PASSWORD);
  ok('signed in');

  await page.goto(`${BASE_URL}/checklists/mine`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /new inspection/i }).click();
  await page.getByRole('heading', { name: 'New Inspection' }).waitFor();
  const drainage = page.locator('div.fixed.inset-0 ul button').filter({ hasText: /Annex D|Drainage/i }).first();
  if (!(await drainage.count())) {
    fail('Drainage form not in picker');
  } else {
    await drainage.click();
    await page.waitForURL(/\/checklists\/[0-9a-f-]{8,}/i, { timeout: 20000 });
    ok(`opened ${page.url()}`);
  }

  await page.waitForSelector('input[aria-label$=" SAT"]', { state: 'attached', timeout: 15000 });
  // Signature setup prompt can block the form — continue without saving one.
  const sigClose = page.getByRole('button', { name: /^close$/i });
  if (await page.getByRole('heading', { name: /signature/i }).count()) {
    await sigClose.first().click().catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(400);
  }
  const satLabels = await page.locator('label:has(input[aria-label$=" SAT"]:not([aria-label*="NO SAT"]))').count();
  ok(`found ${satLabels} SAT controls`);

  // Mark first visible item NO SAT (three responsive row layouts share the DOM).
  const clickedNoSat = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')].filter((el) => {
      const input = el.querySelector('input[aria-label*=" NO SAT"]');
      if (!input) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    if (!labels[0]) return false;
    labels[0].click();
    return true;
  });
  if (!clickedNoSat) fail('no visible NO SAT control');
  else ok('clicked NO SAT');
  await page.waitForTimeout(800);

  // Remarks (required for NO SAT)
  const remarks = page.locator('textarea').first();
  await remarks.waitFor({ timeout: 8000 });
  await remarks.fill('QA: standing water at catch basin CB-12 after overnight rain.');
  ok('NO SAT + remarks');

  // Open create-incident modal from the evidence panel
  const createBtn = page.getByRole('button', { name: /^create incident$/i }).first();
  await createBtn.waitFor({ state: 'attached', timeout: 8000 });
  await createBtn.click({ force: true });
  await page.getByRole('heading', { name: 'Create Incident' }).waitFor({ timeout: 8000 });
  ok('incident modal open');

  await page.getByLabel(/^title/i).fill('QA drain catch basin CB-12 standing water');
  await page.getByLabel(/description \/ remarks/i).fill('QA: standing water at catch basin CB-12 after overnight rain.');
  await page.getByLabel(/^location/i).fill('Airside drainage, taxiway A');
  await page.locator('form label').filter({ hasText: /^Level 2$/ }).click({ force: true });

  const proceed = page.getByLabel(/proceed to incident management/i);
  if (await proceed.count()) await proceed.uncheck().catch(() => {});

  await page.locator('form').getByRole('button', { name: /^create incident$/i }).click();
  await page.waitForTimeout(4000);

  const body = await page.locator('body').innerText();
  const modalStillOpen = await page.getByRole('heading', { name: 'Create Incident' }).isVisible().catch(() => false);
  const hasRef = /INC-\d{4}-\d+/i.test(body);
  const err =
    body.match(/Could not create incident[^\n]*/i)?.[0] ||
    body.match(/row-level security[^\n]*/i)?.[0] ||
    body.match(/Title, description[^\n]*/i)?.[0] ||
    body.match(/Deficiency Level is required[^\n]*/i)?.[0];
  const net = diagnostics.failedRequests.filter((f) => /incident/i.test(f.url || '')).slice(0, 5);

  if (err) fail(err);
  else if (net.length) fail(`net: ${net.map((n) => `${n.status ?? n.error} ${n.url}`).join(' | ')}`);
  else if (modalStillOpen && !hasRef) {
    fail(`modal still open without reference: ${body.slice(-500)}`);
  } else {
    ok(hasRef ? `incident created (${body.match(/INC-\d{4}-\d+/)?.[0]})` : 'incident created (modal closed)');
  }

  // Confirm it appears on the incidents list
  await page.goto(`${BASE_URL}/incidents`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const list = await page.locator('main').innerText();
  if (/CB-12|standing water|catch basin/i.test(list) || /INC-\d{4}-\d+/.test(list)) {
    ok('incident visible on Incidents page');
  } else {
    fail(`incident not found on list: ${list.slice(0, 240)}`);
  }

  await page.screenshot({ path: path.join(SHOTS, 'nosat-incident.png') });
} catch (err) {
  fail(err?.message || String(err));
  await page.screenshot({ path: path.join(SHOTS, 'nosat-incident-fail.png') }).catch(() => {});
  if (diagnostics.pageErrors.length) console.log('pageErrors', diagnostics.pageErrors);
}

await context.close();
await browser.close();
console.log(`\n=== Summary: ${findings.length ? 'FAILED' : 'PASSED'} (${findings.length} failure(s)) ===`);
for (const f of findings) console.log(` - ${f}`);
process.exit(findings.length ? 1 : 0);
