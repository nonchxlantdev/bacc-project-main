/**
 * Live Supabase deep-dive: sign in with a real account, visit every route,
 * start/save/submit a checklist, raise an incident, export PDFs, and hammer
 * navigation. Captures page errors, failed requests, and thrown UI banners.
 *
 * Usage:
 *   $env:NODE_OPTIONS='--use-system-ca'
 *   $env:QA_EMAIL='glenrick.spain@pgia.local'
 *   $env:QA_PASSWORD='…'
 *   $env:QA_OM_EMAIL='kmoore@pgiabelize.com'
 *   node scripts/qa/live-deep-dive.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { launch, newPage, BASE_URL, SHOTS, ROUTES, ROOT } from './harness.mjs';

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
const OM_EMAIL = process.env.QA_OM_EMAIL || 'kmoore@pgiabelize.com';

if (!PASSWORD) {
  console.error('Need QA_PASSWORD or SEED_PASSWORD in .env.local');
  process.exit(1);
}

const findings = [];
const pass = [];

function bug(area, detail) {
  findings.push({ area, detail });
  console.log(`  FAIL  ${area}: ${detail}`);
}
function ok(area, detail = '') {
  pass.push({ area, detail });
  console.log(`  ok    ${area}${detail ? ` — ${detail}` : ''}`);
}

function drain(d) {
  const out = [
    ...d.pageErrors.map((e) => `page-error: ${e}`),
    ...d.console.filter((c) => c.type === 'error').map((c) => `console: ${c.text.slice(0, 220)}`),
    ...d.failedRequests.map((f) => `net ${f.status ?? f.error}: ${f.url.slice(0, 140)}`),
  ];
  d.pageErrors.length = 0;
  d.console.length = 0;
  d.failedRequests.length = 0;
  return out;
}

async function liveSignIn(page, email, password) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const text = await page.locator('body').innerText().catch(() => '');
    if (/Welcome back/.test(text) && !page.url().includes('/login')) {
      await signOutIfNeeded(page);
      continue;
    }
    const passwordInput = page.locator('input[type="password"]');
    if (await passwordInput.count()) break;
  }
  await page.locator('input[type="password"]').waitFor({ timeout: 20000 });
  const emailInput = page.locator('form input').first();
  const passwordInput = page.locator('input[type="password"]');
  await emailInput.click();
  await emailInput.fill('');
  await emailInput.fill(email);
  await passwordInput.click();
  await passwordInput.fill('');
  await passwordInput.fill(password);
  const filled = await page.evaluate(() => {
    const form = document.querySelector('form');
    const inputs = [...(form?.querySelectorAll('input') ?? [])];
    return { email: inputs[0]?.value, pw: inputs.find((i) => i.type === 'password')?.value?.length };
  });
  if (filled.email !== email || filled.pw !== password.length) {
    throw new Error(`login fields did not take values (${filled.email}, len ${filled.pw})`);
  }
  await page.click('button[type="submit"]');
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    const url = page.url();
    const text = await page.locator('body').innerText().catch(() => '');
    if (/Welcome back/.test(text) || (/\/dashboard/.test(url) && !url.includes('/login'))) return;
    if (
      url.includes('/login') &&
      /(invalid login|invalid credentials|email not confirmed|too many requests)/i.test(text)
    ) {
      throw new Error(`login rejected: ${text.slice(-400)}`);
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`login timeout url=${page.url()} body=${(await page.locator('body').innerText()).slice(-400)}`);
}

async function signOutIfNeeded(page) {
  const aside = page.locator('aside').getByRole('button', { name: /sign out/i });
  if (await aside.count()) {
    await aside.click({ force: true });
  } else {
    await page.locator('header').locator('button').last().click().catch(() => {});
    await page.getByRole('menuitem', { name: /sign out/i }).click().catch(() => {});
    await page.getByText(/^sign out$/i).click().catch(() => {});
  }
  await page.locator('input[type="password"]').waitFor({ timeout: 15000 }).catch(() => {});
}

async function markVisibleSat(page) {
  const labels = page.locator('label:has(input[aria-label$=" SAT"]:not([aria-label*="NO SAT"]))');
  const n = await labels.count();
  let clicked = 0;
  for (let i = 0; i < n; i++) {
    const label = labels.nth(i);
    if (!(await label.isVisible().catch(() => false))) continue;
    await label.click({ force: true }).catch(() => {});
    clicked += 1;
  }
  return clicked;
}

async function bodyText(page) {
  return page.locator('main').innerText().catch(() => '');
}

async function crashed(page) {
  const t = await page.locator('body').innerText().catch(() => '');
  return /Something went wrong/.test(t);
}

const browser = await launch();
const { context, page, diagnostics } = await newPage(browser, {
  name: 'desktop-1440x900',
  width: 1440,
  height: 900,
  mobile: false,
});
page.setDefaultTimeout(18000);

console.log(`\n=== Live deep-dive against ${BASE_URL} as ${EMAIL} ===\n`);

try {
  drain(diagnostics);
  await liveSignIn(page, EMAIL, PASSWORD);
  const bootErrs = drain(diagnostics);
  if (await crashed(page)) bug('login', 'error boundary after sign-in');
  else if (bootErrs.some((e) => e.startsWith('page-error'))) bug('login', bootErrs.join(' | '));
  else ok('login', EMAIL);

  // ---- Every route ----
  for (const route of ROUTES) {
    drain(diagnostics);
    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const errs = drain(diagnostics);
    const text = await bodyText(page);
    if (await crashed(page)) bug(route.label, 'error boundary');
    else if (text.trim().length < 8) bug(route.label, 'empty main');
    else if (errs.some((e) => e.startsWith('page-error'))) bug(route.label, errs.join(' | '));
    else ok(route.label, `${text.trim().slice(0, 60).replace(/\s+/g, ' ')}…`);
    await page.screenshot({ path: path.join(SHOTS, `live-${route.label.replace(/\W+/g, '-')}.png`) });
  }

  // ---- Catalogue: expect many templates ----
  await page.goto(`${BASE_URL}/checklists/all`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /new inspection|forms/i }).first().waitFor({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(400);
  const catText = await bodyText(page);
  const catErrs = drain(diagnostics);
  const catalogueCount = await page.evaluate(() => {
    const cards = document.querySelectorAll('main button, main a');
    return [...cards].filter((el) => (el.textContent || '').length > 8).length;
  });
  if (/Could not load the catalogue/i.test(catText)) bug('catalogue density', catText.match(/Could not load.*/i)?.[0]);
  else if (catalogueCount < 8) {
    bug('catalogue density', `only ${catalogueCount} interactive items; ${catErrs.join(' | ') || catText.slice(0, 180)}`);
  } else ok('catalogue density', `${catalogueCount} interactive items`);

  // ---- Start an inspection, save, raise an incident, submit ----
  await page.goto(`${BASE_URL}/checklists/mine`, { waitUntil: 'domcontentloaded' });
  const newBtn = page.getByRole('button', { name: /new inspection/i }).first();
  await newBtn.waitFor({ timeout: 20000 }).catch(() => {});
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('button')].find((el) => /new inspection/i.test(el.textContent || ''));
      return Boolean(b && !b.disabled);
    },
    { timeout: 20000 },
  ).catch(() => {});
  if (!(await newBtn.count()) || (await newBtn.isDisabled().catch(() => false))) {
    bug('start inspection', 'New Inspection missing or disabled (no assigned forms?)');
  } else {
    try {
      await newBtn.click();
      await page.getByRole('heading', { name: 'New Inspection' }).waitFor({ timeout: 8000 });
      await page.locator('div.fixed.inset-0 ul button').first().waitFor({ timeout: 8000 });
      const formBtn = page.locator('div.fixed.inset-0 ul button').filter({ hasText: /Drainage|Electrical|Lighting|Generator/i }).first();
      if (await formBtn.count()) await formBtn.click();
      else await page.locator('div.fixed.inset-0 ul button').first().click();
      await page.waitForTimeout(4000);
    } catch (err) {
      bug('start inspection', err?.message || String(err));
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  const onDetail = /\/checklists\/[0-9a-f-]{8,}/i.test(page.url());
  if (!onDetail) {
    bug('start inspection', `did not land on a checklist detail (url=${page.url()})`);
    const startErrs = drain(diagnostics);
    if (startErrs.length) bug('start inspection errors', startErrs.join(' | '));
  } else {
    ok('start inspection', page.url());
    const startErrs = drain(diagnostics);
    if (await crashed(page)) bug('checklist detail', 'error boundary after start');
    else if (startErrs.some((e) => e.startsWith('page-error'))) bug('checklist detail', startErrs.join(' | '));
    else ok('checklist detail rendered');

    try {
    const satCount = await markVisibleSat(page);
    ok('mark SAT', `${satCount} visible SAT radios`);

    // Flip the first visible result to NO SAT so we can raise an incident
    const noSat = page.getByRole('radio', { name: /mark .+ no sat$/i }).first();
    if (await noSat.isVisible().catch(() => false)) {
      await noSat.click({ force: true });
      await page.waitForTimeout(400);
      const remarks = page.locator('textarea').first();
      if (await remarks.count()) await remarks.fill('QA deep-dive: standing water at catch basin CB-12.');
      const createInc = page.getByRole('button', { name: /create incident/i }).first();
      if (await createInc.count()) {
        await createInc.click();
        await page.waitForTimeout(800);
        const level = page.getByRole('radio', { name: /level 2/i }).first();
        if (await level.count()) await level.click({ force: true });
        const locField = page.getByLabel(/^location$/i).first();
        if (await locField.count()) {
          const v = await locField.inputValue().catch(() => '');
          if (!v) await locField.fill('Airside drainage, taxiway A');
        }
        const proceed = page.getByLabel(/proceed to incident management/i);
        if (await proceed.count()) await proceed.uncheck().catch(() => {});
        await page.locator('form').getByRole('button', { name: /^create incident$/i }).click();
        await page.waitForTimeout(2000);
        const incText = await page.locator('body').innerText();
        if (/Could not create incident|failed/i.test(incText) && /incident/i.test(incText)) {
          bug('create incident', incText.match(/Could not create incident.*|failed.*/i)?.[0] || incText.slice(-180));
        } else if (await page.getByText(/INC-|NOC-/i).count()) {
          ok('create incident', 'incident reference visible');
        } else {
          ok('create incident', 'modal submitted (no crash)');
        }
        await page.keyboard.press('Escape').catch(() => {});
      }
    }

    const save = page.getByRole('button', { name: /save draft/i });
    if (await save.count()) {
      await save.click();
      await page.waitForTimeout(1800);
      const saveText = await bodyText(page);
      const saveErrs = drain(diagnostics);
      if (/Could not|failed to save|row-level security/i.test(saveText)) {
        bug('save draft', saveText.slice(0, 180));
      } else if (saveErrs.some((e) => e.startsWith('page-error'))) {
        bug('save draft', saveErrs.join(' | '));
      } else ok('save draft');
    }

    const preview = page.getByRole('button', { name: /show preview|view pdf/i }).first();
    if (await preview.count()) {
      drain(diagnostics);
      await preview.click();
      await page.waitForTimeout(5000);
      const pdfErrs = drain(diagnostics);
      const pdfText = await bodyText(page);
      if (/Export failed|not allowed|Missing Authorization|Supabase is not configured/i.test(pdfText)) {
        bug('pdf preview', pdfText.match(/Export failed.*|not allowed.*|Missing Authorization.*|Supabase is not configured.*/i)?.[0] || pdfText.slice(0, 200));
      } else if (pdfErrs.some((e) => /export|pdf/i.test(e))) {
        bug('pdf preview', pdfErrs.join(' | '));
      } else ok('pdf preview clicked');
    }

    const submit = page.getByRole('button', { name: /submit checklist/i });
    if (await submit.count()) {
      await submit.click();
      await page.waitForTimeout(2500);
      const subText = await bodyText(page);
      if (/need remarks|required header|could not|row-level security/i.test(subText)) {
        bug('submit checklist', subText.match(/need remarks.*|required header.*|could not.*|row-level.*/i)?.[0] || subText.slice(0, 200));
      } else ok('submit checklist');
    }
    } catch (err) {
      bug('inspection flow', err?.message || String(err));
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  // ---- Incidents list + register export ----
  await page.goto(`${BASE_URL}/incidents`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const exportReg = page.getByRole('button', { name: /export|register|pdf/i }).first();
  if (await exportReg.count()) {
    drain(diagnostics);
    await exportReg.click();
    await page.waitForTimeout(2500);
    const incErrs = drain(diagnostics);
    if (incErrs.some((e) => e.startsWith('page-error'))) bug('noc register export', incErrs.join(' | '));
    else ok('noc register export clicked');
  } else ok('incidents page (no export button for this role)');

  // ---- Reports PDF ----
  await page.goto(`${BASE_URL}/reports`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const exportReport = page.getByRole('button', { name: /export|pdf|download/i }).first();
  if (await exportReport.count()) {
    drain(diagnostics);
    await exportReport.click();
    await page.waitForTimeout(2500);
    const rErrs = drain(diagnostics);
    if (rErrs.some((e) => e.startsWith('page-error'))) bug('report pdf', rErrs.join(' | '));
    else ok('report pdf clicked');
  }

  // ---- Locations map ----
  await page.goto(`${BASE_URL}/locations`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const leaflet = await page.locator('.leaflet-container').count();
  if (!leaflet) bug('locations map', 'no leaflet container');
  else ok('locations map');

  // ---- Users directory ----
  await page.goto(`${BASE_URL}/users`, { waitUntil: 'domcontentloaded' });
  await page.locator('td, p').filter({ hasText: /Glenrick|Keagan|Loading/i }).first().waitFor({ timeout: 8000 }).catch(() => {});
  await page.getByText(/Glenrick|Keagan|Shamira/i).first().waitFor({ timeout: 20000 }).catch(() => {});
  const userRows = await page.locator('main').innerText();
  if (/Keagan|Glenrick|Shamira/i.test(userRows)) ok('users directory lists staff');
  else bug('users directory', `expected staff names missing: ${userRows.slice(0, 220)}`);

  // ---- Settings profile save ----
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const pos = page.locator('input').nth(1);
  if (await pos.count()) {
    const before = await pos.inputValue().catch(() => '');
    await pos.fill(before || 'Electrical Maintenance Technician');
    const saveSettings = page.getByRole('button', { name: /save/i }).first();
    if (await saveSettings.count()) {
      await saveSettings.click();
      await page.waitForTimeout(1200);
      if (await crashed(page)) bug('settings save', 'error boundary');
      else ok('settings save');
    }
  }

  // ---- Rapid nav stress ----
  drain(diagnostics);
  const hammer = ['/dashboard', '/checklists/mine', '/checklists/all', '/incidents', '/approvals', '/reports', '/locations', '/settings', '/help', '/notifications'];
  for (let i = 0; i < 2; i++) {
    for (const r of hammer) {
      await page.goto(`${BASE_URL}${r}`, { waitUntil: 'commit' });
    }
  }
  await page.waitForTimeout(2000);
  const stressErrs = drain(diagnostics);
  if (await crashed(page)) bug('rapid nav', 'error boundary after hammering routes');
  else if (stressErrs.some((e) => e.startsWith('page-error'))) bug('rapid nav', stressErrs.join(' | '));
  else ok('rapid nav (20 hops)');

  // ---- OM login: approvals inbox ----
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await signOutIfNeeded(page);
  await page.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
  await liveSignIn(page, OM_EMAIL, PASSWORD);
  if (await crashed(page)) bug('om login', 'error boundary');
  else ok('om login', OM_EMAIL);

  await page.goto(`${BASE_URL}/approvals`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  if (await crashed(page)) bug('om approvals', 'error boundary');
  else ok('om approvals');

  await page.goto(`${BASE_URL}/checklists/all`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  if (await crashed(page)) bug('om catalogue', 'error boundary');
  else ok('om catalogue');
} catch (err) {
  bug('harness', err?.message || String(err));
  await page.screenshot({ path: path.join(SHOTS, 'live-harness-crash.png') }).catch(() => {});
}

await context.close();
await browser.close();

console.log(`\n=== Summary: ${pass.length} passed, ${findings.length} failed ===`);
for (const f of findings) console.log(` - [${f.area}] ${f.detail}`);
process.exit(findings.length ? 1 : 0);
