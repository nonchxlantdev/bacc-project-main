/**
 * Walks the ancestor chain of every .leaflet-container and reports which
 * ancestor (if any) actually contains Leaflet's z-index:400..1000 children,
 * plus which app chrome shares that stacking context and loses to it.
 */
import { launch, newPage, signIn, BASE_URL, SHOTS } from './harness.mjs';
import path from 'node:path';

const CHAIN = `() => {
  const desc = (el) => {
    if (!el) return 'null';
    if (el === document.documentElement) return 'html';
    if (el === document.body) return 'body';
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).slice(0,4).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#'+el.id : '') + (cls ? '.'+cls : '');
  };
  const makesContext = (el) => {
    if (el === document.documentElement) return 'root';
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'sticky') return 'position:' + cs.position;
    if ((cs.position === 'relative' || cs.position === 'absolute') && cs.zIndex !== 'auto') return 'positioned+z' + cs.zIndex;
    if (cs.transform !== 'none') return 'transform';
    if (cs.filter !== 'none') return 'filter';
    if (cs.isolation === 'isolate') return 'isolation';
    if (cs.mixBlendMode !== 'normal') return 'mix-blend';
    if (cs.opacity !== '1') return 'opacity';
    if (cs.willChange.includes('transform') || cs.willChange.includes('opacity')) return 'will-change';
    if (cs.contain.includes('paint') || cs.contain.includes('layout')) return 'contain';
    const parentCS = el.parentElement ? getComputedStyle(el.parentElement) : null;
    if (parentCS && /flex|grid/.test(parentCS.display) && cs.zIndex !== 'auto') return 'flex/grid item + z' + cs.zIndex;
    return null;
  };

  const results = [];
  for (const c of document.querySelectorAll('.leaflet-container')) {
    const chain = [];
    let host = null;
    for (let el = c; el; el = el.parentElement) {
      const why = makesContext(el);
      chain.push({ el: desc(el), context: why });
      if (why && el !== c) { host = el; break; }
      if (el === document.documentElement) { host = el; break; }
    }
    // Everything inside the host stacking context that is positioned with a
    // z-index, i.e. everything that competes with Leaflet's 400..1000.
    const competitors = [];
    if (host) {
      for (const el of host.querySelectorAll('*')) {
        if (c.contains(el) || el === c) continue;
        const cs = getComputedStyle(el);
        if (cs.position === 'static' || cs.zIndex === 'auto') continue;
        if (cs.display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 20 || r.height < 10) continue;
        // Only report ones Leaflet would beat.
        if (parseInt(cs.zIndex, 10) >= 1000) continue;
        competitors.push({ el: desc(el), position: cs.position, z: cs.zIndex });
      }
    }
    results.push({ map: desc(c), chain, host: desc(host), competitors: competitors.slice(0, 12) });
  }
  return results;
}`;

const browser = await launch();
const { context, page } = await newPage(browser, { name: 'm', width: 390, height: 844, mobile: true });
await signIn(page);

await page.goto(`${BASE_URL}/locations`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.leaflet-container');
await page.waitForTimeout(800);
console.log('### /locations');
console.log(JSON.stringify(await page.evaluate(`(${CHAIN})()`), null, 1));

// Open the nav drawer and take a picture — visual truth beats hit testing.
await page.click('button[aria-label="Open navigation"]');
await page.waitForTimeout(450);
await page.screenshot({ path: path.join(SHOTS, 'probe-locations-drawer.png') });
const overDrawer = await page.evaluate(() => {
  const aside = document.querySelector('aside[aria-label="Main navigation"]');
  const r = aside.getBoundingClientRect();
  const pts = [];
  for (let y = 120; y < r.height - 40; y += 60) {
    const hit = document.elementFromPoint(Math.round(r.width / 2), y);
    pts.push({ y, hit: hit ? hit.tagName + '.' + String(hit.className).slice(0, 40) : 'null' });
  }
  return pts;
});
console.log('drawer hit test:', JSON.stringify(overDrawer, null, 1));
await page.keyboard.press('Escape');

// The incident detail page: map + "More actions" dropdown + sticky aside.
await page.goto(`${BASE_URL}/incidents`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);
const link = page.locator('a[href*="/incidents/"]').first();
await link.click();
await page.waitForTimeout(1200);
console.log('\n### /incidents/:id');
console.log(JSON.stringify(await page.evaluate(`(${CHAIN})()`), null, 1));

await context.close();
await browser.close();
