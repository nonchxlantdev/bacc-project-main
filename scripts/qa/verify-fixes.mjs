/** Targeted regression checks for each bug fixed in this QA pass. */
import { launch, newPage, signIn, BASE_URL, SHOTS } from './harness.mjs';
import path from 'node:path';

const VPS = [
  { name: '375x667', width: 375, height: 667, mobile: true },
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '412x915', width: 412, height: 915, mobile: true },
  { name: '768x1024', width: 768, height: 1024, mobile: true },
  { name: '1024x1366', width: 1024, height: 1366, mobile: true },
  { name: '1060x800', width: 1060, height: 800, mobile: false },
  { name: '1280x720', width: 1280, height: 720, mobile: false },
  { name: '1440x900', width: 1440, height: 900, mobile: false },
  { name: '1920x1080', width: 1920, height: 1080, mobile: false },
];

let fails = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) fails++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await launch();

for (const vp of VPS) {
  const { context, page, diagnostics } = await newPage(browser, vp);
  page.setDefaultTimeout(9000);
  await signIn(page);
  console.log(`\n### ${vp.name}`);

  // --- BUG-01: dropdown must stay inside the viewport ---
  await page.goto(`${BASE_URL}/incidents`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.locator('main a[href^="/incidents/"]').first().click();
  await page.waitForTimeout(1200);
  const more = page.getByRole('button', { name: 'More Actions', exact: true }).first();
  if (await more.count()) {
    await more.click();
    await page.waitForTimeout(400);
    const box = await page.evaluate(() => {
      const m = document.querySelector('[role="menu"]');
      if (!m) return null;
      const r = m.getBoundingClientRect();
      const items = [...m.querySelectorAll('[role="menuitem"]')].map((i) => {
        const ir = i.getBoundingClientRect();
        const hit = document.elementFromPoint(
          Math.round(Math.min(Math.max(ir.left + ir.width / 2, 1), innerWidth - 1)),
          Math.round(Math.min(Math.max(ir.top + ir.height / 2, 1), innerHeight - 1)),
        );
        return { text: i.textContent.trim(), left: Math.round(ir.left), right: Math.round(ir.right), reachable: Boolean(hit && (hit === i || i.contains(hit))) };
      });
      return { left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth, items };
    });
    ok(
      'BUG-01 More Actions menu inside viewport',
      box && box.left >= 0 && box.right <= box.vw && box.items.every((i) => i.reachable),
      box ? `left=${box.left} right=${box.right}/${box.vw} unreachable=${box.items.filter((i) => !i.reachable).map((i) => i.text).join(',') || 'none'}` : 'no menu',
    );
    if (box && (box.left < 0 || box.items.some((i) => !i.reachable))) {
      await page.screenshot({ path: path.join(SHOTS, `verify-dropdown-${vp.name}.png`) });
    }
    await page.keyboard.press('Escape');
  }

  // --- BUG-02: draggable map pin must be grabbable ---
  const locTab = page.getByRole('button', { name: 'Location', exact: true }).first();
  if (await locTab.count()) {
    await locTab.click();
    await page.waitForTimeout(1400);
    const pin = await page.evaluate(() => {
      const m = document.querySelector('.leaflet-marker-draggable');
      if (!m) return null;
      m.scrollIntoView({ block: 'center' });
      const r = m.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // How far from the pin's centre the pointer still lands on the pin.
      let reach = 0;
      for (let d = 2; d <= 40; d += 2) {
        const hits = [[cx - d, cy], [cx + d, cy], [cx, cy - d], [cx, cy + d]].every(([x, y]) => {
          if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) return false;
          const h = document.elementFromPoint(Math.round(x), Math.round(y));
          return Boolean(h) && (h === m || m.contains(h));
        });
        if (!hits) break;
        reach = d;
      }
      return { box: `${Math.round(r.width)}x${Math.round(r.height)}`, effective: reach * 2 };
    });
    const wantsBig = vp.mobile; // coarse pointer only
    ok(
      'BUG-02 map pin grab area',
      pin && (wantsBig ? pin.effective >= 40 : true),
      pin ? `box=${pin.box} effective=${pin.effective}px (${wantsBig ? 'touch' : 'mouse'})` : 'no pin',
    );
  }

  // --- BUG-03: out-of-range setting must not crash the page ---
  diagnostics.pageErrors.length = 0;
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const lookups = page.getByRole('button', { name: /^Lookups/i }).first();
  if (await lookups.count()) {
    await lookups.click();
    await page.waitForTimeout(600);
  }
  const num = page.locator('main input[type="number"]').first();
  if (!(await num.count())) {
    console.log('  n/a   BUG-03 (no number field on this settings view)');
  } else {
    for (const bad of ['999999999', '-500', '0', '99']) {
      await num.fill(bad);
      await page.waitForTimeout(250);
    }
    const alive = await page.locator('main input[type="number"]').first().isVisible().catch(() => false);
    ok(
      'BUG-03 out-of-range number survives',
      alive && diagnostics.pageErrors.length === 0,
      diagnostics.pageErrors.length ? diagnostics.pageErrors.join('; ') : `value=${await num.inputValue()}`,
    );
  }

  // --- BUG-04: no map paints over the nav drawer ---
  await page.goto(`${BASE_URL}/locations`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.leaflet-container');
  await page.waitForTimeout(900);
  const burger = page.locator('button[aria-label="Open navigation"]');
  if (await burger.isVisible().catch(() => false)) {
    await burger.click();
    await page.waitForTimeout(450);
    const covered = await page.evaluate(() => {
      const aside = document.querySelector('aside[aria-label="Main navigation"]');
      const map = document.querySelector('.leaflet-container');
      const r = aside.getBoundingClientRect();
      const bad = [];
      for (let y = 60; y < r.height - 40; y += 40) {
        const hit = document.elementFromPoint(Math.round(r.width / 2), Math.round(y));
        if (hit && map.contains(hit)) bad.push(y);
      }
      return bad;
    });
    ok('BUG-04 map behind nav drawer', covered.length === 0, covered.length ? `map on top at y=${covered.join(',')}` : '');
    await page.keyboard.press('Escape');
  } else {
    console.log('  n/a   BUG-04 (persistent sidebar)');
  }

  // --- BUG-05: record tables never clip a column ---
  for (const route of ['/incidents', '/checklists/all', '/users']) {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const t = await page.evaluate(() => {
      const table = document.querySelector('table');
      if (!table) return null;
      const wrap = table.parentElement;
      const stacked = getComputedStyle(table).display === 'block';
      const clipped = table.scrollWidth > wrap.clientWidth + 1 && getComputedStyle(wrap).overflowX === 'hidden';
      return { stacked, clipped, table: table.scrollWidth, wrap: wrap.clientWidth, ox: getComputedStyle(wrap).overflowX };
    });
    if (!t) {
      console.log(`  n/a   BUG-05 ${route} (no table in this view)`);
      continue;
    }
    ok(`BUG-05 ${route} table not clipped`, !t.clipped, `stacked=${t.stacked} table=${t.table} wrap=${t.wrap} overflow-x=${t.ox}`);
  }

  // --- Regression: desktop keeps its dense controls, touch never does ---
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const density = await page.evaluate(() => {
    const nav = document.querySelector('aside[aria-label="Main navigation"] a');
    const toggle = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Chart');
    return {
      fine: matchMedia('(pointer: fine)').matches,
      wide: matchMedia('(min-width: 64rem)').matches,
      nav: nav ? Math.round(nav.getBoundingClientRect().height) : null,
      toggle: toggle ? Math.round(toggle.getBoundingClientRect().height) : null,
    };
  });
  const dense = density.fine && density.wide;
  ok(
    `density ${dense ? 'compact on desktop' : 'touch-sized'}`,
    dense
      ? density.nav !== null && density.nav <= 42
      : density.nav === null || density.nav >= 44,
    `nav=${density.nav} chartToggle=${density.toggle} fine=${density.fine} wide=${density.wide}`,
  );

  await context.close();
}

console.log(`\nFAILING CHECKS: ${fails}`);
await browser.close();
process.exit(fails ? 1 : 0);
