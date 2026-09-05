/**
 * Focused reproduction for the reported mobile Location overlap.
 *
 * Checks the Locations page map, then the same map component inside the
 * incident detail page and the create-incident modal, asking in each case
 * whether any map-owned element paints over the app chrome (top bar, nav
 * drawer, modal) or escapes the viewport.
 */
import { launch, newPage, signIn, BASE_URL, SHOTS } from './harness.mjs';
import path from 'node:path';

const PROBE = `() => {
  const vw = innerWidth, vh = innerHeight;
  const out = { stacking: [], geometry: [], hits: [] };

  const desc = (el) => {
    if (!el) return 'null';
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).slice(0,3).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#'+el.id : '') + (cls ? '.'+cls : '');
  };

  const container = document.querySelector('.leaflet-container');
  if (!container) return { error: 'no .leaflet-container on page' };

  const ccs = getComputedStyle(container);
  out.container = {
    position: ccs.position,
    zIndex: ccs.zIndex,
    isolation: ccs.isolation,
    transform: ccs.transform,
    rect: container.getBoundingClientRect().toJSON(),
  };

  // Every z-indexed descendant Leaflet creates.
  for (const el of container.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const z = cs.zIndex;
    if (z !== 'auto' && parseInt(z,10) >= 100) {
      out.stacking.push({ el: desc(el), position: cs.position, zIndex: z });
    }
  }

  // App chrome we care about.
  const chrome = {
    topbar: document.querySelector('header'),
    drawer: document.querySelector('aside[aria-label="Main navigation"]'),
    modal: document.querySelector('.fixed.inset-0.z-50'),
  };
  for (const [name, el] of Object.entries(chrome)) {
    if (!el) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue;
    // Sample points across the chrome element; if a leaflet node wins the
    // hit test there, the map is painting on top of the chrome.
    for (let fx = 0.15; fx <= 0.9; fx += 0.25) {
      for (let fy = 0.15; fy <= 0.9; fy += 0.25) {
        const x = Math.round(r.left + r.width*fx), y = Math.round(r.top + r.height*fy);
        if (x < 1 || y < 1 || x > vw-1 || y > vh-1) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && (container === hit || container.contains(hit))) {
          out.hits.push({ chrome: name, point: [x,y], hit: desc(hit) });
        }
      }
    }
  }

  // Map content escaping the viewport or its own container.
  const cr = container.getBoundingClientRect();
  for (const el of container.querySelectorAll('.leaflet-control-container *, .leaflet-pane')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.bottom > vh + 1 || r.right > vw + 1) {
      out.geometry.push({ el: desc(el), bottom: Math.round(r.bottom), right: Math.round(r.right), vh, vw });
    }
  }
  out.docOverflow = document.documentElement.scrollWidth > vw + 1
    ? document.documentElement.scrollWidth + ' > ' + vw : null;

  return out;
}`;

const browser = await launch();

for (const vp of [
  { name: 'mobile-375x667', width: 375, height: 667, mobile: true },
  { name: 'mobile-390x844', width: 390, height: 844, mobile: true },
  { name: 'mobile-412x915', width: 412, height: 915, mobile: true },
  { name: 'tablet-768x1024', width: 768, height: 1024, mobile: true },
]) {
  const { context, page, diagnostics } = await newPage(browser, vp);
  await signIn(page);
  console.log(`\n######## ${vp.name} ########`);

  // --- Scenario A: Locations page, drawer closed then open ---
  await page.goto(`${BASE_URL}/locations`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForTimeout(900);

  console.log('\n-- A1: /locations, drawer closed --');
  console.log(JSON.stringify(await page.evaluate(`(${PROBE})()`), null, 1));
  await page.screenshot({ path: path.join(SHOTS, `loc-A1-${vp.name}.png`) });

  const menu = page.locator('button[aria-label="Open navigation"]');
  if (await menu.isVisible().catch(() => false)) {
    await menu.click();
    await page.waitForTimeout(500);
    console.log('\n-- A2: /locations, nav drawer OPEN --');
    console.log(JSON.stringify(await page.evaluate(`(${PROBE})()`), null, 1));
    await page.screenshot({ path: path.join(SHOTS, `loc-A2-drawer-${vp.name}.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } else {
    console.log('\n-- A2: skipped, drawer button not visible (persistent sidebar) --');
  }

  // --- Scenario B: incident detail page map ---
  await page.goto(`${BASE_URL}/incidents`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const firstIncident = page.locator('a[href*="/incidents/"]').first();
  if (await firstIncident.count()) {
    await firstIncident.click();
    await page.waitForTimeout(1200);
    const hasMap = await page.locator('.leaflet-container').count();
    if (hasMap) {
      console.log('\n-- B1: incident detail map --');
      console.log(JSON.stringify(await page.evaluate(`(${PROBE})()`), null, 1));
      await page.screenshot({ path: path.join(SHOTS, `loc-B1-${vp.name}.png`), fullPage: true });

      const m2 = page.locator('button[aria-label="Open navigation"]');
      if (await m2.isVisible().catch(() => false)) {
        await m2.click();
        await page.waitForTimeout(500);
        console.log('\n-- B2: incident detail map, drawer OPEN --');
        console.log(JSON.stringify(await page.evaluate(`(${PROBE})()`), null, 1));
        await page.screenshot({ path: path.join(SHOTS, `loc-B2-drawer-${vp.name}.png`) });
        await page.keyboard.press('Escape');
      }
    } else {
      console.log('\n-- B: no map on incident detail --');
    }
  }

  if (diagnostics.pageErrors.length) console.log('page errors:', diagnostics.pageErrors);
  await context.close();
}

await browser.close();
