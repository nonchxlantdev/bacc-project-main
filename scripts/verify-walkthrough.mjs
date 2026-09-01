/**
 * Shamira's walkthrough, performed by a machine.
 *
 * Sign in against an empty portal, start a checklist, fail one item, submit,
 * raise the deficiency, assign it, work it through to verified, then reopen the
 * original checklist and confirm the item now reads SAT.
 *
 * That last assertion is the point. Writing back to a submitted record is a
 * deliberate departure from §5 and §11, made on BACC's instruction because this
 * is not the final draft — and the thing a sanctioned departure needs most is a
 * test that fails loudly if it ever stops behaving the way it was agreed.
 *
 * Runs against the dev server rather than a preview build, because the clean-
 * environment assertions are only meaningful against a freshly generated store
 * and the dev server is the cheapest way to get one.
 *
 * Every control this drives is reached by its accessible name. That is not a
 * stylistic preference: a control this script cannot name is a control a screen
 * reader cannot name either, so when a selector here was impossible the fix
 * went into the component rather than into a CSS-class selector.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const SHAMIRA = 'shamira.young@pgia.local';
/** Incidents go to a unit, never to a person — see config/incidentLookups.js. */
const UNIT = { value: 'grounds', label: 'Grounds' };
const STORE_KEY = 'bacc-demo-store';

/** Where the portal ships its own Chromium in this workspace. */
const BUNDLED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const failures = [];
const check = (ok, what) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}`);
};

/**
 * Read the demo store out of the page and answer a question about it here.
 *
 * The store is plain JSON, so the predicate runs in Node rather than in the
 * page — which keeps these assertions ordinary readable JavaScript instead of
 * strings shipped across the bridge.
 */
async function readStore(page, fn, arg) {
  const store = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{}'),
    STORE_KEY,
  );
  return fn(store, arg);
}

async function browserOrSkip() {
  const candidates = [process.env.PLAYWRIGHT_CHROMIUM_PATH, BUNDLED_CHROMIUM, undefined];
  let last = null;
  for (const executablePath of candidates) {
    if (executablePath === null) continue;
    try {
      return await chromium.launch({
        executablePath: executablePath || undefined,
        args: ['--no-sandbox'],
      });
    } catch (err) {
      last = err;
    }
  }
  console.log(`SKIP — no Chromium available (${last?.message.split('\n')[0]})`);
  console.log('       Install one with:  npx playwright install chromium');
  console.log('       Or point PLAYWRIGHT_CHROMIUM_PATH at an existing binary.');
  return null;
}

const answering = () =>
  fetch(BASE).then(
    (res) => res.ok,
    () => false,
  );

/**
 * A dev server of our own, on a port nothing else is using.
 *
 * Two things here are deliberate. The port is checked before anything is
 * spawned, because a server already answering would be quietly reused and this
 * script would then assert against somebody else's build. And vite is started
 * from the local binary rather than through `npx`, because killing `npx` leaves
 * the vite it spawned running — which is exactly how a stale server ends up on
 * the port in the first place.
 */
async function startServer() {
  if (await answering()) {
    throw new Error(
      `something is already listening on ${PORT}. Stop it first — this script needs a dev server it started itself.`,
    );
  }
  const bin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
  const proc = spawn(bin, ['--port', String(PORT), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32',
  });
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (await answering()) return proc;
  }
  stopServer(proc);
  throw new Error(`dev server did not come up on ${PORT} within 30s`);
}

/** Take the whole process group down, not just the process we hold. */
function stopServer(proc) {
  if (!proc?.pid) return;
  try {
    if (process.platform === 'win32') proc.kill();
    else process.kill(-proc.pid, 'SIGTERM');
  } catch {
    proc.kill();
  }
}

const browser = await browserOrSkip();
if (!browser) process.exit(0);

const server = await startServer();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

// The map tiles come from an ArcGIS host the sandbox cannot reach. That is the
// network, not the portal, and it must not be mistaken for a failure here.
page.on('pageerror', (err) => {
  console.log(`  note  page error: ${err.message.split('\n')[0]}`);
});

try {
  // ── 1. Sign in ────────────────────────────────────────────────────────────
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', SHAMIRA);
  await page.fill('input[type="password"]', 'demo');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  check(true, 'signed in as Shamira Young');

  // ── 2. The environment is clean ───────────────────────────────────────────
  const clean = await readStore(page, (store) => {
    const counts = {};
    for (const key of [
      'submissions',
      'incidents',
      'work_orders',
      'approvals',
      'instances',
      'notifications',
      'activity',
    ]) {
      counts[key] = store[key]?.length ?? -1;
    }
    return { counts, users: store.users?.length ?? 0, templates: store.templates?.length ?? 0 };
  });
  for (const [key, n] of Object.entries(clean.counts)) {
    check(n === 0, `${key} is empty (found ${n})`);
  }
  check(clean.users === 9, `directory holds nine accounts (found ${clean.users})`);
  // Every approved form BACC has supplied. A number here rather than a
  // greater-than keeps the count honest: a form silently dropped from the
  // registry is a form nobody can file, and that should fail loudly.
  check(clean.templates === 36, `thirty-six approved forms are present (found ${clean.templates})`);
  await page.waitForTimeout(500);
  check(
    !(await page.getByText('NaN').first().isVisible().catch(() => false)),
    'the dashboard renders no NaN against empty data',
  );

  // ── 3. Start a checklist ──────────────────────────────────────────────────
  // Nothing is scheduled — the environment is clean — so this begins the way
  // Shamira will: My Checklists, start a new inspection, pick a form.
  await page.goto(`${BASE}/checklists/mine`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /New Inspection/i }).first().click();
  await page.getByPlaceholder(/Search by form number/i).fill('Annex D');
  const annexD = page.getByRole('button', { name: /Annex D/ }).first();
  await annexD.waitFor({ timeout: 15000 });
  await annexD.click();
  await page.waitForURL(/\/checklists\/[^/]+$/, { timeout: 20000 });
  const checklistUrl = page.url();
  check(true, `opened ${checklistUrl.split('/').pop()}`);

  const signManual = page.getByRole('button', { name: /Sign manually/i }).first();
  if (await signManual.isVisible().catch(() => false)) {
    await signManual.click();
    await page.waitForTimeout(300);
  }

  // ── Conducted by ──────────────────────────────────────────────────────────
  // One field on the approved form, two controls on screen. The draft arrives
  // carrying the signed-in account, and the title half is the canonical post
  // name rather than whatever free text sits on the profile — that string is
  // stamped onto an approved PDF, so it has to be a real post title.
  // Then the inspection is recorded against the colleague who actually walked
  // it, which is the whole reason the title is a list and not a typed string.
  const conductedName = page.getByLabel('Conducted by — name');
  const conductedTitle = page.getByLabel('Conducted by — title');
  await conductedName.waitFor({ timeout: 15000 });
  check(
    (await conductedName.inputValue()) === 'Shamira Young',
    'the name half is prefilled with the signed-in account',
  );
  check(
    (await conductedTitle.inputValue()) === 'Operations Manager',
    'the title half is prefilled with the canonical post name, not the profile text',
  );
  await conductedName.fill('Michael Asevedo');
  await conductedTitle.selectOption('Duty Manager');
  await page.waitForTimeout(800); // autosave debounce is 500ms
  check(
    (await readStore(page, (store) => {
      const draft = (store.submissions ?? []).find((s) => s.status === 'draft');
      return draft?.header?.conductedBy ?? null;
    })) === 'Michael Asevedo / Duty Manager',
    'both controls compose into the one "Name / Position" the approved form stores',
  );

  // ── 4. One NO SAT ─────────────────────────────────────────────────────────
  // A fresh draft arrives with every item already SAT (see checklistSchema.js),
  // which is the paper form's own convention: the inspector marks what failed.
  // So the only answer this walkthrough has to set is the one that fails.
  const satRadios = page.getByRole('radio', { name: /^Mark \S+ SAT$/ });
  await satRadios.first().waitFor({ timeout: 20000 });
  const itemCount = await satRadios.count();
  check(itemCount > 0, `${itemCount} items are open for answering`);

  const firstItemName = await satRadios.first().getAttribute('aria-label');
  const itemCode = firstItemName.replace(/^Mark /, '').replace(/ SAT$/, '');

  // The radio itself is visually hidden — the approved form's column headings
  // carry the meaning on screen — so the thing a person clicks is the label
  // around it. Find it by the accessible name the input now carries, then
  // click what a hand would actually land on.
  const noSatLabel = page.locator(`label:has(input[aria-label="Mark ${itemCode} NO SAT"])`);
  await noSatLabel.scrollIntoViewIfNeeded();
  await noSatLabel.click();

  // A NO SAT is not submittable without remarks — the form says so, and this is
  // the inspector saying what she saw.
  const remarks = page.getByPlaceholder('Required for NO SAT').first();
  await remarks.waitFor({ timeout: 10000 });
  await remarks.fill('Standing water at the outfall; grating partially blocked by silt.');
  await page.waitForTimeout(800); // autosave debounce is 500ms

  const answered = await readStore(
    page,
    (store, code) => {
      const draft = (store.submissions ?? []).find((s) => s.status === 'draft');
      return draft?.items?.[code]?.result ?? null;
    },
    itemCode,
  );
  check(answered === 'no_sat', `item ${itemCode} answered NO SAT`);

  // ── 5. Sign and submit ────────────────────────────────────────────────────
  // The signature pad listens for mouse and touch events, not pointer events,
  // and its coordinates are viewport-relative — so it must be scrolled into
  // view before the mouse is driven across it.
  const pad = page.getByRole('img', { name: /Drawn signature/i }).first();
  await pad.scrollIntoViewIfNeeded();
  await pad.waitFor({ timeout: 10000 });
  const box = await pad.boundingBox();
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(800);

  const submit = page.getByRole('button', { name: /Submit Checklist/i }).first();
  await submit.scrollIntoViewIfNeeded();
  await submit.click();
  await page.waitForTimeout(1200);

  const filed = await readStore(page, (store) => {
    const record = (store.submissions ?? []).find((s) => s.status === 'submitted');
    return record
      ? {
          locked: Boolean(record.locked),
          signed: (record.signoffs ?? []).length > 0,
          conductedBy: record.header?.conductedBy ?? null,
        }
      : null;
  });
  check(Boolean(filed), 'checklist submitted');
  check(filed?.locked === true, 'the submitted record is locked');
  check(filed?.signed === true, "the inspector's signature is on the record");
  check(
    filed?.conductedBy === 'Michael Asevedo / Duty Manager',
    'submitting keeps the conductor the inspector named, and does not stamp the account holder over it',
  );

  // ── 6. Raise the incident ─────────────────────────────────────────────────
  const raise = page.getByRole('button', { name: /^Create Incident$/ }).first();
  await raise.scrollIntoViewIfNeeded();
  await raise.click();
  await page.getByRole('heading', { name: 'Create Incident' }).waitFor({ timeout: 10000 });
  // Deficiency Level is the one field the modal cannot guess; everything else
  // is prefilled from the checklist item that failed.
  await page.getByLabel(/Deficiency Level/i).selectOption({ index: 1 });
  await page.getByRole('button', { name: /^Create Incident$/ }).last().click();
  await page.waitForURL(/\/incidents\/[^/]+$/, { timeout: 20000 });
  const incidentUrl = page.url();
  check(true, 'incident raised from the NO SAT item');
  check(
    await readStore(
      page,
      (store, code) => (store.incidents ?? []).some((i) => i.source_item_code === code),
      itemCode,
    ),
    `the incident carries item ${itemCode} as its source`,
  );

  // ── 7. Assign to a unit, set a target, work it forward ────────────────────
  await page.getByLabel('Assigned Unit').selectOption({ label: UNIT.label });
  await page.waitForTimeout(500);
  const target = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await page.locator('input[type="date"]').first().fill(target);
  await page.waitForTimeout(500);
  check(
    await readStore(page, (store, unit) => {
      const incident = store.incidents?.[0];
      return Boolean(incident?.assigned_unit === unit && incident?.target_date);
    }, UNIT.value),
    `assigned to the ${UNIT.label} unit with a target date`,
  );

  for (const status of ['assigned', 'in_progress', 'resolved']) {
    await page.getByLabel('Current Status').selectOption(status);
    await page.waitForTimeout(700);
  }
  check(
    await readStore(page, (store) => store.incidents?.[0]?.status === 'resolved'),
    'worked through Assigned and In Progress to Resolved',
  );
  // Resolved is not closed, and reporting work finished is not verifying it.
  // The write-back must not have happened yet — if it had, step 9 would pass
  // for the wrong reason and this script would be asserting nothing.
  check(
    (await readStore(
      page,
      (store, code) =>
        (store.submissions ?? []).find((s) => s.status === 'submitted')?.items?.[code]?.result,
      itemCode,
    )) === 'no_sat',
    `item ${itemCode} still reads NO SAT while the work is only reported done`,
  );

  // ── 8. Verify SAT and close ───────────────────────────────────────────────
  const verify = page.getByRole('button', { name: new RegExp(`^Mark ${itemCode} verified SAT$`) });
  await verify.scrollIntoViewIfNeeded();
  await verify.click();
  const confirm = page.getByRole('button', { name: /Confirm SAT/i }).first();
  await confirm.waitFor({ timeout: 10000 });
  await confirm.click();
  await page.waitForTimeout(1000);

  await page.getByLabel('Current Status').selectOption('closed');
  await page.waitForTimeout(1000);
  check(
    await readStore(page, (store) => store.incidents?.[0]?.status === 'closed'),
    'incident verified SAT and closed',
  );

  // ── 9. The original checklist now reads SAT ───────────────────────────────
  // This is what the whole script exists to assert. SYNC_SAT_ON_VERIFICATION is
  // a sanctioned departure from §5 and §11; if it ever stops behaving as agreed
  // — silently reverting, or writing without a trail — these three lines fail.
  const writeBack = await readStore(
    page,
    (store, code) => {
      const record = (store.submissions ?? []).find((s) => s.status === 'submitted');
      const amendment = (record?.amendments ?? []).find((a) => a.item_code === code) ?? null;
      return { result: record?.items?.[code]?.result ?? null, amendment };
    },
    itemCode,
  );
  check(writeBack.result === 'sat', `item ${itemCode} now reads SAT on the original checklist`);
  check(
    writeBack.amendment?.from === 'no_sat' && writeBack.amendment?.to === 'sat',
    'the original answer is retained in the amendment trail',
  );
  check(
    writeBack.amendment?.reason === 'incident_verified_sat',
    'the amendment records why it changed',
  );
  check(
    Boolean(writeBack.amendment?.incident_id) && Boolean(writeBack.amendment?.at),
    'the amendment records which incident changed it, and when',
  );

  // ── The portal says so in plain language ──────────────────────────────────
  await page.goto(incidentUrl, { waitUntil: 'domcontentloaded' });
  check(
    await page
      .getByText(/now reads SAT on the original checklist/i)
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true, () => false),
    'the incident page says so in plain language',
  );

  await page.goto(checklistUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('radio', { name: `Mark ${itemCode} SAT` }).first().waitFor({ timeout: 15000 });
  check(
    await page.getByRole('radio', { name: `Mark ${itemCode} SAT` }).first().isChecked(),
    `the reopened checklist shows ${itemCode} as SAT on screen`,
  );

  // The cross-link on the incident screen has to land on the group it names,
  // with the answers unfolded — a deep link that arrives on a folded heading
  // technically worked and practically did not.
  await page.goto(`${BASE}/help#incidents`, { waitUntil: 'domcontentloaded' });
  const incidentsGroup = page.locator('#incidents');
  await incidentsGroup.waitFor({ state: 'visible', timeout: 15000 });
  check(
    await incidentsGroup.locator('details').first().evaluate((el) => el.open),
    'the Help page opens the Incidents group when linked to by hash',
  );
  check(
    !(await page.locator('#approvals details').first().evaluate((el) => el.open)),
    'and leaves the other groups folded',
  );
} catch (err) {
  check(false, `walkthrough threw: ${err.message.split('\n')[0]}`);
} finally {
  await browser.close();
  stopServer(server);
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nWalkthrough intact.');
