/** Ad-hoc inspector: list undersized controls and the button labels on a page. */
import { launch, newPage, signIn, BASE_URL } from './harness.mjs';

const route = process.argv[2] || '/incidents';
const drill = process.argv[3]; // optional selector to click into first

const browser = await launch();
const { context, page } = await newPage(browser, { name: 'm', width: 390, height: 844, mobile: true });
page.setDefaultTimeout(8000);
await signIn(page);
await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
if (drill) {
  await page.locator(drill).first().click();
  await page.waitForTimeout(1500);
}

const info = await page.evaluate(() => {
  const small = [];
  for (const el of document.querySelectorAll('button, a[href], [role="button"], summary')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.width >= 40 && r.height >= 40) continue;
    if (el.closest('.leaflet-control-attribution')) continue;
    small.push({
      tag: el.tagName,
      cls: String(el.className).slice(0, 120),
      txt: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
      size: Math.round(r.width) + 'x' + Math.round(r.height),
    });
  }
  const buttons = [...document.querySelectorAll('main button')]
    .map((b) => (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 34))
    .filter(Boolean);
  return { url: location.pathname, small, buttons };
});

console.log(JSON.stringify(info, null, 1));
await context.close();
await browser.close();
