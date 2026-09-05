/**
 * The NO SAT -> Create Incident -> Pin on Map flow.
 *
 * This is the only screen where a Leaflet map renders inside a dialog that
 * has its own sticky action bar, so it is the strictest test of the map
 * stacking fix: the bar must stay on top and stay tappable.
 */
import { launch, newPage, signIn, audit, touchAudit, BASE_URL, SHOTS } from './harness.mjs';
import path from 'node:path';

const VPS = [
  { name: '375x667', width: 375, height: 667, mobile: true },
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '412x915', width: 412, height: 915, mobile: true },
  { name: '768x1024', width: 768, height: 1024, mobile: true },
  { name: '1024x1366', width: 1024, height: 1366, mobile: true },
  { name: '1440x900', width: 1440, height: 900, mobile: false },
];

let fails = 0;
const ok = (n, p, d = '') => { if (!p) fails++; console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`); };

const browser = await launch();

for (const vp of VPS) {
  const { context, page, diagnostics } = await newPage(browser, vp);
  page.setDefaultTimeout(9000);
  await signIn(page);
  console.log(`\n### ${vp.name}`);

  await page.goto(`${BASE_URL}/checklists/mine`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.locator('main a[href^="/checklists/"]').first().click();
  await page.waitForTimeout(1600);

  // Opening a checklist pops the "Set up your signature?" prompt over the
  // whole page; nothing underneath is clickable until it is dismissed.
  const signPrompt = page.getByRole('button', { name: /Sign manually on this form/i }).first();
  if (await signPrompt.count()) {
    await signPrompt.click().catch(() => {});
    await page.waitForTimeout(600);
  }

  // Mark the first item NO SAT by clicking its visible label, not the sr-only input.
  // ChecklistItemRow renders three breakpoint tiers; only one is visible, and
  // the hidden ones come first in the DOM at tablet and desktop widths.
  const noSatLabel = page
    .locator('label:visible')
    .filter({ has: page.locator('input[aria-label*="NO SAT"]') })
    .first();
  await noSatLabel.click().catch(() => {});
  await page.waitForTimeout(900);

  const createBtn = page.getByRole('button', { name: /^(Create|View) Incident$/ }).first();
  if (!(await createBtn.count())) {
    ok('NO SAT reveals Create Incident', false, 'button not found');
    await page.screenshot({ path: path.join(SHOTS, `modal-nosat-missing-${vp.name}.png`), fullPage: true });
    await context.close();
    continue;
  }
  ok('NO SAT reveals Create Incident', true);
  await createBtn.click();
  await page.waitForTimeout(900);

  const dialogOpen = await page.locator('form:has-text("Create Incident")').count();
  ok('Create Incident modal opens', dialogOpen > 0);

  // Open the map inside the modal.
  const pin = page.getByRole('button', { name: /Pin on Map/i }).first();
  if (await pin.count()) {
    await pin.click();
    await page.waitForTimeout(1600);
    await page.screenshot({ path: path.join(SHOTS, `modal-map-${vp.name}.png`) });

    const res = await page.evaluate(() => {
      const map = document.querySelector('.leaflet-container');
      // Only the modal's own bars matter: it is a z-50 overlay, so it is
      // supposed to paint over the checklist sheet behind it.
      const modal = map?.closest('form') ?? document;
      const bars = [...modal.querySelectorAll('.sticky')].filter((n) => n.offsetHeight > 20);
      const out = { hasMap: Boolean(map), bars: [] };
      if (!map) return out;
      for (const bar of bars) {
        const r = bar.getBoundingClientRect();
        if (r.height < 20) continue;
        const covered = [];
        for (let fx = 0.1; fx < 1; fx += 0.15) {
          const x = Math.round(r.left + r.width * fx);
          const y = Math.round(r.top + r.height / 2);
          if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && map.contains(hit)) covered.push(x);
        }
        out.bars.push({
          text: bar.textContent.trim().slice(0, 40),
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          covered,
        });
      }
      // Can the primary action actually be pressed?
      const submit = [...document.querySelectorAll('button[type="submit"]')].pop();
      if (submit) {
        const sr = submit.getBoundingClientRect();
        const cx = Math.round(Math.min(Math.max(sr.left + sr.width / 2, 1), innerWidth - 1));
        const cy = Math.round(Math.min(Math.max(sr.top + sr.height / 2, 1), innerHeight - 1));
        const hit = document.elementFromPoint(cx, cy);
        out.submit = {
          rect: [Math.round(sr.left), Math.round(sr.top), Math.round(sr.right), Math.round(sr.bottom)],
          inViewport: sr.top >= 0 && sr.bottom <= innerHeight + 1,
          reachable: Boolean(hit) && (hit === submit || submit.contains(hit)),
        };
      }
      return out;
    });

    ok('map does not cover any sticky bar', res.bars.every((b) => b.covered.length === 0),
      res.bars.map((b) => `"${b.text}" covered@${b.covered.length}`).join(' | '));
    ok('submit button reachable', Boolean(res.submit?.reachable), JSON.stringify(res.submit));

    const a = await audit(page);
    const t = vp.mobile ? await touchAudit(page) : [];
    const layout = [
      ...a.issues.map((i) => `${i.kind} ${i.detail}`),
      ...t.map((x) => `touch "${x.text}" ${x.w}x${x.h}`),
    ];
    ok('modal-with-map layout', layout.length === 0, layout.join(' | '));
  }

  // Validation: submit with a required field blank.
  const submit = page.locator('button[type="submit"]').last();
  await submit.click().catch(() => {});
  await page.waitForTimeout(600);
  const err = await page.locator('text=/required/i').count();
  ok('empty-form validation shows a message', err > 0, `matches=${err}`);

  const errs = [...diagnostics.pageErrors, ...diagnostics.console.filter((c) => c.type === 'error').map((c) => c.text)];
  ok('no console/page errors in flow', errs.length === 0, errs.join(' | ').slice(0, 200));

  await context.close();
}

console.log(`\nFAILING CHECKS: ${fails}`);
await browser.close();
