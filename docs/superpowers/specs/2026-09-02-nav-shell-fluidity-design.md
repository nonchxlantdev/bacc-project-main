# Nav shell fluidity — design

Vision Forge Ltd · BACC Operations Management Portal · 2 September 2026

## Why

The sidebar's own collapse/expand already animates
(`transition-[transform,visibility,width] duration-200 ease-out` in
`Sidebar.jsx`), but everything *inside* the nav shell snaps: nav-item hover,
the active-page indicator, and every button in `Sidebar.jsx` and `TopBar.jsx`
change state with no transition at all. Switching pages makes the active
item's teal rail disappear on the old item and reappear on the new one —
there's no motion connecting "where I was" to "where I am." This is the first
piece of a broader fluidity pass; scope here is intentionally the navigation
shell only, at the "subtle & restrained" intensity BACC confirmed given the
tool's regulatory, on-the-apron context.

**Out of scope for this pass**: route/page transitions, checklist forms and
tables, any new dependency. No animation library exists in this codebase
today (see `package.json`) and this pass keeps it that way — everything below
is Tailwind utilities plus one small `useLayoutEffect`.

## Timing — reuses the existing scale, adds nothing new

Tailwind already ships `duration-150`, `duration-200`, and `ease-out`, and
the sidebar's collapse animation already uses `duration-200 ease-out`. This
pass reuses those values rather than inventing tokens:

| Use | Duration | Easing |
| --- | --- | --- |
| Colour/background hover-press feedback | 150ms | ease-out |
| Anything that moves or resizes (the indicator) | 200ms | ease-out — matches the sidebar collapse |

## Changes

### 1. Base hover/press transitions (CSS-only)

Add `transition-colors duration-150 ease-out` to every interactive element in
scope that currently has none:

- `Sidebar.jsx`: each `NavLink`, the theme toggle, the collapse/expand
  toggle, the mobile close (`X`) button, the sign-out button.
- `TopBar.jsx`: the mobile menu button, the Help link, the Notifications
  link, the account `Dropdown.Toggle`.

Plain colour transitions don't need `motion-safe` gating — WCAG's
reduced-motion concern is large movement, not a background fade.

### 2. Sliding active-page indicator

Today each `NavLink` draws its own teal rail via a `before:` pseudo-element
(`before:bg-teal before:shadow-glow-teal` when active). Replace it with one
shared indicator, absolutely positioned inside the (now `relative`) `<nav>`:

- A ref map keyed by route (`to`) tracks each `NavLink`'s DOM node.
- A `useLayoutEffect`, re-run on `location.pathname` and on `collapsed`
  changes, measures the active item's position via `getBoundingClientRect`
  relative to the nav container and sets the indicator's `transform:
  translateY(...)` and `height`.
- The indicator carries the same teal fill and `shadow-glow-teal` the rail
  has today — visually identical at rest; only the transition between pages
  changes.
- `motion-safe:transition-[transform,height] motion-safe:duration-200
  motion-safe:ease-out` gates the movement, so reduced-motion users get
  today's instant behaviour, unchanged.
- Skipped on first mount (no animate-in from the origin) — same convention
  the sidebar collapse already follows.

### 3. Dropdown entrance

`Dropdown.jsx`'s `Menu` hard-mounts today (`if (!open) return null`, no
transition). Apply the `modal-pop` keyframes already defined in `index.css`
and already used by `SignaturePromptModal` — no new keyframes, just the
existing enter-only convention applied here too. Because every dropdown in
the app (including table-row action menus) shares this one component, this
fixes the account menu in scope and every other dropdown as a side effect.
Closing stays an instant unmount, matching how `modal-pop` is used elsewhere.

## Files touched

- `src/components/layout/Sidebar.jsx`
- `src/components/layout/TopBar.jsx`
- `src/components/ui/Dropdown.jsx`
- No changes to `index.css` beyond what's already there — no new keyframes,
  no new tokens.

## Testing

Behavioural and visual, verified live against the dev server in the browser:

1. Click through every nav item — the indicator glides to each one instead
   of teleporting.
2. Collapse and expand the sidebar — the indicator relocates correctly at
   both widths, and the existing width/transform animation is undisturbed.
3. Hover every changed button in both `Sidebar.jsx` and `TopBar.jsx` — the
   colour change eases rather than snaps.
4. Open and close the account dropdown — it now animates in.
5. Simulate `prefers-reduced-motion: reduce` — the indicator and dropdown
   fall back to instant, matching current behaviour exactly; hover colour
   transitions (ungated) still ease, which is expected and WCAG-compliant.
6. Both themes (light/dark), and the mobile drawer.
