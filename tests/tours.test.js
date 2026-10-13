import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROLES, SCREENS } from '../src/config/access.js';
import { FAQ_GROUPS } from '../src/content/faq.js';
import { INTRO_TOUR_ID, TOURS } from '../src/components/tour/tours.js';
import { getTour, replayableTours, stepsFor, tourForPath, wordCount } from '../src/components/tour/tourSteps.js';
import { hasSeen, markSeen, mergeSeen, sameSeen, sanitizeSeen } from '../src/components/tour/tourProgress.js';
import { validateToursSeen } from '../worker/data/rules.js';

const MAX_WORDS = 25;
// Production wording, and nothing about features that are switched off.
const BANNED = /\b(demo|pilot|trial|test|testing|sandbox|work orders?|photos?|attachments?)\b/i;

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (/\.(jsx?)$/.test(name)) yield p;
  }
}
const SOURCE = [...sourceFiles('src')].map((f) => readFileSync(f, 'utf8')).join('\n');

const asRole = (role) => ({ role });
const allResolvedSteps = () =>
  TOURS.flatMap((tour) => ROLES.flatMap((role) => stepsFor(tour, asRole(role)).map((step) => ({ tour, role, step }))));

test('tour ids are unique, valid for the account field, and versions are whole numbers', () => {
  const ids = TOURS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  const seenAll = Object.fromEntries(TOURS.map((t) => [t.id, t.version]));
  assert.deepEqual(validateToursSeen(seenAll), seenAll);
  assert.ok(getTour(INTRO_TOUR_ID));
});

test('every step, for every role: 25 words at most, production wording only', () => {
  for (const { tour, role, step } of allResolvedSteps()) {
    const where = `${tour.id} / ${step.title} (${role})`;
    assert.equal(typeof step.body, 'string', where);
    assert.ok(step.title && step.body, where);
    assert.ok(wordCount(step.body) <= MAX_WORDS, `${where}: ${wordCount(step.body)} words`);
    assert.doesNotMatch(`${step.title} ${step.body}`, BANNED, where);
  }
});

test('every target exists in the app, and every FAQ link names a real Help group', () => {
  const faqIds = new Set(FAQ_GROUPS.map((g) => g.id));
  const sidebar = readFileSync('src/components/layout/Sidebar.jsx', 'utf8');
  for (const tour of TOURS) {
    for (const step of tour.steps) {
      if (step.faq) assert.ok(faqIds.has(step.faq), `${tour.id}: unknown FAQ group ${step.faq}`);
      if (!step.target) continue;
      if (step.target.startsWith('nav-')) {
        const screen = step.target.slice(4);
        assert.ok(SCREENS[screen], `${tour.id}: no screen ${screen}`);
        assert.ok(sidebar.includes(`screen: '${screen}'`), `${tour.id}: sidebar has no ${screen} item`);
        assert.ok(sidebar.includes('data-tour={`nav-${item.screen}`}'), 'sidebar items carry nav-* targets');
        continue;
      }
      const tagged = SOURCE.includes(`data-tour="${step.target}"`) || SOURCE.includes(`'${step.target}' :`);
      assert.ok(tagged, `${tour.id}: nothing in src/ carries data-tour="${step.target}"`);
    }
  }
});

test('a Duty Manager never gets a Users stop or an admin-only description', () => {
  const dm = asRole('duty_manager');
  const intro = stepsFor(getTour(INTRO_TOUR_ID), dm);
  assert.ok(!intro.some((s) => s.target === 'nav-users'));
  assert.ok(intro.some((s) => s.target === 'nav-incidents'));
  assert.match(intro.find((s) => s.target === 'nav-incidents').body, /assigned to you/);
  assert.match(intro.find((s) => s.target === 'nav-settings').body, /^Your profile/);
  assert.equal(tourForPath('/users', dm), null);
  assert.ok(!replayableTours(dm).some((t) => t.id === 'users'));

  const admin = asRole('admin');
  const adminIntro = stepsFor(getTour(INTRO_TOUR_ID), admin);
  assert.ok(adminIntro.some((s) => s.target === 'nav-users'));
  assert.match(adminIntro.find((s) => s.target === 'nav-incidents').body, /across all teams/);
  assert.equal(tourForPath('/users', admin)?.id, 'users');
  assert.equal(adminIntro.length, intro.length + 1);

  // The COO sees everything but cannot change airport-wide settings.
  const coo = stepsFor(getTour('settings'), asRole('coo'));
  assert.match(coo[0].body, /^Your profile/);
});

test('tourForPath picks screens and record pages, never a sibling screen as a record', () => {
  const dm = asRole('duty_manager');
  assert.equal(tourForPath('/dashboard', dm)?.id, 'dashboard');
  assert.equal(tourForPath('/dashboard/', dm)?.id, 'dashboard');
  assert.equal(tourForPath('/checklists/mine', dm)?.id, 'checklists-mine');
  assert.equal(tourForPath('/checklists/all', dm)?.id, 'checklists-all');
  assert.equal(tourForPath('/checklists/abc-123', dm)?.id, 'checklist');
  assert.equal(tourForPath('/incidents/abc-123', dm)?.id, 'incident');
  assert.equal(tourForPath('/incidents', dm)?.id, 'incidents');
  assert.equal(tourForPath('/nowhere', dm), null);
  assert.equal(tourForPath('/dashboard', null), null);
});

test('replayable tours: welcome first, fixed screens only', () => {
  const list = replayableTours(asRole('admin'));
  assert.equal(list[0].id, INTRO_TOUR_ID);
  assert.ok(list.every((t) => t.id === INTRO_TOUR_ID || !t.path.includes(':')));
  assert.ok(!list.some((t) => t.id === 'checklist' || t.id === 'incident'));
});

test('progress: sanitise, merge keeps the highest version, mark and compare', () => {
  assert.deepEqual(sanitizeSeen({ intro: 1, Bad: 1, x: 0, y: 1.5, z: '2', ok: 3 }), { intro: 1, ok: 3 });
  assert.deepEqual(sanitizeSeen(null), {});
  assert.deepEqual(sanitizeSeen([1]), {});
  assert.deepEqual(mergeSeen({ intro: 1, a: 2 }, { intro: 2 }, null), { intro: 2, a: 2 });
  const intro = getTour(INTRO_TOUR_ID);
  assert.equal(hasSeen({}, intro), false);
  const marked = markSeen({}, intro);
  assert.equal(hasSeen(marked, intro), true);
  assert.equal(hasSeen(marked, { ...intro, version: intro.version + 1 }), false, 'a new version shows again');
  assert.ok(sameSeen({ a: 1, b: 2 }, { b: 2, a: 1 }));
  assert.ok(!sameSeen({ a: 1 }, { a: 1, b: 1 }));
  const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`t${i}`, 1]));
  assert.doesNotThrow(() => validateToursSeen(sanitizeSeen(many)), 'whatever the browser keeps, the server accepts');
});
