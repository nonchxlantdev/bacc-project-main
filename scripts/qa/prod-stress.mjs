/**
 * Production stress run for https://bacc.visionforgestudio.app.
 *
 * Credentials come from the environment only:
 *   QA_BASE_URL, QA_EMAIL, QA_PASSWORD, QA_OM_EMAIL, QA_OM_PASSWORD
 * Nothing here is written back into the repo except QA_PROD_REPORT.md,
 * and that report never includes a password.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { chromePath, ROOT } from './harness.mjs';

const BASE = (process.env.QA_BASE_URL || 'https://bacc.visionforgestudio.app').replace(/\/$/, '');
const TOKEN = 'TROGLODYTIDAE-SUPERCALIFRAGILISTIC QA stress sentence for the cell.';
const DATE = '2026-12-28';
const TIME = '23:59';
const WHEN = '2026-12-28T23:59';
const PRINTED_DATE = '28/12/2026';
const VIEWPORT = { width: 1024, height: 1366 };
const ARTIFACTS = path.join(ROOT, 'qa-artifacts', 'prod-stress');
const TAIL_PATH = path.join(ROOT, 'qa-artifacts', 'qa-prod-tail.jsonl');
const REPORT_PATH = path.join(ROOT, 'QA_PROD_REPORT.md');
const POPPLER = process.env.PDFTOPPM
  || 'C:\\Users\\glenr\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin\\pdftoppm.exe';

const failures = [];
const formResults = [];
const httpFailures = [];
const consoleErrors = [];
const clientErrors = [];
let tailProc = null;

function fail(where, detail) {
  failures.push({ where, detail: String(detail).slice(0, 2000) });
  console.error(`FAIL ${where}: ${detail}`);
}

function note(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in the terminal before running this script.`);
  return value;
}

async function launchBrowser() {
  return chromium.launch({ executablePath: chromePath(), headless: true });
}

async function openPage(browser) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    hasTouch: true,
    acceptDownloads: true,
  });
  await context.addInitScript(() => {
    const orig = window.fetch.bind(window);
    window.__pdfCaptures = [];
    window.fetch = async (...args) => {
      const res = await orig(...args);
      try {
        const input = args[0];
        const url = typeof input === 'string' ? input : input?.url || '';
        if (String(url).includes('/api/export-checklist-pdf') && res.ok) {
          const buf = new Uint8Array(await res.clone().arrayBuffer());
          window.__pdfCaptures.push(Array.from(buf));
        }
      } catch {
        /* the page still receives the original response */
      }
      return res;
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('dialog', (dialog) => dialog.accept());
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/favicon|Download the React DevTools|Failed to load resource|cloudflareinsights|Content Security Policy/i.test(text)) return;
    consoleErrors.push({ url: page.url(), text: text.slice(0, 500) });
  });
  page.on('pageerror', (err) => {
    consoleErrors.push({ url: page.url(), text: String(err?.message || err).slice(0, 500) });
  });
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/client-error')) clientErrors.push({ url: page.url(), status: res.status() });
    if (res.status() < 400) return;
    if (/tile\.openstreetmap|fonts\.g|fonts\.googleapis|favicon|chrome-extension/.test(url)) return;
    // The login screen asks who is signed in. A 401 there is the answer, not a broken request.
    if (res.status() === 401 && /\/api\/auth\/me|\/api\/data\/settings\.get/.test(url)) return;
    httpFailures.push({ url, status: res.status(), page: page.url() });
  });
  return { context, page };
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[autocomplete="username"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20000 });
  let active = password;
  const heading = page.getByRole('heading', { name: 'Choose your password' });
  if (await heading.isVisible().catch(() => false)) {
    const next = password.endsWith('!k') ? `${password}x` : `${password}!k`;
    active = next;
    await page.getByPlaceholder('Temporary password').fill(password);
    await page.getByPlaceholder('New password (10+ characters)').fill(next);
    await page.getByPlaceholder('Confirm new password').fill(next);
    await page.getByRole('button', { name: 'Set password and continue' }).click();
    // The change form is already mounted at /dashboard, so the URL does not
    // move. Wait until that form is gone, and surface its error if it stays.
    await heading.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    if (await heading.isVisible().catch(() => false)) {
      const message = await page.locator('form p').last().innerText().catch(() => 'password change failed');
      throw new Error(`Could not set a password for ${email}: ${message}`);
    }
    note(`Password change completed for ${email}.`);
  }
  await page.getByRole('link', { name: 'Dashboard' }).waitFor({ timeout: 20000 });
  return active;
}

async function dismissTour(page) {
  for (let i = 0; i < 4; i += 1) {
    const skip = page.getByRole('button', { name: 'Skip tour' });
    const manual = page.getByRole('button', { name: 'Sign manually on this form' });
    const gotIt = page.getByRole('button', { name: 'Got it' });
    if (await manual.isVisible().catch(() => false)) {
      await manual.click();
      continue;
    }
    if (await gotIt.isVisible().catch(() => false)) {
      await gotIt.click();
      continue;
    }
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      continue;
    }
    break;
  }
}

async function boundaryVisible(page) {
  return page.getByText(/Something went wrong|This screen hit an error/).first().isVisible().catch(() => false);
}

async function sidebarHrefs(page) {
  return page.locator('nav a[href^="/"]').evaluateAll((nodes) => {
    const seen = [];
    for (const node of nodes) {
      const href = node.getAttribute('href');
      if (href && !seen.includes(href) && node.getClientRects().length) seen.push(href);
    }
    return seen;
  });
}

async function stepNavigation(page) {
  note('Step 1 — sidebar navigation');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Dashboard' }).waitFor({ timeout: 15000 });
  await dismissTour(page);
  let hrefs = await sidebarHrefs(page);
  if (!hrefs.length) {
    const menu = page.getByRole('button', { name: 'Open navigation' });
    if (await menu.isVisible().catch(() => false)) await menu.click();
    hrefs = await sidebarHrefs(page);
  }
  if (!hrefs.length) fail('navigation', 'No sidebar links were visible');
  for (let pass = 1; pass <= 3; pass += 1) {
    for (const href of hrefs) {
      const link = page.locator(`nav a[href="${href}"]`).locator('visible=true').first();
      await link.click();
      await page.waitForURL(new RegExp(`${href.replace(/\//g, '\\/')}(?:$|\\?)`), { timeout: 15000 }).catch(() => {});
      if (pass === 2 && href === hrefs[Math.floor(hrefs.length / 2)]) {
        await page.reload({ waitUntil: 'domcontentloaded' });
      }
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {});
      if (await boundaryVisible(page)) fail('navigation', `Error boundary on ${href} pass ${pass}`);
      await dismissTour(page);
    }
  }
  note(`Navigation covered ${hrefs.length} screens × 3`);
}

function loadSchemas() {
  const dir = path.join(ROOT, 'src', 'data', 'checklists');
  return readdir(dir).then(async (names) => {
    const schemas = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const schema = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
      schemas.push({ key: name.replace(/\.json$/, ''), schema });
    }
    return schemas;
  });
}

async function openNewInspection(page, schema) {
  await page.goto(`${BASE}/checklists/mine`, { waitUntil: 'domcontentloaded' });
  await dismissTour(page);
  if (await boundaryVisible(page)) throw new Error('Error boundary on My Checklists');
  if (await page.getByText("Couldn't reach the records").isVisible().catch(() => false)) {
    throw new Error('Records banner was up before starting a form');
  }
  await page.getByRole('button', { name: 'New Inspection' }).click();
  const search = page.getByPlaceholder('Search by form number, title or team…');
  await search.fill(schema.code);
  const button = page.getByRole('button', { name: schema.title, exact: false }).first();
  await button.waitFor({ state: 'visible', timeout: 10000 });
  await button.click();
  await page.waitForURL(/\/checklists\/(?!mine|all)[^/]+/, { timeout: 20000 });
  await dismissTour(page);
  await page.getByRole('button', { name: 'Save Draft' }).or(page.getByRole('button', { name: 'View PDF' })).first().waitFor({ timeout: 20000 });
  await dismissTour(page);
  return page.url().split('/').pop();
}

async function fillInputs(scope) {
  const inputs = scope.locator('input:visible, textarea:visible');
  const count = await inputs.count();
  const seenRadio = new Set();
  for (let i = 0; i < count; i += 1) {
    const input = inputs.nth(i);
    if (await input.isDisabled().catch(() => true)) continue;
    if (await input.getAttribute('readonly') !== null) continue;
    const type = (await input.getAttribute('type')) || (await input.evaluate((el) => el.tagName.toLowerCase()));
    if (type === 'radio') {
      const name = (await input.getAttribute('name')) || '';
      if (name.endsWith('-result') || seenRadio.has(name)) continue;
      seenRadio.add(name);
      await input.check({ force: true }).catch(() => {});
      continue;
    }
    if (type === 'checkbox' || type === 'file' || type === 'hidden') continue;
    const current = await input.inputValue().catch(() => '');
    if (current) continue;
    if (type === 'date') await input.fill(DATE);
    else if (type === 'time') await input.fill(TIME);
    else if (type === 'datetime-local') await input.fill(WHEN);
    else if (type === 'number') await input.fill('12');
    else await input.fill(TOKEN);
  }
  const no = scope.getByRole('button', { name: 'No', exact: true });
  const noCount = await no.count();
  for (let i = 0; i < noCount; i += 1) {
    const button = no.nth(i);
    if (await button.isVisible() && (await button.getAttribute('aria-pressed')) !== 'true') {
      await button.click().catch(() => {});
    }
  }
}

async function expandSections(page) {
  for (let i = 0; i < 40; i += 1) {
    const next = page.getByRole('button', { name: 'View Next Sections' });
    if (!(await next.count()) || !(await next.first().isVisible().catch(() => false))) break;
    await next.first().click();
    await page.waitForTimeout(150);
  }
}

async function fillItems(page) {
  await expandSections(page);
  const codes = await page.locator('[id^="checklist-item-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.id.slice('checklist-item-'.length)),
  );
  for (const code of codes) {
    const item = page.locator(`[id="checklist-item-${code.replace(/"/g, '')}"]`);
    const sat = item.getByText('SAT', { exact: true }).locator('visible=true');
    const noSat = item.getByText('NO SAT', { exact: true }).locator('visible=true');
    if (await sat.count()) await sat.first().click();
    if (await noSat.count()) await noSat.first().click();
    const sheet = page.locator('aside textarea');
    const opened = await sheet.waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false);
    if (opened) {
      await sheet.fill(`NO SAT ${code} ${TOKEN}`);
      const close = page.locator('aside').getByRole('button', { name: 'Close item detail' });
      if (await close.isVisible().catch(() => false)) await close.click();
    } else {
      const field = item.locator('input[placeholder*="Remarks"]:visible, input[placeholder*="NO SAT"]:visible, textarea[placeholder*="Remarks"]:visible');
      if (await field.count()) await field.first().fill(`NO SAT ${code} ${TOKEN}`);
    }
  }
  return codes.length;
}

async function fillTables(page) {
  const addButtons = page.getByRole('button', { name: 'Add row' });
  const tables = await addButtons.count();
  let signatures = 0;
  for (let t = 0; t < tables; t += 1) {
    const button = page.getByRole('button', { name: 'Add row' }).nth(t);
    const block = button.locator('xpath=ancestor::div[1]');
    const note = await block.locator('p').last().innerText().catch(() => '');
    const printed = Number(/prints (\d+) rows/.exec(note)?.[1] || 0);
    const target = printed > 0 ? printed + 2 : 1;
    for (let guard = 0; guard < target + 2; guard += 1) {
      const rows = await block.getByRole('button', { name: /Remove row/ }).count();
      if (rows >= target) break;
      await button.click();
    }
    await fillInputs(block);
    const canvases = block.locator('canvas');
    const canvasCount = await canvases.count();
    for (let c = 0; c < canvasCount; c += 1) {
      if (await drawCanvas(page, canvases.nth(c))) signatures += 1;
    }
  }
  return { tables, signatures };
}

async function drawCanvas(page, canvas) {
  if (!(await canvas.isVisible().catch(() => false))) return false;
  await canvas.scrollIntoViewIfNeeded().catch(() => {});
  const box = await canvas.boundingBox();
  if (!box || box.width < 8 || box.height < 8) return false;
  await page.mouse.move(box.x + 12, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(box.width - 8, 80), box.y + 16, { steps: 6 });
  await page.mouse.up();
  return true;
}

async function drawRemainingSignatures(page) {
  const canvases = page.locator('canvas');
  const count = await canvases.count();
  let drawn = 0;
  for (let i = 0; i < count; i += 1) {
    const canvas = canvases.nth(i);
    const inked = await canvas.evaluate((node) => {
      const ctx = node.getContext('2d');
      if (!ctx) return false;
      const { data } = ctx.getImageData(0, 0, node.width, node.height);
      for (let p = 0; p < data.length; p += 16) {
        if (data[p] < 250 || data[p + 1] < 250 || data[p + 2] < 250) return true;
      }
      return false;
    }).catch(() => true);
    if (inked) continue;
    if (await drawCanvas(page, canvas)) drawn += 1;
  }
  const dates = page.locator('input[type="date"]:visible');
  const dateCount = await dates.count();
  for (let i = 0; i < dateCount; i += 1) {
    const input = dates.nth(i);
    if (await input.isDisabled()) continue;
    if (!(await input.inputValue())) await input.fill(DATE);
  }
  return drawn;
}

async function saveDraft(page) {
  await dismissTour(page);
  const button = page.locator('button:visible', { hasText: 'Save Draft' }).first();
  const posted = page.waitForResponse(
    (res) => res.url().includes('/api/data/') && res.request().method() === 'POST',
    { timeout: 30000 },
  );
  await button.click();
  const response = await posted;
  if (!response.ok()) throw new Error(`Save Draft returned HTTP ${response.status()}`);
  await page.getByText('Saving…').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
}

async function pdfFacts(bytes) {
  if (!bytes || bytes.length < 100) throw new Error(`Preview PDF was ${bytes?.length || 0} bytes`);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => import('pdfjs-dist/build/pdf.mjs'));
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
  const texts = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!item.str) continue;
      texts.push({
        page: n - 1,
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        w: item.width || 0,
      });
    }
  }
  const raw = Buffer.from(bytes).toString('latin1');
  const images = (raw.match(/\/Subtype\s*\/Image/g) || []).length;
  return { pages: doc.numPages, texts, images };
}

function textOutsideFields(texts, fieldMap) {
  const fields = fieldMap?.fields || fieldMap?.placements || [];
  if (!Array.isArray(fields) || !fields.length) return [];
  const interesting = texts.filter((item) => item.str.includes('TROGLODYT') || item.str.includes(PRINTED_DATE));
  const outside = [];
  for (const item of interesting) {
    const hit = fields.some((field) => {
      const page = field.page ?? 0;
      if (page !== item.page) return false;
      const width = Number(field.width || 0);
      const size = Number(field.size || 10);
      return item.x >= field.x - 2
        && item.x + item.w <= field.x + width + 2
        && item.y <= field.y + size
        && item.y >= field.y - size * 3;
    });
    if (!hit) outside.push(`${item.str.slice(0, 40)} p${item.page + 1} @${Math.round(item.x)},${Math.round(item.y)}`);
  }
  return outside.slice(0, 8);
}

async function rasterise(pdfPath, key) {
  if (!existsSync(POPPLER)) return [];
  const dir = path.join(ARTIFACTS, key);
  await mkdir(dir, { recursive: true });
  const prefix = path.join(dir, 'page');
  await new Promise((resolve, reject) => {
    const child = spawn(POPPLER, ['-png', '-r', '40', pdfPath, prefix], { stdio: 'ignore' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pdftoppm ${code}`))));
  });
  return (await readdir(dir)).filter((name) => name.endsWith('.png')).map((name) => path.join('qa-artifacts', 'prod-stress', key, name));
}

async function exerciseForm(page, entry) {
  const started = Date.now();
  const { key, schema } = entry;
  const result = { key, title: schema.title, code: schema.code, pass: false, ms: 0, notes: [] };
  try {
    if (schema.referenceGroups?.length || schema.documentType === 'reference') {
      const id = await openNewInspection(page, schema);
      result.id = id;
      result.pass = true;
      result.notes.push('Reference sheet — opened, nothing to fill.');
      return result;
    }
    const id = await openNewInspection(page, schema);
    result.id = id;
    const header = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Inspection Details' }) });
    if (await header.count()) await fillInputs(header);
    const items = await fillItems(page);
    const summary = page.locator('main');
    await fillInputs(summary);
    const tables = await fillTables(page);
    const extraSignatures = await drawRemainingSignatures(page);
    const signatures = tables.signatures + extraSignatures;
    const typed = await page.locator('input, textarea').evaluateAll((nodes) =>
      nodes.some((node) => (node.value || '').includes('TROGLODYT')),
    );
    if (!typed) result.notes.push('Worst-case text did not land in a field before save.');
    await saveDraft(page);
    const loaded = page.waitForResponse(
      (res) => res.url().includes('/api/data/') && res.request().method() === 'GET' && res.ok(),
      { timeout: 20000 },
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await loaded.catch(() => {});
    await dismissTour(page);
    await page.getByRole('button', { name: 'Save Draft' }).or(page.getByRole('button', { name: 'View PDF' })).first().waitFor({ timeout: 20000 });
    await page.waitForFunction(
      (needle) => [...document.querySelectorAll('input, textarea')].some((node) => (node.value || '').includes(needle)),
      'TROGLODYT',
      { timeout: 8000 },
    ).catch(() => {});
    const values = await page.locator('input, textarea').evaluateAll((nodes) => nodes.map((node) => node.value || ''));
    const keptToken = values.some((value) => value.includes('TROGLODYT'));
    const keptDate = values.some((value) => value.startsWith(DATE) || value.startsWith(WHEN));
    const hasText = (schema.headerFields || []).some((field) => !['date', 'time', 'datetime'].includes(field.type))
      || (schema.summaryFields || []).some((field) => field.type !== 'table')
      || items > 0;
    if (hasText && !keptToken) result.notes.push('Reload did not keep the worst-case text.');
    if (!keptDate && JSON.stringify(schema).includes('"type": "date"') && !keptDate) {
      const expectsDate = JSON.stringify(schema).includes('"date"');
      if (expectsDate && !keptDate) result.notes.push('Reload did not keep a date value.');
    }
    await dismissTour(page);
    const before = await page.evaluate(() => window.__pdfCaptures?.length || 0);
    await page.locator('button:visible', { hasText: 'Show preview' }).first().click();
    await page.waitForFunction((start) => (window.__pdfCaptures?.length || 0) > start, before, { timeout: 60000 });
    const captured = await page.evaluate(() => window.__pdfCaptures.at(-1));
    const bytes = Buffer.from(captured || []);
    if (bytes.length < 100) {
      result.notes.push(`Preview PDF was ${bytes.length} bytes`);
    } else {
      const pdfPath = path.join(ARTIFACTS, `${key}.pdf`);
      await mkdir(ARTIFACTS, { recursive: true });
      await writeFile(pdfPath, bytes);
      const facts = await pdfFacts(bytes);
      result.pages = facts.pages;
      result.images = facts.images;
      if (keptDate && !facts.texts.some((item) => item.str.includes(PRINTED_DATE) || item.str.includes(DATE))) {
        result.notes.push('PDF text did not include the sign or header date.');
      }
      if (signatures > 0 && facts.images < signatures) {
        result.notes.push(`PDF images ${facts.images} < signatures drawn ${signatures}.`);
      }
      let fieldMap = null;
      const mapPath = path.join(ROOT, 'src', 'data', 'field-maps', `${key}-ed01.json`);
      if (existsSync(mapPath)) fieldMap = JSON.parse(readFileSync(mapPath, 'utf8'));
      const outside = textOutsideFields(facts.texts, fieldMap);
      if (outside.length) result.notes.push(`Text outside a field box: ${outside.join('; ')}`);
      try {
        result.shots = await rasterise(pdfPath, key);
      } catch (err) {
        result.notes.push(`Preview raster skipped (${err.message}).`);
      }
    }
    result.notes.push(`${items} items, ${tables.tables} tables, ${signatures} signatures.`);
    const problems = result.notes.filter((line) => /did not|HTTP|outside a field|images |Preview PDF/.test(line));
    result.pass = problems.length === 0;
    if (!result.pass) fail(key, problems.join(' '));
  } catch (err) {
    result.notes.push(err.message || String(err));
    fail(key, err.message || err);
  } finally {
    result.ms = Date.now() - started;
    formResults.push(result);
    note(`${result.pass ? 'ok' : 'FAIL'} ${key} ${(result.ms / 1000).toFixed(1)}s`);
  }
  return result;
}

async function rapidSave(page, id) {
  note('Step 3 — rapid save');
  await page.goto(`${BASE}/checklists/${id}`, { waitUntil: 'domcontentloaded' });
  const bad = [];
  page.on('response', (res) => {
    if (res.url().includes('/api/data/') && res.request().method() === 'POST' && res.status() >= 400) {
      bad.push(res.status());
    }
  });
  const started = Date.now();
  for (let i = 0; i < 10; i += 1) {
    const button = page.locator('button:visible', { hasText: 'Save Draft' }).first();
    await button.click().catch(() => {});
    if (Date.now() - started > 5000 && i < 9) break;
  }
  await page.waitForTimeout(1500);
  const elapsed = Date.now() - started;
  if (bad.some((status) => status === 409 || status >= 500)) fail('rapid-save', `HTTP ${bad.join(',')}`);
  if (elapsed > 8000) fail('rapid-save', `10 saves took ${elapsed}ms`);
  note(`Rapid save finished in ${elapsed}ms; bad statuses: ${bad.join(',') || 'none'}`);
}

async function offlineEdit(page) {
  note('Step 3 — offline edit');
  const input = page.locator('input[type="text"]:visible, textarea:visible').first();
  await page.context().setOffline(true);
  if (await input.count()) await input.fill(`${TOKEN} offline`).catch(() => {});
  await page.waitForTimeout(500);
  await page.context().setOffline(false);
  await page.waitForTimeout(2000);
  const banner = await page.getByText(/offline|sync/i).allInnerTexts().catch(() => []);
  note(`Offline banners: ${banner.join(' | ') || 'none'}`);
}

async function stepTabs(page) {
  note('Step 4 — tabs');
  await page.goto(`${BASE}/checklists/mine`, { waitUntil: 'domcontentloaded' });
  for (const name of ['Drafts', 'Awaiting OM', 'Returned', 'Completed']) {
    await page.getByRole('button', { name }).first().click();
    if (await page.getByText("Couldn't reach the records").isVisible().catch(() => false)) {
      fail('tabs', `Records banner stuck on ${name}`);
    }
  }
  const drafts = await page.getByRole('button', { name: 'Drafts' }).first().innerText();
  await page.goto(`${BASE}/checklists/all?tab=records`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Filed records' }).click();
  if (await page.getByText("Couldn't reach the records").isVisible().catch(() => false)) {
    fail('filed-records', 'Records banner stuck on Filed records');
  }
  const empty = await page.getByText('Nothing in this tab').isVisible().catch(() => false);
  note(`My Checklists drafts control: ${drafts}; filed empty=${empty}`);
  return !empty;
}

async function submitAttendance(page, id) {
  note('Step 5 — submit attendance');
  await page.goto(`${BASE}/checklists/${id}`, { waitUntil: 'domcontentloaded' });
  const posted = page.waitForResponse(
    (res) => res.url().includes('/api/data/') && res.request().method() === 'POST',
    { timeout: 30000 },
  );
  await page.locator('button:visible', { hasText: 'Submit Checklist' }).first().click();
  const response = await posted.catch(() => null);
  await page.getByText(/Submitted\. The Operations Manager/).waitFor({ timeout: 15000 }).catch(() => {});
  const submitted = await page.getByText(/Submitted\. The Operations Manager/).isVisible().catch(() => false);
  if (!submitted) {
    const banner = await page.locator('main').innerText();
    fail('attendance-submit', `HTTP ${response ? response.status() : 'none'}. ${banner.slice(0, 300)}`);
    return false;
  }
  note('Attendance submitted');
  return true;
}

async function omApprove(browser, email, password) {
  note('Step 5 — OM approve');
  const { page } = await openPage(browser);
  await signIn(page, email, password);
  await page.goto(`${BASE}/approvals`, { waitUntil: 'domcontentloaded' });
  await dismissTour(page);
  const row = page.locator('li').filter({ hasText: 'Attendance List' }).first();
  await row.getByRole('button', { name: 'Review' }).click();
  const dialog = page.getByRole('heading', { name: 'Review approval' }).locator('xpath=ancestor::div[contains(@class,"max-w-lg")]');
  const canvas = page.locator('canvas').last();
  await drawCanvas(page, canvas);
  const date = page.locator('input[type="date"]').last();
  await date.fill(DATE);
  await page.getByRole('button', { name: 'Approve & sign' }).click();
  await page.waitForTimeout(2000);
  const stillOpen = await page.getByRole('heading', { name: 'Review approval' }).isVisible().catch(() => false);
  if (stillOpen) fail('om-approve', 'Review dialog stayed open');
  await page.context().close();
  return dialog;
}

async function completedPdf(page) {
  note('Step 5 — completed PDF');
  await page.goto(`${BASE}/checklists/mine?tab=completed`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Completed' }).click();
  await page.getByText('Loading…').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  const rows = page.locator('tr').filter({ hasText: 'Attendance List' });
  const found = await rows.first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  if (!found) {
    const body = await page.locator('main').innerText().catch(() => '');
    fail('completed-tab', `Attendance List was not on the Completed tab. ${body.replace(/\s+/g, ' ').slice(0, 400)}`);
    return;
  }
  const dated = rows.filter({ hasText: DATE });
  const row = (await dated.count()) ? dated.first() : rows.first();
  const before = await page.evaluate(() => window.__pdfCaptures?.length || 0);
  const downloadButton = row.getByRole('button', { name: 'Download PDF' });
  if (await downloadButton.isVisible().catch(() => false)) await downloadButton.click();
  else await row.getByRole('link').first().click();
  await page.waitForFunction((start) => (window.__pdfCaptures?.length || 0) > start, before, { timeout: 60000 }).catch(() => {});
  const captured = await page.evaluate(() => window.__pdfCaptures?.at(-1) || null);
  const bytes = Buffer.from(captured || []);
  if (bytes.length < 100) {
    fail('attendance-pdf', `Download was ${bytes.length} bytes`);
    return;
  }
  const facts = await pdfFacts(bytes);
  const names = facts.texts.filter((item) => item.str.includes('TROGLODYT')).length;
  if (facts.images < 13) fail('attendance-pdf', `Expected at least 13 signature images, found ${facts.images}`);
  note(`Attendance PDF images=${facts.images} token hits=${names} pages=${facts.pages}`);
  await mkdir(ARTIFACTS, { recursive: true });
  await writeFile(path.join(ARTIFACTS, 'attendance-signed.pdf'), bytes);
}

async function deleteDrafts(page) {
  note('Step 6 — delete drafts');
  await page.goto(`${BASE}/checklists/mine`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Drafts' }).click();
  for (let guard = 0; guard < 80; guard += 1) {
    const button = page.getByRole('button', { name: 'Delete', exact: true }).first();
    if (!(await button.isVisible().catch(() => false))) break;
    await button.click();
    await page.waitForTimeout(400);
  }
  const left = await page.getByRole('button', { name: 'Delete', exact: true }).count();
  if (left) fail('cleanup', `${left} drafts still have a Delete button`);
  else note('Drafts cleared');
}

function startTail() {
  try {
    const stream = createWriteStream(TAIL_PATH);
    tailProc = spawn('npx', ['wrangler', 'tail', 'bacc-portal', '--format', 'json'], {
      cwd: ROOT,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    tailProc.stdout.pipe(stream);
    tailProc.stderr.pipe(stream);
  } catch (err) {
    fail('wrangler-tail', err.message);
  }
}

async function stopTail() {
  if (!tailProc) return [];
  tailProc.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!existsSync(TAIL_PATH)) return [];
  const lines = readFileSync(TAIL_PATH, 'utf8').split(/\r?\n/).filter(Boolean);
  return lines.filter((line) => /"level"\s*:\s*"error"/i.test(line));
}

function writeReport({ build, elapsed, tailErrors, filedHadRow }) {
  const passed = formResults.filter((row) => row.pass).length;
  const lines = [
    '# Production stress report',
    '',
    `Ran against ${BASE} on ${new Date().toISOString()}.`,
    `Build seen in Help: ${build || 'not read'}.`,
    `Elapsed: ${Math.round(elapsed / 1000)}s.`,
    `Forms: ${passed}/${formResults.length} passed.`,
    `Filed records had a row before the attendance sign-off: ${filedHadRow ? 'yes' : 'no'}.`,
    '',
    '## Forms',
    '',
    '| Form | Result | Seconds | Notes |',
    '| --- | --- | --- | --- |',
    ...formResults.map((row) => `| ${row.code} ${row.title} | ${row.pass ? 'pass' : 'fail'} | ${(row.ms / 1000).toFixed(1)} | ${row.notes.join(' ').replace(/\|/g, '/').slice(0, 240)} |`),
    '',
    '## Failures',
    '',
    failures.length ? failures.map((row) => `- **${row.where}** — ${row.detail.replace(/\s+/g, ' ')}`).join('\n') : 'None.',
    '',
    '## HTTP ≥ 400',
    '',
    httpFailures.length
      ? httpFailures.slice(0, 40).map((row) => `- ${row.status} ${row.url}`).join('\n')
      : 'None.',
    '',
    '## Console and client errors',
    '',
    consoleErrors.length
      ? consoleErrors.slice(0, 30).map((row) => `- ${row.url} — ${row.text}`).join('\n')
      : 'No console errors.',
    '',
    clientErrors.length ? clientErrors.map((row) => `- client-error ${row.status} from ${row.url}`).join('\n') : 'No /api/client-error calls.',
    '',
    '## Worker tail',
    '',
    tailErrors.length
      ? tailErrors.slice(0, 20).map((line) => '```\n' + line.slice(0, 800) + '\n```').join('\n')
      : 'No `level:"error"` lines in the tail.',
    '',
    'Preview page images, where Poppler could rasterise them, are under `qa-artifacts/prod-stress/`.',
    '',
  ];
  return writeFile(REPORT_PATH, lines.join('\n'));
}

async function main() {
  const email = requireEnv('QA_EMAIL');
  const password = requireEnv('QA_PASSWORD');
  const omEmail = requireEnv('QA_OM_EMAIL');
  const omPassword = requireEnv('QA_OM_PASSWORD');
  await mkdir(path.join(ROOT, 'qa-artifacts'), { recursive: true });
  startTail();
  const started = Date.now();
  const browser = await launchBrowser();
  const { page } = await openPage(browser);
  let build = '';
  try {
    if (process.env.QA_RESUME === 'attendance') {
      await signIn(page, email, password);
      await completedPdf(page);
      note(`Attendance recheck failures: ${failures.length}`);
      return;
    }
    await signIn(page, email, password);
    await deleteDrafts(page);
    await page.goto(`${BASE}/help`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/Build /).waitFor({ timeout: 15000 }).catch(() => {});
    build = (await page.locator('body').innerText()).match(/Build\s+(\S+)/)?.[1] || '';
    note(`Help build: ${build || 'missing'}`);
    if (build && !build.startsWith('cc7ac8f')) fail('build', `Production build is ${build}, expected cc7ac8f`);
    await stepNavigation(page);
    const schemas = await loadSchemas();
    const attendance = schemas.find((entry) => entry.key.includes('attendance-list'));
    let attendanceId = null;
    for (const entry of schemas) {
      const result = await exerciseForm(page, entry);
      if (entry === attendance) attendanceId = result.id;
    }
    if (attendanceId) {
      await rapidSave(page, attendanceId);
      await offlineEdit(page);
    } else fail('attendance', 'Attendance draft was not created');
    const filedHadRow = await stepTabs(page);
    let submitted = false;
    if (attendanceId) submitted = await submitAttendance(page, attendanceId);
    if (submitted) {
      await omApprove(browser, omEmail, omPassword);
      await completedPdf(page);
    }
    await deleteDrafts(page);
    const tailErrors = await stopTail();
    for (const line of tailErrors) fail('worker-tail', line.slice(0, 500));
    if (consoleErrors.length) fail('console', `${consoleErrors.length} console errors`);
    if (clientErrors.length) fail('client-error', `${clientErrors.length} client-error calls`);
    if (httpFailures.length) fail('http', `${httpFailures.length} responses ≥ 400`);
    await writeReport({ build, elapsed: Date.now() - started, tailErrors, filedHadRow });
    note(`Report written. Failures: ${failures.length}`);
  } finally {
    await stopTail();
    await browser.close().catch(() => {});
  }
  if (failures.length) process.exitCode = 1;
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === here) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
