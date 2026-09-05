# QA Report

## Test Date

2026-09-05

## Method

Browser automation, not static review. A Playwright harness (`scripts/qa/`) drives the
locally installed Chrome against the dev server, signs into the demo portal, and runs
in-page audits that measure real geometry — `getBoundingClientRect`, computed styles,
`elementFromPoint` hit tests, and stacking-context walks — rather than reading CSS and
inferring. Console messages, page errors and failed requests are captured on every page.

| Script | Purpose |
| --- | --- |
| `harness.mjs` | Browser launch, sign-in, viewport matrix, shared layout + touch audits |
| `sweep.mjs` | Every route × every viewport, default state |
| `flows.mjs` | Interactive: menus, tabs, modals, selects, filters, forms, validation |
| `stress.mjs` | Rapid nav, mid-load refresh, click hammering, resize, orientation, offline |
| `verify-fixes.mjs` | Targeted per-bug regression checks |
| `location-bug.mjs`, `stacking-probe.mjs`, `map-overlap.mjs`, `incident-modal.mjs` | Diagnosis + regression for the reported Location overlap |

What the audits flag: elements escaping the viewport horizontally, controls clipped
unreachable, controls painted over by fixed elements, touch targets under 40px effective
hit area (44px guideline, tolerance for padded icon buttons), horizontal document scroll,
console errors/warnings, uncaught page errors, and failed network requests.

## Application Area Tested

**Routes (11):** Dashboard, My Checklists, All Checklists, Incidents, Approvals, Reports,
Locations, Users, Settings, Notifications, Help. Plus the detail routes for an individual
incident and an individual checklist.

**Interactive surfaces:** top bar account menu, nav drawer and collapsible sidebar,
incident filters and status selects, incident detail tab bar (Location / Photos /
Actions & Updates / History / Details), More Actions / Change Status / Add Update /
Edit Incident menus, the Leaflet map and its layer toggle, checklist signature prompt,
the NO SAT sheet, the Create Incident modal including its map picker and validation,
the New Inspection picker, all six Settings sections, the sticky dirty-state save bar,
record tables on Incidents / Users / Checklists / Reports, and dashboard chart/table
view switching.

**Flows:** sign-in, navigate to a checklist, mark an item NO SAT, raise the linked
incident from the sheet, pin its location on the map, and trip the modal's validation.

## Viewports Tested

All ten, on every suite:

| Class | Sizes |
| --- | --- |
| Mobile | 375×667, 390×844, 412×915 |
| Tablet | 768×1024, 820×1180, 1024×1366 |
| Narrow desktop | 1060×800 |
| Desktop | 1280×720, 1440×900, 1920×1080 |

Touch emulation (`hasTouch`) is on for mobile and tablet contexts and off for desktop, so
`pointer: coarse` / `pointer: fine` resolve the way they would on real hardware. This
matters: several bugs below only exist on a device that is wide *and* finger-driven, and
a resized desktop window cannot reproduce them.

## Bugs Found

10 found, 10 fixed.

---

### BUG-01 — Leaflet map paints over the app's navigation and modal chrome

**This is the reported bug.** The user's description ("in mobile view the Location
interface overlaps the task bar") is one symptom of a general stacking failure.

- **Page/component:** `LocationsPage`, `LocationPicker`, `IncidentDetailPage`,
  `CreateIncidentModal` — anywhere Leaflet renders
- **Viewport:** all; most visible at 375–412 wide where the drawer covers the map area
- **Steps to reproduce:** open `/locations` at 390×844, tap the hamburger to open the nav
  drawer. Also: open an incident, go to the Location tab, open More Actions.
- **Expected:** the drawer, its scrim, dropdown menus and a modal's sticky action bar all
  paint above the map.
- **Actual:** the map's tile panes and zoom control paint over them. The drawer is
  half-hidden behind the map, dropdown menus open underneath it, and in the Create
  Incident modal the map covers the sticky Save/Cancel bar at the bottom — which is what
  reads as "the Location interface overlapping the task bar."
- **Root cause:** Leaflet has its own z-index scale (panes 200–700, controls 800, corner
  control holders 1000) but never makes `.leaflet-container` a stacking context. Those
  numbers therefore escape into whichever context the map happens to render in — at page
  level, the root context, where a z-1000 zoom control out-ranks the nav drawer (z-40),
  the modal scrim (z-30) and every dropdown. Nothing about viewport height, `100vh`,
  safe-area insets or bottom offsets is involved; the panel's box was always correct.
  Verified empirically with `stacking-probe.mjs`, which walks the containing-block chain
  and reports which ancestor establishes a context — before the fix, none did between the
  map pane and `<html>`.
- **Fix applied:** `isolation: isolate` on `.leaflet-container`, which scopes Leaflet's
  entire scale inside the map box and leaves the container an ordinary `z-auto` element
  that stacks by document order — what every call site already assumed. The two app-owned
  overlays that had been inflated to `z-[400]` to compete with Leaflet (the layer toggle
  and the incident location pointer-events shim) dropped to `z-10`, correct inside the new
  context, and their wrappers got `isolate` so the map cannot escape a parent either.
- **Files changed:** `src/index.css`, `src/components/incidents/LocationPicker.jsx`,
  `src/pages/IncidentDetailPage.jsx`
- **Retest:** `map-overlap.mjs` compares screenshot pixels in the region where the drawer
  crosses the map and confirms drawer pixels win. `incident-modal.mjs` confirms the
  modal's own sticky bars sit above the picker. Both pass at every viewport.

---

### BUG-02 — Dropdown menu opens off-screen on narrow viewports

- **Page/component:** `Dropdown` (`More Actions` on incident detail is the reproducer)
- **Viewport:** 375×667, 390×844, 412×915
- **Steps to reproduce:** open an incident at 375×667, tap More Actions.
- **Expected:** the menu stays inside the viewport.
- **Actual:** its left edge lands at roughly −60px; the top three items cannot be tapped.
- **Root cause:** the menu is anchored `right-0` to its toggle. That is right whenever the
  toggle is near the right edge, but on a phone the action row wraps and the toggle ends
  up mid-row, so a menu wider than the distance from the toggle's right edge to the
  screen's left edge overflows. A static anchor cannot know this.
- **Fix applied:** the menu measures itself in `useLayoutEffect` after opening and, if it
  crosses either edge, corrects by adjusting the inset the anchor class already sets. The
  correction converges — each pass measures the already-shifted box, so a zero delta ends
  it. It re-runs on resize. The nudge uses `left`/`right` rather than a transform because
  the open animation animates transform and an inline one would be overridden until the
  animation ended, then jump. A `max-w-[calc(100vw-1rem)]` cap handles menus wider than
  the screen itself.
- **Files changed:** `src/components/ui/Dropdown.jsx`
- **Retest:** `verify-fixes.mjs` BUG-01 check asserts the open menu's box is inside the
  viewport and that no item fails a hit test — passes at all ten viewports.

---

### BUG-03 — Settings → Lookups crashes on an out-of-range number

- **Page/component:** `NumberInput` in `src/components/settings/settingsUi.jsx`
- **Viewport:** all
- **Steps to reproduce:** Settings → Lookups, type `999999999` into a numeric field.
- **Expected:** the value is constrained to the field's declared range.
- **Actual:** `RangeError: Invalid string length`; the whole section unmounts to a blank
  panel and the user loses unsaved edits.
- **Root cause:** `min`/`max` on `<input type="number">` are advisory — they mark the field
  invalid but still hand you the value. The raw number flowed into the settings draft and
  reached a `padStart` call whose length argument it then blew past.
- **Fix applied:** clamp in the change handler before the value reaches state. Empty stays
  `null` so "Not set" remains distinct from zero — an important distinction here, since a
  field coerced to 0 would turn "no rule configured" into "due immediately."
- **Files changed:** `src/components/settings/settingsUi.jsx`
- **Retest:** `verify-fixes.mjs` BUG-03 types the same value and asserts the field settles
  at its max (8) with the section still mounted. Passes.

---

### BUG-04 — Record tables clipped and unusable on a large tablet

- **Page/component:** `IncidentListPage`, `UsersPage`, `ReportsPage`,
  `MyChecklistsPage`, `ChecklistCataloguePage`
- **Viewport:** 1024×1366 (iPad Pro portrait)
- **Steps to reproduce:** open `/incidents` at 1024×1366 with touch emulation on.
- **Expected:** every column readable and every row action reachable.
- **Actual:** the 7-column desktop table renders into a ~740px content column and the
  right-hand columns are cut off with no way to scroll to them.
- **Root cause:** two compounding decisions. The `table-stack` rule un-stacked tables at
  `min-width: 1024px`, treating width as a proxy for "desktop," so a finger-driven iPad Pro
  got the dense desktop table whose row actions and sort headers are sized for a mouse.
  And the wrappers used `overflow-hidden`, so the overflow was silently clipped instead of
  scrollable.
- **Fix applied:** the stacking media query became the exact inverse of the `desk:`
  variant — stack unless the screen is wide *and* the pointer is precise — so the iPad Pro
  keeps the readable stacked cards. Wrappers moved to `overflow-x-auto`, so any future
  overflow scrolls rather than disappearing. The query is written in the legacy
  `not all and (…)` form deliberately: a parser that does not understand it degrades to
  "always stacked" rather than "never stacked."
- **Files changed:** `src/index.css`, `src/pages/IncidentListPage.jsx`,
  `src/pages/UsersPage.jsx`, `src/pages/ReportsPage.jsx`,
  `src/pages/MyChecklistsPage.jsx`, `src/pages/ChecklistCataloguePage.jsx`
- **Retest:** `verify-fixes.mjs` BUG-05 compares table width against wrapper width on
  `/incidents` and `/users` at every viewport and records whether the stacked layout is
  active. At 1024×1366: `stacked=true`, table 738 = wrapper 738. Passes.

---

### BUG-05 — Systemic: touch targets collapse on wide touch devices

This is the largest finding and the root of several of the ones below.

- **Page/component:** ~63 utility instances across 20 files
- **Viewport:** 1024×1366 primarily; anywhere `lg` meets a touch screen
- **Steps to reproduce:** at 1024×1366 with touch on, measure the nav items, settings
  toggles, chart view switcher, table row actions.
- **Expected:** ≥44px on a touch device.
- **Actual:** 20–28px. The chart view toggle measured 24px.
- **Root cause:** the codebase used `lg:` (≥1024px) as a proxy for "this is a mouse, it can
  take a denser control." Width is not that signal. A 1024×1366 iPad Pro in portrait is an
  `lg` viewport operated entirely by a fingertip, so every `lg:min-h-0` on it shrank a
  control below the touch minimum.
- **Fix applied:** a `desk:` custom variant — `(width >= 64rem) and (pointer: fine)` — that
  expresses the real condition, and a migration of every density utility onto it.
  Layout that genuinely depends on width keeps plain `lg:`. This is the convention going
  forward, documented in `CLAUDE.md`.
- **Files changed:** `src/index.css` plus density-utility migration across
  `Sidebar.jsx`, `TopBar.jsx`, `Select.jsx`, `SortableTh.jsx`, `ChartCard.jsx`,
  `settingsUi.jsx`, `OtherSections.jsx`, `AttachmentsPanel.jsx`, `DrawingAttach.jsx`,
  `LogTable.jsx`, `NewInspectionPicker.jsx`, `PdfPreview.jsx`, `SignaturePad.jsx`,
  `ApprovalsPage.jsx`, `ChecklistCataloguePage.jsx`, `ChecklistDetailPage.jsx`,
  `DashboardPage.jsx`, `IncidentDetailPage.jsx`, `MyChecklistsPage.jsx`,
  `ReportsPage.jsx`, `SettingsPage.jsx`
- **Retest:** `verify-fixes.mjs` asserts both directions — controls are touch-sized where
  the pointer is coarse, and still compact where it is fine. At 1024×1366:
  `nav=44 chartToggle=40 fine=false`. At 1440×900: `nav=40 chartToggle=24 fine=true`.
  Both pass, so the desktop density was not sacrificed to fix the tablet.

---

### BUG-06 — Leaflet zoom buttons are 30px on touch

- **Component:** `.leaflet-bar a`
- **Viewport:** all mobile and tablet
- **Root cause:** Leaflet hard-codes 30px square at every size, including its own "touch"
  mode. That made them the smallest controls in the app, on a surface where a missed tap
  pans the map instead of doing nothing.
- **Fix applied:** 44px under `@media (pointer: coarse)`, at specificity matching
  Leaflet's own `.leaflet-touch .leaflet-bar a` so the override actually wins.
- **Files changed:** `src/index.css`
- **Retest:** touch audit reports zero undersized controls on map routes. Passes.

---

### BUG-07 — Draggable incident pin has a 16px grab area

- **Component:** `.leaflet-marker-draggable`
- **Viewport:** all mobile and tablet
- **Root cause:** the pin is a 16px dot that has to be dragged with a fingertip.
- **Fix applied:** an invisible `::after` with negative insets stretches the hit region to
  44px while the marker keeps its exact size and anchor — so the pin still sits on the
  coordinate it reports. Growing the marker itself would have shifted the reported
  position.
- **Files changed:** `src/index.css`
- **Retest:** `verify-fixes.mjs` BUG-02 measures effective hit area: `box=16x16
  effective=40px` on touch, `12px` on mouse (unchanged, correctly). Passes.

---

### BUG-08 — Checklist item code and text are two small duplicate buttons

- **Component:** `ChecklistItemRow`
- **Viewport:** phone and tablet tiers (<1280px)
- **Actual:** the item code (`DR-01`) and its wording were separate buttons, each ~24px
  tall, both opening the same sheet — and both announced separately by a screen reader.
- **Fix applied:** merged into one `min-h-11` button per tier. Fewer nodes, one
  accessibility entry, a target twice the size.
- **Files changed:** `src/components/checklist/ChecklistItemRow.jsx`
- **Retest:** `flows.mjs` `checklist-detail-default` and `checklist-nosat-sheet` clean at
  all viewports.

---

### BUG-09 — Record links in stacked table rows are ~20px tall

- **Component:** `.table-stack td a`
- **Viewport:** all stacked (mobile, tablet)
- **Root cause:** the link is inline text inheriting the cell's line height. It is also the
  primary action of the row — the way you open a record.
- **Fix applied:** `inline-flex` with a 44px min-height, scoped inside the stacking media
  query so the desktop table's row height is untouched.
- **Files changed:** `src/index.css`
- **Retest:** touch audit clean on `/incidents`, `/users`, `/checklists/*`.

---

### BUG-10 — Four individually undersized controls

Found by the touch audit, each fixed with `min-h-11 desk:min-h-0` so the desktop
density is preserved:

| Control | Measured | File |
| --- | --- | --- |
| "Back" on checklist detail | 68×32 | `ChecklistDetailPage.jsx` |
| "More about incidents" | 130×16 | `HowThisWorks.jsx` |
| Map View / Details View tabs | 65×34 | `IncidentDetailPage.jsx` |
| "Clear signature" | under 44 | `SignaturePad.jsx` |

**Retest:** touch audit reports zero undersized controls across all routes and viewports.

---

## Console, Network and Stress Findings

No console errors, no uncaught page errors, no unhandled rejections, no failed requests,
no React warnings, and no duplicate or unnecessary requests were observed on any route at
any viewport. No horizontal document scroll anywhere.

`stress.mjs` ran at 390×844, 1024×1366 and 1440×900 and found zero problems across:
24 consecutive route changes with no settle time, four refreshes fired mid-load, repeated
rapid clicking of the same controls, overlays opened and closed in a loop, filter
thrashing, resize and orientation changes, back/forward history navigation, an emptied
dataset, and offline mode. No race conditions, stale state, duplicated actions or stuck
loading indicators surfaced.

## Performance and Security Observations

No security issues surfaced in this pass. It was a UI/responsive QA, not a security
review — and with a `localStorage` mock store and no live backend there is no auth or
transport surface here to assess. A separate security assessment already exists at
`docs/security-audit-2026-09-03.md`.

One performance finding, from the build rather than the runtime: the app ships as a
**single 1.3 MB JavaScript chunk**, and the PWA precaches 1.74 MB across 11 entries.
Nothing in the harness measured slow — no janky interactions, no unnecessary re-renders,
no duplicate requests — so this is first-load cost on a slow connection, not a
responsiveness problem. `pdfjs-dist`, `pdf-lib` and `leaflet` are the obvious
code-splitting candidates; none is needed for the dashboard, which is where every session
starts. Worth doing before production, but it did not affect any test above.

## Known Remaining Issues

None open from this pass. Limitations of the pass itself, which are not the same thing:

1. **Software touch emulation.** `hasTouch` makes `pointer: coarse` resolve correctly and
   dispatches touch events, but it is not a real digitizer. The 44px targets should be
   confirmed by hand on one physical phone and one physical tablet.
2. **The mobile keyboard is not simulated.** Chrome headless does not raise a soft
   keyboard, so "usable with the keyboard open" — which on a real phone shrinks the visual
   viewport by roughly 40% — was reasoned about but not measured. Forms with a sticky
   footer action bar are the place to check.
3. **Real mobile browser chrome is absent.** The dynamic URL bar that makes `100vh`
   unreliable on iOS Safari does not exist in this harness. The app uses `dvh` and
   `env(safe-area-inset-bottom)`, which is the correct approach, but iOS Safari and
   Android Chrome should still get one manual pass.
4. **Mock data only.** State lives in `localStorage`; there is no live backend. Genuine
   network failure modes — timeouts, 500s, CORS, expired sessions — cannot be exercised
   here, so the offline test is the closest available proxy.

## Recommendations

1. **Adopt `desk:` as the standing convention.** Every future density utility that trades
   hit area for compactness should use `desk:`, never bare `lg:`. This was the single
   largest source of bugs in this pass and it will recur the moment someone reaches for
   `lg:min-h-0` out of habit. Now documented in `CLAUDE.md`.
2. **Wrap any third-party widget with its own z-index scale in `isolation: isolate`.**
   Leaflet was the instance found; charting and date-picker libraries do the same thing.
   Isolating at the integration boundary is cheaper than discovering the leak later.
3. **Keep `scripts/qa/` and run it in CI.** `sweep.mjs` plus `verify-fixes.mjs` is about
   five minutes and would catch every regression class found here before review.
4. **Add a `hasTouch: true` wide viewport to any future test matrix.** 1024×1366 with
   touch is where the interesting bugs were; without it the tablet class looks like a
   narrow desktop and the entire BUG-04/BUG-05 family stays invisible.
5. **Manual pass on physical hardware** for the four limitations listed above,
   particularly the soft-keyboard case on forms with sticky action bars.

## Regression Test Result

Final pass, all four suites, after every fix was in place:

| Suite | Scope | Result |
| --- | --- | --- |
| `sweep.mjs` | 11 routes × 10 viewports = 110 page audits | **0 problems** |
| `flows.mjs` | 31 interactive scenarios × 10 viewports = 310 scenario runs | **0 findings** |
| `stress.mjs` | 10 stress categories × 3 viewports | **0 problems** |
| `verify-fixes.mjs` | Per-bug checks × 10 viewports | **0 failing checks** |

The desktop-density counter-check in `verify-fixes.mjs` is the important one for
regression confidence: it asserts that the touch fixes did *not* bloat the desktop UI.
Nav items are 44px on touch and 40px on mouse; the chart toggle is 40px on touch and 24px
on mouse. Both directions hold at every viewport, so the tablet fix did not cost the
desktop layout.

`npm run build` completes successfully. The `desk:` variant, the Leaflet isolation rule
and both `pointer:` media queries were confirmed present in the emitted production CSS —
a custom Tailwind variant that silently fails to compile would make every fix above a
no-op in production, so this is verified rather than assumed.

## Final Status

**Pass.** 10 bugs found, 10 fixed, 0 open. The reported Location overlap is resolved at
its root — the map no longer escapes its stacking context anywhere in the app, which also
fixed the dropdown and modal-action-bar cases the original report did not mention. Clean
across all ten required viewports on layout, interaction, stress, console and network.
Remaining work is physical-device confirmation, not known defects.
