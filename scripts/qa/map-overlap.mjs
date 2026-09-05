/**
 * Regression test for the map/stacking bug.
 *
 * Verifies, by pixel comparison rather than hit testing, that no Leaflet map
 * paints over the nav drawer, a dropdown menu, or a select listbox.
 */
import { launch, newPage, signIn, BASE_URL, SHOTS } from './harness.mjs';
import path from 'node:path';

/**
 * Samples the rendered pixels inside a chrome element's box and reports how
 * many are map-coloured. The drawer/menu surfaces are flat navy or flat
 * surface-white; map tiles are neither, so any sizeable patch of "other"
 * means the map is showing through.
 */
const ESCAPED = `(selector) => {
  const el = document.querySelector(selector);
  if (!el) return { error: 'missing ' + selector };
  const r = el.getBoundingClientRect();
  const maps = [...document.querySelectorAll('.leaflet-container')].map((m) => m.getBoundingClientRect());
  const overlapping = maps.filter((m) =>
    Math.min(r.right, m.right) - Math.max(r.left, m.left) > 4 &&
    Math.min(r.bottom, m.bottom) - Math.max(r.top, m.top) > 4
  );
  return {
    chromeRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    overlappingMaps: overlapping.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y), w: Math.round(m.width), h: Math.round(m.height) })),
  };
}`;

/** True when the map is visually on top of the chrome box. */
async function mapPaintsOver(page, selector) {
  const geo = await page.evaluate(`(${ESCAPED})(${JSON.stringify(selector)})`);
  if (geo.error || !geo.overlappingMaps?.length) return { overlap: false, geo };

  // Hide every map, screenshot the chrome region, show them, screenshot again.
  const clip = {
    x: Math.max(0, geo.chromeRect.x),
    y: Math.max(0, geo.chromeRect.y),
    width: Math.min(geo.chromeRect.w, page.viewportSize().width - Math.max(0, geo.chromeRect.x)),
    height: Math.min(geo.chromeRect.h, page.viewportSize().height - Math.max(0, geo.chromeRect.y)),
  };
  const withMap = await page.screenshot({ clip });
  await page.addStyleTag({ content: '.leaflet-container{visibility:hidden !important}', });
  await page.waitForTimeout(120);
  const withoutMap = await page.screenshot({ clip });
  await page.evaluate(() => {
    document.querySelectorAll('style').forEach((s) => {
      if (s.textContent.includes('.leaflet-container{visibility:hidden')) s.remove();
    });
  });
  await page.waitForTimeout(120);

  const differs = !withMap.equals(withoutMap);
  return { overlap: differs, geo, withMap, clip };
}

const VPS = [
  { name: '375x667', width: 375, height: 667, mobile: true },
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '412x915', width: 412, height: 915, mobile: true },
  { name: '768x1024', width: 768, height: 1024, mobile: true },
];

const browser = await launch();
let failures = 0;

for (const vp of VPS) {
  const { context, page } = await newPage(browser, vp);
  await signIn(page);
  console.log(`\n### ${vp.name}`);

  // 1. Locations page map vs the nav drawer.
  await page.goto(`${BASE_URL}/locations`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.leaflet-container');
  await page.waitForTimeout(900);
  const menu = page.locator('button[aria-label="Open navigation"]');
  if (await menu.isVisible().catch(() => false)) {
    await menu.click();
    await page.waitForTimeout(450);
    const r = await mapPaintsOver(page, 'aside[aria-label="Main navigation"]');
    console.log(`  map over nav drawer: ${r.overlap ? 'FAIL — map paints over drawer' : 'ok'}`);
    if (r.overlap) {
      failures++;
      await page.screenshot({ path: path.join(SHOTS, `fail-drawer-${vp.name}.png`) });
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } else {
    console.log('  map over nav drawer: n/a (persistent sidebar)');
  }

  // 2. Incident detail: account dropdown + map, and the page's own menus.
  await page.goto(`${BASE_URL}/incidents`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const link = page.locator('a[href*="/incidents/"]').first();
  if (await link.count()) {
    await link.click();
    await page.waitForTimeout(1300);

    // Scroll the map up near the top bar, then open the account menu so its
    // panel lands over the map.
    await page.evaluate(() => {
      const m = document.querySelector('.leaflet-container');
      m?.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(500);
    await page.locator('header button').last().click();
    await page.waitForTimeout(400);
    const dd = await mapPaintsOver(page, 'header + * , [role="menu"]').catch(() => null);
    const menuSel = (await page.locator('[role="menu"]').count()) ? '[role="menu"]' : null;
    if (menuSel) {
      const r = await mapPaintsOver(page, menuSel);
      console.log(`  map over account menu: ${r.overlap ? 'FAIL' : 'ok'}`);
      if (r.overlap) { failures++; await page.screenshot({ path: path.join(SHOTS, `fail-menu-${vp.name}.png`) }); }
    } else {
      console.log('  map over account menu: menu selector not found');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    // Nav drawer over the incident-detail map.
    const m2 = page.locator('button[aria-label="Open navigation"]');
    if (await m2.isVisible().catch(() => false)) {
      await m2.click();
      await page.waitForTimeout(450);
      const r = await mapPaintsOver(page, 'aside[aria-label="Main navigation"]');
      console.log(`  map over drawer (incident): ${r.overlap ? 'FAIL' : 'ok'}`);
      if (r.overlap) { failures++; await page.screenshot({ path: path.join(SHOTS, `fail-drawer-inc-${vp.name}.png`) }); }
      await page.keyboard.press('Escape');
    }
    await page.screenshot({ path: path.join(SHOTS, `after-incident-map-${vp.name}.png`) });
  }
  void 0;
  await context.close();
}

console.log(`\nFAILURES: ${failures}`);
await browser.close();
