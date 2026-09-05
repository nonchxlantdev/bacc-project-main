/**
 * Route x viewport sweep: loads every route at every viewport and reports
 * layout, console and network problems.
 *
 * Usage: node scripts/qa/sweep.mjs [viewportFilter] [routeFilter]
 */
import { launch, newPage, signIn, audit, touchAudit, VIEWPORTS, ROUTES, BASE_URL, SHOTS } from './harness.mjs';
import path from 'node:path';

const [vpFilter, routeFilter] = process.argv.slice(2);
const viewports = VIEWPORTS.filter((v) => !vpFilter || v.name.includes(vpFilter));
const routes = ROUTES.filter((r) => !routeFilter || r.path.includes(routeFilter));

const browser = await launch();
let total = 0;

for (const vp of viewports) {
  const { context, page, diagnostics } = await newPage(browser, vp);
  try {
    await signIn(page);
    console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);

    for (const route of routes) {
      diagnostics.console.length = 0;
      diagnostics.pageErrors.length = 0;
      diagnostics.failedRequests.length = 0;

      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(700);

      const res = await audit(page);
      const touch = vp.mobile ? await touchAudit(page) : [];
      const problems = [];

      for (const i of res.issues) problems.push(`[${i.kind}] ${i.detail}`);
      for (const t of touch) problems.push(`[touch-target] "${t.text}" ${t.w}x${t.h}`);
      for (const e of diagnostics.pageErrors) problems.push(`[page-error] ${e}`);
      for (const c of diagnostics.console) problems.push(`[console-${c.type}] ${c.text.slice(0, 220)}`);
      for (const f of diagnostics.failedRequests) problems.push(`[net] ${f.status ?? f.error} ${f.url.slice(0, 140)}`);

      if (problems.length) {
        total += problems.length;
        console.log(`  ${route.label} (${route.path})`);
        for (const p of [...new Set(problems)]) console.log(`    - ${p}`);
        await page.screenshot({
          path: path.join(SHOTS, `${vp.name}__${route.label.replace(/\W+/g, '-')}.png`),
          fullPage: false,
        });
      } else {
        console.log(`  ${route.label} — clean`);
      }
    }
  } catch (err) {
    console.log(`  !! ${vp.name} failed: ${err.message}`);
  } finally {
    await context.close();
  }
}

console.log(`\nTOTAL PROBLEMS: ${total}`);
await browser.close();
