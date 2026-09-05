/**
 * Shared Playwright harness for the QA pass.
 *
 * Drives the locally installed Chrome (playwright-core ships no browser
 * binaries), signs into the demo portal, and exposes the viewport matrix plus
 * the in-page audits every QA script reuses.
 */
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SHOTS = path.join(ROOT, 'tmp-qa');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

export const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:5174';

export const VIEWPORTS = [
  { name: 'mobile-375x667', width: 375, height: 667, mobile: true },
  { name: 'mobile-390x844', width: 390, height: 844, mobile: true },
  { name: 'mobile-412x915', width: 412, height: 915, mobile: true },
  { name: 'tablet-768x1024', width: 768, height: 1024, mobile: true },
  { name: 'tablet-820x1180', width: 820, height: 1180, mobile: true },
  { name: 'tablet-1024x1366', width: 1024, height: 1366, mobile: true },
  { name: 'narrow-1060x800', width: 1060, height: 800, mobile: false },
  { name: 'desktop-1280x720', width: 1280, height: 720, mobile: false },
  { name: 'desktop-1440x900', width: 1440, height: 900, mobile: false },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, mobile: false },
];

export const ROUTES = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/checklists/mine', label: 'My Checklists' },
  { path: '/checklists/all', label: 'All Checklists' },
  { path: '/incidents', label: 'Incidents' },
  { path: '/approvals', label: 'Approvals' },
  { path: '/reports', label: 'Reports' },
  { path: '/locations', label: 'Locations' },
  { path: '/users', label: 'Users' },
  { path: '/settings', label: 'Settings' },
  { path: '/notifications', label: 'Notifications' },
  { path: '/help', label: 'Help' },
];

export function chromePath() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) throw new Error('No Chrome/Edge executable found.');
  return found;
}

export async function launch() {
  await mkdir(SHOTS, { recursive: true });
  return chromium.launch({ executablePath: chromePath(), headless: true });
}

/** A page wired for console/network capture, with the diagnostics attached. */
export async function newPage(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: false, // Chrome desktop refuses isMobile without touch emulation quirks
    hasTouch: Boolean(viewport.mobile),
    permissions: [],
  });
  const page = await context.newPage();
  const diagnostics = { console: [], pageErrors: [], failedRequests: [] };

  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      const text = msg.text();
      if (isNoise(text)) return;
      diagnostics.console.push({ type, text });
    }
  });
  page.on('pageerror', (err) => diagnostics.pageErrors.push(String(err?.message || err)));
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (isExternalTile(url)) return;
    diagnostics.failedRequests.push({ url, error: req.failure()?.errorText });
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !isExternalTile(res.url())) {
      diagnostics.failedRequests.push({ url: res.url(), status: res.status() });
    }
  });

  page.__diagnostics = diagnostics;
  return { context, page, diagnostics };
}

/** Tile servers and fonts are third-party; offline CI noise is not our bug. */
function isExternalTile(url) {
  return (
    url.includes('tile.openstreetmap.org') ||
    url.includes('server.arcgisonline.com') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com')
  );
}

function isNoise(text) {
  return (
    text.includes('Download the React DevTools') ||
    text.includes('[vite] connect') ||
    text.includes('sw.js') ||
    text.includes('ServiceWorker')
  );
}

/** Sign in through the real login form so session state matches a user's. */
export async function signIn(page, { showcase = true } = {}) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[type="submit"]', { timeout: 15000 });
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });

  if (showcase) {
    await page.evaluate(async () => {
      const mod = await import('/src/data/repositories/index.js');
      await mod.getRepos().instances.loadShowcase();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 15000 });
  }
  await page.waitForTimeout(400);
}

/**
 * Layout audit run inside the page.
 *
 * Reports only things a user would actually hit: content wider than the
 * viewport, interactive elements pushed off-screen or under a fixed bar, and
 * touch targets below the 44px guideline on touch viewports.
 */
export const AUDIT = `() => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const issues = [];
  const label = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.')
      : '';
    const txt = (el.textContent || '').trim().slice(0, 40).replace(/\\s+/g, ' ');
    return el.tagName.toLowerCase() + id + cls + (txt ? ' "' + txt + '"' : '');
  };

  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) {
    issues.push({ kind: 'document-h-overflow', detail: 'scrollWidth ' + de.scrollWidth + ' > ' + vw });
  }

  /**
   * How an element's own overflow past the viewport should be judged:
   *  - 'clipped'    an ancestor hides it, so nothing is actually visible
   *  - 'scrollable' an ancestor scrolls horizontally, so it is reachable
   *  - 'escaped'    genuinely spilling out of the page
   */
  const containment = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      const ox = cs.overflowX;
      if (ox === 'hidden' || ox === 'clip') return 'clipped';
      if (ox === 'auto' || ox === 'scroll') {
        return p.scrollWidth > p.clientWidth + 1 ? 'scrollable' : 'clipped';
      }
    }
    return 'escaped';
  };

  // Which element is actually sticking out past the right edge.
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 2 && r.width <= vw + 2 && r.width > 12) {
      const p = el.parentElement;
      const pr = p ? p.getBoundingClientRect() : null;
      if (pr && pr.right > vw + 2) continue; // report the outermost offender only
      if (containment(el) !== 'escaped') continue;
      issues.push({ kind: 'element-overflows-right', detail: label(el) + ' right=' + Math.round(r.right) });
    }
  }

  // Fixed bars that could sit over content.
  const fixedBars = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (parseFloat(cs.opacity || '1') === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 24) continue;
    fixedBars.push({ el, rect: r, z: parseInt(cs.zIndex, 10) || 0 });
  }

  /**
   * A drawer or modal is *supposed* to cover the page behind it, so once a
   * full-viewport scrim is up the audit only looks at the layer on top of
   * it. Without this every backgrounded control reads as a false "covered".
   */
  const scrim = fixedBars
    .filter((b) => b.rect.width >= vw * 0.9 && b.rect.height >= vh * 0.9)
    .sort((a, b) => b.z - a.z)[0];
  const inActiveLayer = (el) => {
    if (!scrim) return true;
    if (scrim.el.contains(el)) return true;
    return fixedBars.some((b) => b.el !== scrim.el && b.z >= scrim.z && b.el.contains(el));
  };

  const interactive = [...document.querySelectorAll(
    'button, a[href], input, select, textarea, [role="button"], [role="radio"], [tabindex]:not([tabindex="-1"])'
  )].filter(inActiveLayer);

  for (const el of interactive) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (el.disabled) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    if (r.right > vw + 2 || r.left < -2) {
      const how = containment(el);
      if (how === 'escaped') {
        issues.push({ kind: 'control-offscreen-x', detail: label(el) + ' x=[' + Math.round(r.left) + ',' + Math.round(r.right) + ']' });
      } else if (how === 'clipped') {
        issues.push({ kind: 'control-clipped-unreachable', detail: label(el) + ' x=[' + Math.round(r.left) + ',' + Math.round(r.right) + ']' });
      }
    }

    // Under a fixed bar with a higher stacking order = unreachable.
    for (const bar of fixedBars) {
      if (bar.el === el || bar.el.contains(el)) continue;
      // A scrim is meant to be behind its own drawer.
      if (scrim && el === scrim.el) continue;
      const b = bar.rect;
      const overlapX = Math.min(r.right, b.right) - Math.max(r.left, b.left);
      const overlapY = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      if (overlapX <= 2 || overlapY <= 2) continue;
      const covered = (overlapX * overlapY) / (r.width * r.height);
      if (covered < 0.4) continue;
      // Confirm with hit testing at the control's centre.
      const cx = Math.max(1, Math.min(vw - 1, r.left + r.width / 2));
      const cy = Math.max(1, Math.min(vh - 1, r.top + r.height / 2));
      const hit = document.elementFromPoint(cx, cy);
      if (hit && (hit === el || el.contains(hit) || hit.contains(el))) continue;
      if (hit && bar.el.contains(hit)) {
        issues.push({
          kind: 'control-covered-by-fixed',
          detail: label(el) + ' covered by ' + label(bar.el),
        });
      }
    }
  }

  return { vw, vh, scrollWidth: de.scrollWidth, issues };
}`;

/** Touch-target audit, separate so desktop runs can skip it. */
export const TOUCH_AUDIT = `() => {
  const MIN = 40; // 44 guideline, 40 tolerance for icon buttons with padding
  const vw = innerWidth, vh = innerHeight;
  const out = [];
  const seen = new Set();

  // Same active-layer rule as the layout audit: don't grade controls sitting
  // behind an open drawer or modal.
  const fixedFull = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width >= vw * 0.9 && r.height >= vh * 0.9) fixedFull.push({ el, z: parseInt(cs.zIndex, 10) || 0 });
  }
  const scrim = fixedFull.sort((a, b) => b.z - a.z)[0];
  const peers = scrim
    ? [...document.querySelectorAll('body *')].filter((el) => {
        const cs = getComputedStyle(el);
        return cs.position === 'fixed' && (parseInt(cs.zIndex, 10) || 0) >= scrim.z && el !== scrim.el;
      })
    : [];

  for (const el of document.querySelectorAll('button, a[href], [role="button"], input[type="checkbox"], input[type="radio"]')) {
    if (scrim && !scrim.el.contains(el) && !peers.some((p) => p.contains(el))) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.disabled) continue;
    if (cs.position === 'absolute' && parseFloat(cs.opacity || '1') === 0) continue;
    // Map attribution credits are required fine print, not app controls.
    if (el.closest('.leaflet-control-attribution')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.width >= MIN && r.height >= MIN) continue;
    // sr-only inputs inside a big label are fine.
    const lbl = el.closest('label');
    if (lbl) {
      const lr = lbl.getBoundingClientRect();
      if (lr.width >= MIN && lr.height >= MIN) continue;
    }
    // A control can be bigger to the finger than its own box when a
    // positioned pseudo-element with negative insets stretches its hit
    // region (see the draggable map pin). Measure that directly rather than
    // hit-testing, which only works while the control is on screen.
    let ew = r.width;
    let eh = r.height;
    for (const pseudo of ['::before', '::after']) {
      const pcs = getComputedStyle(el, pseudo);
      if (!pcs || pcs.content === 'none' || pcs.position === 'static') continue;
      const inset = (v) => (Number.isFinite(parseFloat(v)) ? Math.min(0, parseFloat(v)) : 0);
      ew = Math.max(ew, r.width - inset(pcs.left) - inset(pcs.right));
      eh = Math.max(eh, r.height - inset(pcs.top) - inset(pcs.bottom));
    }
    if (ew >= MIN && eh >= MIN) continue;

    // Padded ancestors count too: probe the points a MIN-sized target covers.
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const reach = MIN / 2 - 2;
    const owns = (x, y) => {
      if (x < 1 || y < 1 || x > vw - 1 || y > vh - 1) return false;
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit) && (hit === el || el.contains(hit) || hit.contains(el));
    };
    if (owns(cx - reach, cy) && owns(cx + reach, cy) && owns(cx, cy - reach) && owns(cx, cy + reach)) continue;

    const txt = (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 36).replace(/\\s+/g, ' ');
    const key = txt + Math.round(r.width) + 'x' + Math.round(r.height);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: txt || el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return out;
}`;

export async function audit(page) {
  return page.evaluate(`(${AUDIT})()`);
}

export async function touchAudit(page) {
  return page.evaluate(`(${TOUCH_AUDIT})()`);
}

export function fmt(list, indent = '    ') {
  return list.map((i) => `${indent}- ${i.kind ? `[${i.kind}] ` : ''}${i.detail ?? JSON.stringify(i)}`).join('\n');
}
