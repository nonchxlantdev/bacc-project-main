/**
 * Interactive-flow QA: opens the menus, modals, selects, filters and forms
 * that a route sweep never touches, and audits each open state.
 *
 * Usage: node scripts/qa/flows.mjs [viewportFilter]
 */
import { launch, newPage, signIn, audit, touchAudit, BASE_URL, SHOTS } from './harness.mjs';
import path from 'node:path';

const VPS = [
  { name: 'mobile-375x667', width: 375, height: 667, mobile: true },
  { name: 'mobile-390x844', width: 390, height: 844, mobile: true },
  { name: 'tablet-768x1024', width: 768, height: 1024, mobile: true },
  { name: 'tablet-1024x1366', width: 1024, height: 1366, mobile: true },
  { name: 'narrow-1060x800', width: 1060, height: 800, mobile: false },
  { name: 'desktop-1440x900', width: 1440, height: 900, mobile: false },
];

const filter = process.argv[2];
const browser = await launch();
const findings = [];

function record(vp, scenario, problems) {
  if (!problems.length) {
    console.log(`  ${scenario} — clean`);
    return;
  }
  console.log(`  ${scenario}`);
  for (const p of [...new Set(problems)]) console.log(`    - ${p}`);
  findings.push({ vp: vp.name, scenario, problems: [...new Set(problems)] });
}

async function check(page, vp, scenario, diagnostics, { shot = false } = {}) {
  const res = await audit(page);
  const touch = vp.mobile ? await touchAudit(page) : [];
  const problems = [
    ...res.issues.map((i) => `[${i.kind}] ${i.detail}`),
    ...touch.map((t) => `[touch-target] "${t.text}" ${t.w}x${t.h}`),
    ...diagnostics.pageErrors.map((e) => `[page-error] ${e}`),
    ...diagnostics.console.map((c) => `[console-${c.type}] ${c.text.slice(0, 200)}`),
    ...diagnostics.failedRequests.map((f) => `[net] ${f.status ?? f.error} ${f.url.slice(0, 120)}`),
  ];
  diagnostics.console.length = 0;
  diagnostics.pageErrors.length = 0;
  diagnostics.failedRequests.length = 0;
  record(vp, scenario, problems);
  if (shot || problems.length) {
    await page.screenshot({ path: path.join(SHOTS, `flow-${vp.name}-${scenario.replace(/\W+/g, '-')}.png`) });
  }
  return problems.length;
}

/** Anything visibly open that a click outside should have closed. */
async function openOverlayCount(page) {
  return page.evaluate(() => document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"]').length);
}

for (const vp of VPS.filter((v) => !filter || v.name.includes(filter))) {
  const { context, page, diagnostics } = await newPage(browser, vp);
  page.setDefaultTimeout(8000);
  await signIn(page);
  console.log(`\n=== ${vp.name} ===`);
  try {

  // ---- Account menu in the top bar ----
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.locator('header button').last().click();
  await page.waitForTimeout(350);
  await check(page, vp, 'topbar-account-menu', diagnostics);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  if (await openOverlayCount(page)) console.log('    ! account menu did not close on Escape');

  // ---- Nav drawer ----
  const burger = page.locator('button[aria-label="Open navigation"]');
  if (await burger.isVisible().catch(() => false)) {
    await burger.click();
    await page.waitForTimeout(400);
    await check(page, vp, 'nav-drawer-open', diagnostics);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // ---- Dashboard chart/table toggle ----
  const tableToggle = page.getByRole('button', { name: 'Table', exact: true }).first();
  if (await tableToggle.count()) {
    await tableToggle.click();
    await page.waitForTimeout(300);
    await check(page, vp, 'dashboard-chart-table-view', diagnostics);
  }

  // ---- Incident list: filters, selects, sorting ----
  await page.goto(`${BASE_URL}/incidents`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const filterBtn = page.getByRole('button', { name: /filter/i }).first();
  if (await filterBtn.count()) {
    await filterBtn.click();
    await page.waitForTimeout(350);
    await check(page, vp, 'incidents-filters-open', diagnostics);
  }
  const combo = page.locator('[role="combobox"], button[aria-haspopup="listbox"]').first();
  if (await combo.count()) {
    await combo.click();
    await page.waitForTimeout(350);
    await check(page, vp, 'incidents-select-open', diagnostics);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  // Long search text + empty result state.
  const search = page.locator('input[type="search"], input[placeholder*="earch"]').first();
  if (await search.count()) {
    await search.fill('Z'.repeat(160));
    await page.waitForTimeout(500);
    await check(page, vp, 'incidents-long-search-empty-state', diagnostics);
    await search.fill('');
    await page.waitForTimeout(400);
  }

  // ---- Incident detail: tabs, location, action menus ----
  const link = page.locator('main a[href^="/incidents/"]').first();
  if (await link.count()) {
    await link.click();
    await page.waitForTimeout(1200);
    await check(page, vp, 'incident-detail-default', diagnostics);

    for (const tabName of [
      'Location',
      'Photos & Attachments',
      'Actions & Updates',
      'History',
      'Incident Details',
    ]) {
      const tab = page.getByRole('button', { name: tabName, exact: true }).first();
      if (await tab.count().catch(() => 0)) {
        await tab.click().catch(() => {});
        await page.waitForTimeout(800);
        await check(page, vp, `incident-tab-${tabName.replace(/\W+/g, '')}`, diagnostics);
      }
    }

    // Action menus and the status/close dialogs.
    for (const label of ['More Actions', 'Change Status', 'Add Update', 'Edit Incident']) {
      const btn = page.getByRole('button', { name: label, exact: true }).first();
      if (await btn.count().catch(() => 0)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(450);
        await check(page, vp, `incident-${label.replace(/\W+/g, '-')}`, diagnostics);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
      }
    }

    // Layer toggle over the map.
    const layer = page.locator('button[aria-label*="Switch to"]').first();
    if (await layer.count()) {
      await layer.click();
      await page.waitForTimeout(700);
      await check(page, vp, 'map-layer-toggle', diagnostics);
    }
  }

  // ---- Checklist detail: the biggest form in the app ----
  await page.goto(`${BASE_URL}/checklists/mine`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const cl = page.locator('main a[href^="/checklists/"]').first();
  if (await cl.count()) {
    await cl.click();
    await page.waitForTimeout(1400);
    await check(page, vp, 'checklist-signature-prompt', diagnostics, { shot: true });
    const signPrompt = page.getByRole('button', { name: /Sign manually on this form/i }).first();
    if (await signPrompt.count()) {
      await signPrompt.click().catch(() => {});
      await page.waitForTimeout(600);
    }
    await check(page, vp, 'checklist-detail-default', diagnostics);

    // NO SAT opens the evidence sheet — the mobile bottom-sheet case — and
    // from there the Create Incident modal, which is the only place a map
    // renders inside a dialog with its own sticky action bar.
    // Only one of ChecklistItemRow's three breakpoint tiers is on screen.
    const nosat = page.locator('label:visible').filter({ has: page.locator('input[aria-label*="NO SAT"]') }).first();
    if (await nosat.count()) {
      await nosat.click().catch(() => {});
      await page.waitForTimeout(800);
      await check(page, vp, 'checklist-nosat-sheet', diagnostics, { shot: true });

      const create = page.getByRole('button', { name: /create incident/i }).first();
      if (await create.count().catch(() => 0)) {
        await create.click().catch(() => {});
        await page.waitForTimeout(800);
        await check(page, vp, 'create-incident-modal', diagnostics, { shot: true });

        const pin = page.getByRole('button', { name: /pin on map/i }).first();
        if (await pin.count().catch(() => 0)) {
          await pin.click().catch(() => {});
          await page.waitForTimeout(1400);
          await check(page, vp, 'create-incident-modal-map', diagnostics, { shot: true });
          // The reported symptom: map paints over the modal's action bar.
          const bad = await page.evaluate(() => {
            const bar = [...document.querySelectorAll('.sticky.bottom-0')].find((n) => n.offsetHeight);
            const map = document.querySelector('.leaflet-container');
            if (!bar || !map) return null;
            const r = bar.getBoundingClientRect();
            const pts = [];
            for (let fx = 0.2; fx < 1; fx += 0.2) {
              const x = Math.round(r.left + r.width * fx);
              const y = Math.round(r.top + r.height / 2);
              const hit = document.elementFromPoint(x, y);
              if (hit && map.contains(hit)) pts.push([x, y]);
            }
            return pts.length ? pts : null;
          });
          if (bad) console.log(`    - [BUG] map covers modal action bar at ${JSON.stringify(bad)}`);
        }
        // Submitting empty must show validation, not crash.
        const submit = page.getByRole('button', { name: /^Create Incident$/ }).last();
        if (await submit.count().catch(() => 0)) {
          await submit.click().catch(() => {});
          await page.waitForTimeout(500);
          await check(page, vp, 'create-incident-validation', diagnostics);
        }
        await page.getByRole('button', { name: 'Close', exact: true }).first().click().catch(() => {});
        await page.waitForTimeout(300);
      }
    }
  }

  // ---- New inspection picker modal ----
  await page.goto(`${BASE_URL}/checklists/all`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const start = page.getByRole('button', { name: /Create New Inspection/i }).first();
  if (await start.count()) {
    await start.click();
    await page.waitForTimeout(600);
    await check(page, vp, 'new-inspection-picker', diagnostics, { shot: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // ---- Settings: forms, validation, sticky save bar ----
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await check(page, vp, 'settings-default', diagnostics);
  for (const section of ['Scheduling', 'Deficiency levels', 'Alerts & escalation', 'Organisation', 'Lookups']) {
    const btn = page.getByRole('button', { name: new RegExp(`^${section}`, 'i') }).first();
    if (await btn.count().catch(() => 0)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(500);
      await check(page, vp, `settings-${section.replace(/\W+/g, '-')}`, diagnostics);
    }
  }
  const numberInput = page.locator('main input[type="number"]').first();
  if (await numberInput.count()) {
    await numberInput.fill('999999999');
    await page.waitForTimeout(500);
    await check(page, vp, 'settings-dirty-sticky-bar', diagnostics, { shot: true });
    await page.getByRole('button', { name: /Discard/i }).first().click().catch(() => {});
    await page.waitForTimeout(300);
  }

  // ---- Reports: section picker popover + exports ----
  await page.goto(`${BASE_URL}/reports`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const sections = page.getByRole('button', { name: /^Reports\d/i }).first();
  if (await sections.count()) {
    await sections.click();
    await page.waitForTimeout(450);
    await check(page, vp, 'reports-section-picker', diagnostics, { shot: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }

  // ---- Approvals queue ----
  await page.goto(`${BASE_URL}/approvals`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await check(page, vp, 'approvals-default', diagnostics);
  } catch (err) {
    console.log(`  !! aborted: ${String(err.message).split('\n')[0]}`);
  }

  await context.close();
}

console.log(`\nSCENARIOS WITH FINDINGS: ${findings.length}`);
await browser.close();
