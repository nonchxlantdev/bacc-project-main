/**
 * Functional stress: the things a real user does badly — hammering buttons,
 * navigating mid-load, rotating the device, resizing, refreshing, and pasting
 * absurd input. Looks for crashes, stuck loading states and stale UI rather
 * than layout.
 */
import { launch, newPage, signIn, audit, BASE_URL, SHOTS } from './harness.mjs';
import path from 'node:path';

const browser = await launch();
let problems = 0;
const report = (label, detail) => {
  problems++;
  console.log(`  BUG  ${label}: ${detail}`);
};
const pass = (label, detail = '') => console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);

function drain(d) {
  const out = [
    ...d.pageErrors.map((e) => `page-error: ${e}`),
    ...d.console.filter((c) => c.type === 'error').map((c) => `console: ${c.text.slice(0, 160)}`),
    ...d.failedRequests.map((f) => `net ${f.status ?? f.error}: ${f.url.slice(0, 110)}`),
  ];
  d.pageErrors.length = 0;
  d.console.length = 0;
  d.failedRequests.length = 0;
  return out;
}

for (const vp of [
  { name: 'mobile-390x844', width: 390, height: 844, mobile: true },
  { name: 'tablet-1024x1366', width: 1024, height: 1366, mobile: true },
  { name: 'desktop-1440x900', width: 1440, height: 900, mobile: false },
]) {
  const { context, page, diagnostics } = await newPage(browser, vp);
  page.setDefaultTimeout(9000);
  await signIn(page);
  console.log(`\n### ${vp.name}`);

  const ROUTES = ['/dashboard', '/incidents', '/checklists/mine', '/reports', '/locations', '/settings', '/approvals', '/users'];

  // 1. Rapid navigation — never settle, then check the last page rendered.
  drain(diagnostics);
  for (let i = 0; i < 3; i++) {
    for (const r of ROUTES) {
      await page.goto(`${BASE_URL}${r}`, { waitUntil: 'commit' });
      await page.waitForTimeout(60); // navigate again mid-render
    }
  }
  await page.waitForTimeout(2500);
  let errs = drain(diagnostics);
  const rendered = await page.locator('main').innerText().catch(() => '');
  if (errs.length) report('rapid navigation', errs.join(' | '));
  else if (rendered.trim().length < 10) report('rapid navigation', 'main is empty after settling');
  else pass('rapid navigation (24 route changes)');

  // 2. Refresh while data is loading.
  drain(diagnostics);
  for (let i = 0; i < 4; i++) {
    page.goto(`${BASE_URL}/reports`, { waitUntil: 'commit' }).catch(() => {});
    await page.waitForTimeout(120);
    await page.reload({ waitUntil: 'commit' }).catch(() => {});
  }
  await page.waitForTimeout(2500);
  errs = drain(diagnostics);
  const stuck = await page.evaluate(() => {
    const t = document.body.innerText;
    return /Loading|Loading…/.test(t) && t.trim().length < 300;
  });
  if (errs.length) report('refresh during load', errs.join(' | '));
  else if (stuck) report('refresh during load', 'page stuck on a loading state');
  else pass('refresh during load');

  // 3. Repeated clicks on the same control (double-submit / toggle thrash).
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  drain(diagnostics);
  const chart = page.getByRole('button', { name: 'Chart', exact: true }).first();
  const table = page.getByRole('button', { name: 'Table', exact: true }).first();
  if (await chart.count()) {
    for (let i = 0; i < 12; i++) {
      await (i % 2 ? chart : table).click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(500);
    errs = drain(diagnostics);
    if (errs.length) report('chart/table thrash', errs.join(' | '));
    else pass('chart/table thrash (12 toggles)');
  }

  // 4. Open/close the same overlay repeatedly.
  drain(diagnostics);
  const accountToggle = page.locator('header button').last();
  for (let i = 0; i < 10; i++) {
    await accountToggle.click().catch(() => {});
    await page.waitForTimeout(60);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(300);
  const leftOpen = await page.locator('[role="menu"]').count();
  errs = drain(diagnostics);
  if (errs.length) report('menu open/close thrash', errs.join(' | '));
  else if (leftOpen) report('menu open/close thrash', `${leftOpen} menu(s) still open after Escape`);
  else pass('menu open/close thrash (10 cycles)');

  // 5. Filter thrash on the incident list.
  await page.goto(`${BASE_URL}/incidents`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  drain(diagnostics);
  const search = page.locator('main input').first();
  if (await search.count()) {
    for (const term of ['dr', 'ZZZZ', '', 'runway', 'x'.repeat(500), '', '<script>alert(1)</script>', '']) {
      await search.fill(term).catch(() => {});
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(600);
    errs = drain(diagnostics);
    const a = await audit(page);
    if (errs.length) report('filter thrash', errs.join(' | '));
    else if (a.issues.length) report('filter thrash layout', a.issues.map((i) => `${i.kind} ${i.detail}`).join(' | '));
    else pass('filter thrash incl. 500-char and script-like input');
  }

  // 6. Resize storm + orientation flip while a map is mounted.
  await page.goto(`${BASE_URL}/locations`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.leaflet-container');
  await page.waitForTimeout(900);
  drain(diagnostics);
  for (const size of [
    { width: 375, height: 667 },
    { width: 667, height: 375 }, // landscape phone
    { width: 1024, height: 1366 },
    { width: 1366, height: 1024 }, // landscape tablet
    { width: 1060, height: 800 },
    { width: 1920, height: 1080 },
    { width: vp.width, height: vp.height },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(700);
  errs = drain(diagnostics);
  const afterResize = await audit(page);
  if (errs.length) report('resize/orientation storm', errs.join(' | '));
  else if (afterResize.issues.length) {
    report('resize/orientation storm layout', afterResize.issues.map((i) => `${i.kind} ${i.detail}`).join(' | '));
    await page.screenshot({ path: path.join(SHOTS, `stress-resize-${vp.name}.png`) });
  } else pass('resize/orientation storm (7 sizes, map mounted)');

  // 7. Back/forward through history.
  drain(diagnostics);
  for (const r of ['/dashboard', '/incidents', '/reports', '/settings']) {
    await page.goto(`${BASE_URL}${r}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(250);
  }
  for (let i = 0; i < 4; i++) { await page.goBack().catch(() => {}); await page.waitForTimeout(200); }
  for (let i = 0; i < 4; i++) { await page.goForward().catch(() => {}); await page.waitForTimeout(200); }
  await page.waitForTimeout(800);
  errs = drain(diagnostics);
  if (errs.length) report('history back/forward', errs.join(' | '));
  else pass('history back/forward (8 hops)');

  // 8. Empty dataset — clear the store and walk every route.
  drain(diagnostics);
  await page.evaluate(async () => {
    const mod = await import('/src/data/repositories/index.js');
    await mod.getRepos().instances.clearAll();
  });
  for (const r of ROUTES) {
    await page.goto(`${BASE_URL}${r}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const a = await audit(page);
    if (a.issues.length) report(`empty dataset ${r}`, a.issues.map((i) => `${i.kind} ${i.detail}`).join(' | '));
  }
  await page.waitForTimeout(400);
  errs = drain(diagnostics);
  if (errs.length) report('empty dataset', errs.join(' | '));
  else pass('empty dataset across all routes');

  // 9. Offline: the app is a PWA with an offline queue.
  drain(diagnostics);
  await context.setOffline(true);
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1200);
  const offlineErrs = drain(diagnostics).filter((e) => !/net /.test(e));
  await context.setOffline(false);
  if (offlineErrs.length) report('offline mode', offlineErrs.join(' | '));
  else pass('offline mode');

  await context.close();
}

console.log(`\nSTRESS PROBLEMS: ${problems}`);
await browser.close();
