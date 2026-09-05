# Nav Shell Fluidity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the navigation shell (`Sidebar.jsx`, `TopBar.jsx`, the shared `Dropdown.jsx`) the same restrained motion its own collapse animation already has, so hover/press feedback eases instead of snapping and the active-page indicator glides between nav items instead of teleporting.

**Architecture:** Pure CSS transitions (`transition-colors duration-150 ease-out`) on every currently-instant interactive element, plus one small React piece: a single shared active-page indicator in `Sidebar.jsx`, positioned via `useLayoutEffect` + `getBoundingClientRect`-free `offsetTop`/`offsetHeight` measurement of whichever `NavLink` is active, replacing the per-item `before:` pseudo-element rail. `Dropdown.jsx`'s menu gains the entrance keyframes already used by `SignaturePromptModal`. No state moves between files; the indicator's positioning logic lives entirely inside `Sidebar.jsx`.

**Tech Stack:** React 19, React Router 7, Tailwind 4 (utility classes + the `modal-pop` keyframes already in `src/index.css`). No new dependency.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-09-02-nav-shell-fluidity-design.md`. Read it before Task 1.
- **No new dependencies.** No animation library — Tailwind utilities plus one `useLayoutEffect`, matching what the spec commits to.
- **No changes to `src/index.css`.** The `modal-pop` keyframes Task 4 uses already exist there.
- **Reuse the existing timing scale, don't invent one.** `duration-150 ease-out` for colour/background feedback, `duration-200 ease-out` for anything that moves or resizes (matches `Sidebar.jsx`'s own collapse animation), `motion-safe:animate-[modal-pop_240ms_cubic-bezier(0.16,1,0.3,1)]` for dropdown entrance (the exact values `SignaturePromptModal.jsx` already uses — do not shorten or re-ease them).
- **Reduced motion:** any transition on `transform`/`height`/`animate` must be `motion-safe:`-gated so `prefers-reduced-motion: reduce` gets today's instant behaviour unchanged. Plain colour transitions do not need gating.
- **Out of scope:** route/page transitions, checklist forms and tables, anything outside `Sidebar.jsx` / `TopBar.jsx` / `Dropdown.jsx`.
- **Environment note for whoever executes this:** this project lives on the user's own machine, reached only through the remote-devices file bridge — there is no shell access to it (no `device_bash`) and no local git repo checked out anywhere reachable. Every "Modify" step in this plan is applied by staging the file fresh (to get its current content and mtime), editing the staged copy, then delivering it back with `SendUserFile` + `device_commit_files` using an `expectedMtimeMs` guard. There is no `git commit` step to run — treat "commit" in this plan as "deliver the file back to the user's machine," not a literal git command. Verification is manual/visual (open the app in a browser against the user's own dev server) — this codebase's only automated test runner (`node --test`, e.g. `tests/roleStaffing.test.js`) covers pure-logic modules and does not apply to CSS/visual changes like these.

---

### Task 1: `Sidebar.jsx` — base hover/press transitions

The sidebar's own collapse animation already eases; every button inside it still snaps. This task only adds `transition-colors duration-150 ease-out` to four buttons — no structural change, no new state.

**Files:**
- Modify: `src/components/layout/Sidebar.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks (Task 2 touches the same file but a different part of it — the nav items, not these four buttons).

- [ ] **Step 1: Stage the current file**

Use `device_list_dir` on the `src/components/layout` folder to get the file's current `mtimeMs`, then `device_stage_files` that path to pull a fresh copy before editing (the local mirror is incremental — always re-stage before editing a file you haven't touched yet this session).

- [ ] **Step 2: Add the transition class to the collapsed-rail "Expand navigation" button**

Find:

```jsx
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
```

Replace with:

```jsx
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors duration-150 ease-out hover:bg-white/10 hover:text-white"
```

- [ ] **Step 3: Add the transition class to the "Collapse navigation" button**

Find:

```jsx
              className="hidden h-10 w-10 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white md:flex"
```

Replace with:

```jsx
              className="hidden h-10 w-10 items-center justify-center rounded-md text-white/70 transition-colors duration-150 ease-out hover:bg-white/10 hover:text-white md:flex"
```

- [ ] **Step 4: Add the transition class to the mobile "Close navigation" button**

Find:

```jsx
              className="-mr-1 -mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white md:hidden"
```

Replace with:

```jsx
              className="-mr-1 -mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors duration-150 ease-out hover:bg-white/10 hover:text-white md:hidden"
```

- [ ] **Step 5: Add the transition class to the theme toggle button**

Find:

```jsx
            className={`flex min-h-11 w-full items-center gap-3 rounded-md py-2 text-sm text-white/75 hover:bg-white/5 hover:text-white lg:min-h-10 lg:text-[13px] ${
              collapsed ? 'justify-center px-0' : 'pl-4 pr-3'
            }`}
```

Replace with:

```jsx
            className={`flex min-h-11 w-full items-center gap-3 rounded-md py-2 text-sm text-white/75 transition-colors duration-150 ease-out hover:bg-white/5 hover:text-white lg:min-h-10 lg:text-[13px] ${
              collapsed ? 'justify-center px-0' : 'pl-4 pr-3'
            }`}
```

- [ ] **Step 6: Add the transition class to the sign-out button**

Find:

```jsx
          className={`flex min-h-11 w-full items-center gap-3 rounded-md py-2 text-sm text-white/75 hover:bg-white/5 hover:text-white lg:min-h-10 lg:text-[13px] ${
            collapsed ? 'justify-center px-0' : 'px-3'
          }`}
```

Replace with:

```jsx
          className={`flex min-h-11 w-full items-center gap-3 rounded-md py-2 text-sm text-white/75 transition-colors duration-150 ease-out hover:bg-white/5 hover:text-white lg:min-h-10 lg:text-[13px] ${
            collapsed ? 'justify-center px-0' : 'px-3'
          }`}
```

- [ ] **Step 7: Verify**

Open the app in a browser against the user's dev server (`npm run dev`, `localhost:5173` by default). Hover each of the four buttons (expand/collapse rail toggle, mobile close, theme toggle, sign out) in both collapsed and expanded sidebar states — the background/text colour should ease in over ~150ms rather than snap. No layout shift, no change to what the buttons do.

- [ ] **Step 8: Deliver**

`SendUserFile` the edited file, then `device_commit_files` with the `expectedMtimeMs` captured in Step 1. Confirm the result has zero `rejected` entries.

---

### Task 2: `Sidebar.jsx` — sliding active-page indicator

Builds on Task 1's file state. Replaces the per-item `before:` pseudo-element rail with one shared indicator that measures and moves to the active item.

**Files:**
- Modify: `src/components/layout/Sidebar.jsx`

**Interfaces:**
- Consumes: nothing from another file.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Stage the current file**

Same as Task 1 Step 1 — re-stage fresh (it changed since Task 1's edit).

- [ ] **Step 2: Update the React import**

Find:

```jsx
import { useEffect, useRef } from 'react';
```

Replace with:

```jsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
```

- [ ] **Step 3: Add the indicator's refs, state, and measurement effect**

Find:

```jsx
  const location = useLocation();
  const panelRef = useRef(null);
```

Replace with:

```jsx
  const location = useLocation();
  const panelRef = useRef(null);

  // Tracks each nav item's DOM node (keyed by route) so the shared
  // active-page indicator below can measure where to sit.
  const itemRefs = useRef(new Map());
  // Position of the active-page indicator, in the <nav>'s own coordinate
  // space (see `relative` on <nav> below). `animate: false` on the very
  // first measurement means "snap into place, don't slide in from
  // nowhere" — matching how the sidebar's own collapse never animates on
  // first paint either.
  const [indicator, setIndicator] = useState(null);
  const hasPositionedRef = useRef(false);

  const activeTo = NAV_GROUPS.flatMap((group) => group.items).find((item) =>
    isNavActive(item.to, location.pathname),
  )?.to;

  // Re-measure whenever the active route changes or `collapsed` toggles
  // (collapsing hides each group's label row, which shifts every item
  // below it). The resize listener covers the one case neither of those
  // catches: the `lg` breakpoint shrinking each item from 44px to 40px
  // tall with no route or collapse change.
  useLayoutEffect(() => {
    function measure() {
      const activeEl = activeTo ? itemRefs.current.get(activeTo) : null;
      if (!activeEl) {
        setIndicator(null);
        return;
      }
      setIndicator({
        top: activeEl.offsetTop + 6,
        height: activeEl.offsetHeight - 12,
        animate: hasPositionedRef.current,
      });
      hasPositionedRef.current = true;
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeTo, collapsed]);
```

- [ ] **Step 4: Make `<nav>` a positioning context and add the indicator element**

Find:

```jsx
      <nav className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
        {NAV_GROUPS.map((group, groupIndex) => (
```

Replace with:

```jsx
      <nav className="relative flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
        {/* Active-page indicator — a single glowing rail (the same
            PAPI-light beacon language used for status dots elsewhere)
            that slides to whichever item is active, instead of each item
            drawing its own. Reduced-motion users get it snapping straight
            to place: the transition is motion-safe-gated, and the very
            first measurement never animates in from (0, 0). */}
        {indicator && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 w-[3px] rounded-full bg-teal shadow-glow-teal motion-safe:transition-[transform,height] motion-safe:duration-200 motion-safe:ease-out"
            style={{
              height: indicator.height,
              transform: `translateY(${indicator.top}px)`,
              transitionDuration: indicator.animate ? undefined : '0ms',
            }}
          />
        )}
        {NAV_GROUPS.map((group, groupIndex) => (
```

- [ ] **Step 5: Simplify each nav item — drop the per-item rail, add the ref and colour transition**

Find:

```jsx
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={({ isActive }) => {
                    const active = isNavActive(item.to, isActive, location.pathname);
                    // The active marker is a glowing rail, not a fill — the
                    // same PAPI-light language used for status beacons
                    // elsewhere, so "where am I" reads the same way as
                    // "is this okay" does.
                    return `relative flex min-h-11 items-center gap-3 rounded-md py-2 text-sm before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-[3px] before:rounded-full before:content-[''] lg:min-h-10 lg:text-[13px] ${
                      collapsed ? 'justify-center px-0' : 'pl-4 pr-3'
                    } ${
                      active
                        ? 'bg-teal/10 font-semibold text-white before:bg-teal before:shadow-glow-teal'
                        : 'text-white/75 before:bg-transparent hover:bg-white/5 hover:text-white'
                    }`;
                  }}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                </NavLink>
              ))}
```

Replace with:

```jsx
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  ref={(el) => {
                    if (el) itemRefs.current.set(item.to, el);
                    else itemRefs.current.delete(item.to);
                  }}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={() => {
                    const active = isNavActive(item.to, location.pathname);
                    return `flex min-h-11 items-center gap-3 rounded-md py-2 text-sm transition-colors duration-150 ease-out lg:min-h-10 lg:text-[13px] ${
                      collapsed ? 'justify-center px-0' : 'pl-4 pr-3'
                    } ${
                      active
                        ? 'bg-teal/10 font-semibold text-white'
                        : 'text-white/75 hover:bg-white/5 hover:text-white'
                    }`;
                  }}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                </NavLink>
              ))}
```

- [ ] **Step 6: Update `isNavActive` to compute the match itself**

It no longer receives React Router's `isActive` render-prop argument (the `activeTo` calculation in Step 3 needs to call it outside a `NavLink` render prop, so it has to be self-contained). The replicated default-match rule (`pathname === to || pathname.startsWith(`${to}/`)`) is exactly what `NavLink`'s own non-`end` matching does for this app's flat, non-dynamic nav targets.

Find:

```jsx
function isNavActive(to, isActive, pathname) {
  if (to === '/checklists/mine') {
    return pathname.startsWith('/checklists/') && !pathname.startsWith('/checklists/all');
  }
  return isActive;
}
```

Replace with:

```jsx
function isNavActive(to, pathname) {
  if (to === '/checklists/mine') {
    return pathname.startsWith('/checklists/') && !pathname.startsWith('/checklists/all');
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}
```

- [ ] **Step 7: Verify**

Against the running dev server:
1. Click through every nav item in both nav groups — the teal indicator glides to each one; it does not disappear-and-reappear.
2. Visit a checklist detail page directly (e.g. navigate to `/checklists/<some-id>`) — "My Checklists" stays highlighted, matching the pre-existing special case.
3. Visit an incident detail page (`/incidents/<some-id>`) — "Incidents" stays highlighted.
4. Collapse and expand the sidebar — the indicator relocates correctly at both widths with no visible jump or misalignment.
5. Resize the browser window across the `lg` breakpoint while a page is open — the indicator's height stays aligned with the item (no gap or overlap).
6. Simulate `prefers-reduced-motion: reduce` (browser devtools → rendering → emulate CSS media) and repeat step 1 — the indicator should jump instantly with no glide.
7. Both light and dark theme; both desktop layout and the mobile drawer.

- [ ] **Step 8: Deliver**

`SendUserFile` the edited file, then `device_commit_files` with a freshly re-checked `expectedMtimeMs` (re-run `device_list_dir` immediately before committing, since Task 1's delivery already changed this file's mtime once).

---

### Task 3: `TopBar.jsx` — base hover/press transitions

Same treatment as Task 1, applied to the top bar's four interactive elements.

**Files:**
- Modify: `src/components/layout/TopBar.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Stage the current file**

`device_list_dir` + `device_stage_files` on `src/components/layout/TopBar.jsx`.

- [ ] **Step 2: Add the transition class to the mobile menu button**

Find:

```jsx
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink md:hidden"
```

Replace with:

```jsx
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-ink md:hidden"
```

- [ ] **Step 3: Add the transition class to the Help link**

Find:

```jsx
          className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
          aria-label="Help"
```

Replace with:

```jsx
          className="flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-ink"
          aria-label="Help"
```

- [ ] **Step 4: Add the transition class to the Notifications link**

Find:

```jsx
          className="relative flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
```

Replace with:

```jsx
          className="relative flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-ink"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
```

- [ ] **Step 5: Add the transition class to the account menu toggle**

Find:

```jsx
          <Dropdown.Toggle className="flex min-h-11 items-center gap-3 rounded-md px-1 py-1 hover:bg-surface-2 sm:px-2">
```

Replace with:

```jsx
          <Dropdown.Toggle className="flex min-h-11 items-center gap-3 rounded-md px-1 py-1 transition-colors duration-150 ease-out hover:bg-surface-2 sm:px-2">
```

- [ ] **Step 6: Verify**

Against the running dev server: hover the mobile menu button (narrow the viewport below `md` to see it), the Help icon, the Notifications bell, and the account avatar/name — each should ease in over ~150ms. No change to click behaviour, badge count, or dropdown contents.

- [ ] **Step 7: Deliver**

`SendUserFile` + `device_commit_files` with the `expectedMtimeMs` from Step 1.

---

### Task 4: `Dropdown.jsx` — entrance animation for the menu

`Dropdown.Menu` hard-mounts today (`if (!open) return null`, no transition). This reuses the exact `modal-pop` keyframes and timing `SignaturePromptModal.jsx` already uses, so every dropdown in the app — including the account menu in scope and every `Dropdown.ToggleIcon` table-row action menu elsewhere — gets the same entrance for free.

**Files:**
- Modify: `src/components/ui/Dropdown.jsx`

**Interfaces:**
- Consumes: the `modal-pop` `@keyframes` already defined in `src/index.css` (unchanged by this plan).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Stage the current file**

`device_list_dir` + `device_stage_files` on `src/components/ui/Dropdown.jsx`.

- [ ] **Step 2: Add the entrance animation to the menu's base classes**

Find:

```jsx
  const base =
    'absolute z-30 overflow-hidden rounded-md border border-line/15 bg-surface text-ink shadow-lg';
```

Replace with:

```jsx
  const base =
    'absolute z-30 overflow-hidden rounded-md border border-line/15 bg-surface text-ink shadow-lg motion-safe:animate-[modal-pop_240ms_cubic-bezier(0.16,1,0.3,1)]';
```

- [ ] **Step 3: Verify**

Against the running dev server: open the account menu in `TopBar.jsx` (top-right avatar) — it should pop in with the same entrance feel as the signature prompt modal (subtle scale + rise), not a hard cut. Open and close it a few times — closing stays an instant unmount (unchanged). Check at least one other `Dropdown` consumer if one is easy to reach in the running app (e.g. a table row's kebab menu on a list page) to confirm the shared-component fix applies there too. Simulate `prefers-reduced-motion: reduce` — the menu should appear instantly with no animation.

- [ ] **Step 4: Deliver**

`SendUserFile` + `device_commit_files` with the `expectedMtimeMs` from Step 1.

---

## Self-Review

**Spec coverage:** Design doc's §1 (base hover/press transitions) → Tasks 1 and 3. §2 (sliding active-page indicator) → Task 2. §3 (Dropdown entrance) → Task 4. §"Files touched" (`Sidebar.jsx`, `TopBar.jsx`, `Dropdown.jsx`, no `index.css` changes) → matches exactly. No spec section without a task.

**Placeholder scan:** No TBD/TODO; every step shows the literal before/after code.

**Type consistency:** `isNavActive(to, pathname)` — Task 2 Step 6 changes its signature (drops the `isActive` param) and Step 3/5 are the only two call sites, both updated to the new two-argument form in the same task. `indicator` shape (`{ top, height, animate }`) is set once (Step 3) and read once (Step 4) within the same task/file — no drift risk.
