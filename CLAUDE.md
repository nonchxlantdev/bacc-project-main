# Working notes for AI agents

Conventions in this repo that are load-bearing and not obvious from reading a single
file. Read this before making responsive or layout changes.

## Stack

React 19 + Vite 7, Tailwind CSS v4 (via `@tailwindcss/vite`, configured in
`src/index.css` — there is no `tailwind.config.js`), `react-router-dom` 7, Leaflet for
maps, `vite-plugin-pwa`. State is React context (`AuthContext`, `SettingsContext`,
`ThemeContext`) over a `localStorage`-backed mock store in `mock/store.js`; there is no
live backend in this build.

## Responsive density: use `desk:`, not `lg:`

Defined in `src/index.css`:

```css
@custom-variant desk (@media (width >= 64rem) and (pointer: fine));
```

**Any utility that shrinks a control below the 44px touch minimum must use `desk:`.**
Use plain `lg:` only for layout that genuinely depends on width — column counts, sidebar
visibility, whether a panel is inline or a drawer.

The reason: `lg:` means "≥1024px wide," which the codebase had been treating as a proxy
for "this is a mouse." It is not. A 1024×1366 iPad Pro in portrait is an `lg` viewport
operated entirely by a fingertip, so every `lg:min-h-0` on it shrank a control to
20–28px. `desk:` expresses the actual condition — wide screen **and** precise pointer.

This was the single largest bug source in the 2026-09-05 QA pass (~63 utility instances
across 20 files). It will recur the moment someone reaches for `lg:min-h-0` by habit.

The corollary lives in the same file: the `.table-stack` rule that restacks record tables
into label/value cards is written as the exact inverse —
`@media not all and (min-width: 64rem) and (pointer: fine)` — so tables stay stacked
unless the screen is wide *and* the pointer is precise. The legacy `not all and` form is
deliberate: a parser that does not understand the query degrades to "always stacked"
rather than "never stacked."

## Third-party widgets with their own z-index scale must be isolated

Leaflet has an internal z-index scale (panes 200–700, controls 800, corner control
holders 1000) but never makes `.leaflet-container` a stacking context, so those values
escape into the root context and out-rank the nav drawer (z-40), modal scrims (z-30) and
every dropdown. `src/index.css` fixes this at the source:

```css
.leaflet-container { isolation: isolate; }
```

Inside that context, app-owned map overlays use ordinary small z-indexes (`z-10`), not the
inflated `z-[400]` values they previously needed to compete. Wrappers around a map carry
`isolate` too.

**Apply the same treatment to any future library that ships its own z-index scale.**
Isolating at the integration boundary is much cheaper than discovering the leak from a
bug report about something painting over the navigation.

## Touch targets

44px is the minimum for anything tappable. Two non-obvious cases:

- **Third-party controls** may be smaller and need overriding at matching specificity —
  Leaflet's zoom buttons are hard-coded 30px even in its own "touch" mode, so the override
  is `.leaflet-touch .leaflet-bar a`, not just `.leaflet-bar a`.
- **When a control's visual size is semantically meaningful**, grow the hit area rather
  than the element. The draggable incident pin uses an invisible `::after` with negative
  insets: the grab region reaches 44px while the marker keeps its exact size and anchor,
  so the pin still sits on the coordinate it reports.

## Form inputs: `min`/`max` are advisory

`min` and `max` on `<input type="number">` mark a field invalid but still hand you the
value. Clamp in the change handler if downstream code assumes a range —
`NumberInput` in `src/components/settings/settingsUi.jsx` crashed the whole Lookups
section this way. In settings, empty must stay `null` rather than coercing to `0`:
"not set" and "zero" mean different things, and a field that coerces turns "no rule
configured" into "due immediately."

## QA harness

`scripts/qa/` drives the locally installed Chrome via `playwright-core` (which ships no
browser binaries). It signs into the demo portal and runs geometry-based audits —
bounding boxes, computed styles, `elementFromPoint` hit tests, stacking-context walks —
rather than inferring from CSS.

| Script | Purpose |
| --- | --- |
| `harness.mjs` | Launch, sign-in, viewport matrix, shared layout + touch audits |
| `sweep.mjs` | Every route × every viewport, default state |
| `flows.mjs` | Interactive: menus, tabs, modals, selects, filters, validation |
| `stress.mjs` | Rapid nav, mid-load refresh, click hammering, resize, offline |
| `verify-fixes.mjs` | Targeted per-bug regression checks |

Run against a dev server on `localhost:5174`, or set `QA_BASE_URL`.

Two things to preserve when extending it:

- **Keep a wide viewport with `hasTouch: true`** (1024×1366) in the matrix. Without it the
  tablet class behaves like a narrow desktop and the entire `desk:` family of bugs is
  invisible.
- **The audits are scrim-aware.** A control behind an open modal or drawer is *supposed*
  to be covered; the audits find the topmost full-viewport fixed layer and only grade
  what is on top of it. Removing that check floods the output with false positives.

Findings from the last full pass are in `QA_REPORT.md`.

## Verify custom Tailwind variants reach the build

A `@custom-variant` that fails to compile is silent — the utilities just vanish, and every
fix depending on them becomes a no-op in production while looking correct in the source.
After changing one, confirm it in the emitted CSS:

```powershell
npm run build
Select-String -Path dist/assets/*.css -Pattern 'pointer:\s*(fine|coarse)'
```
