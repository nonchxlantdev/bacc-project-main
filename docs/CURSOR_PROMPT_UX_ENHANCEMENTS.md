# Cursor Prompt — Notification/Help dropdowns, offline UX, Locations, Reports & Settings

Paste into Cursor's agent chat with `bacc-project-main` open.

---

You are implementing the design in
`docs/superpowers/specs/2026-09-06-portal-ux-enhancements-design.md`.
**Read that spec in full before writing any code — it governs and outranks
this prompt.** Also skim `CLAUDE.md` first; this codebase has several
hard-won, non-obvious conventions (the `desk:` vs `lg:` distinction,
`isolation: isolate` for any third-party widget with its own z-index scale,
`min`/`max` being advisory on number inputs) that this work must follow, not
rediscover.

## Explicitly out of scope — do not touch

- The Projects module. Dropped, not being revisited.
- `VITE_DATA_SOURCE`, the Supabase adapter (`src/data/repositories/supabase/index.js`),
  RLS, or anything from `docs/security-audit-2026-09-03.md`. That work is
  deliberately deferred to last and tracked separately. Add the new
  repository methods below to the Supabase stub as throwing `'not wired'`,
  matching every existing stub method — nothing more.

## 0. Ground rule carried over from every prior phase

No component may import mock data or a repository implementation directly.
Everything goes through `src/data/repositories/index.js` (picks by
`VITE_DATA_SOURCE`) via the existing hooks pattern (`useNotifications`,
`useIncidents`, `useReports`, `useUsers`, `useSettings`, etc.), same as
Phases 1–3. Any new data need gets a new method added to `types.js` first
(the contract), then the mock, then a throwing stub in `supabase/`.

## 1. Notification dropdown

Replace `TopBar.jsx`'s bell `<Link to="/notifications">` with the existing
`Dropdown` component (`src/components/ui/Dropdown.jsx`) — same one already
used for the account menu two lines below it in that file. Do not build a
new toggle/menu/positioning mechanism.

- New `src/components/notifications/NotificationDropdown.jsx`: `Dropdown.Header`
  ("Notifications" + "Mark all read"), the 5-8 most recent rows from
  `useNotifications(user?.id)` (reuse the row markup from
  `NotificationsPage.jsx` — title/body/timestamp, unread rows tinted, click
  calls `markRead(row.id)` then navigates via `row.href`), empty state "No
  notifications.", footer link "View all notifications" → `/notifications`.
- `/notifications` page and route stay exactly as they are — this is a
  quick-access panel in front of it, not a replacement.
- Bell icon + unread badge visuals unchanged.

## 2. Help dropdown

Same `Dropdown` component, same rationale.

- New `src/components/help/HelpDropdown.jsx`: a small search input filtering
  `FAQ_GROUPS` (`src/content/faq.js`) — match against group name or any
  question/answer text, same logic `HelpPage.jsx` already has — but render
  **matching group names as links only**, never individual answers inline.
  When the search is empty, list all group names.
- Each link navigates to `/help#<group-id>`. `HelpPage.jsx` already expands
  the matching group from `useLocation().hash` — no change needed there.
- Footer link "View all Help" → `/help`. Page and route unchanged.

## 3. Offline UX

`AppShell.jsx` already tracks `online` via `navigator.onLine` +
`window.addEventListener('online'/'offline')`; `src/utils/offlineQueue.js`
already queues writes and flushes via `startOnlineFlush`. Build on top of
that — do not replace the queue/flush mechanism.

- New `src/context/ToastContext.jsx` + `src/components/ui/Toast.jsx`: a
  small stack, bottom-center, `env(safe-area-inset-bottom)`-aware,
  `role="status"` / `aria-live="polite"`, auto-dismiss ~5s unless the toast
  carries an action button. Wrap the app tree in `ToastProvider` (in
  `AppShell.jsx` or above it in `App.jsx` — your call, keep it high enough
  that any page can call `useToast()`).
- In `AppShell.jsx`'s existing `online`/`offline` effect: debounce with a
  ~3s `setTimeout` before treating a transition to offline as real (avoids
  firing on a momentary blip). On the debounced offline transition:
  - Toast: "You're offline — your changes are being saved and will sync
    automatically."
  - New `src/components/offline/OfflineModal.jsx`, same visual convention as
    `SignaturePromptModal.jsx` (`bg-black/55` scrim, `modal-pop` animation —
    reuse those existing classes/keyframes, don't invent new ones). Lists
    what still works offline (fill/submit checklists, capture signatures,
    raise/update incidents and work orders — all queue locally) vs. what
    needs a connection (Reports CSV/PDF export, anything needing a fresh
    server read). Dismiss button: "Got it." Show once per offline episode —
    track with a ref that resets the moment `online` goes back to `true`, so
    a later, separate offline period shows it again.
- On the `online` event: toast "Back online, syncing…", then once
  `flushQueue` resolves, update it to "All caught up" (0 failures) or "`N`
  items failed to sync — tap to retry" (tapping re-runs `startOnlineFlush`'s
  handler against the same failed jobs — `flushQueue` already leaves failed
  jobs in the queue with a bumped attempt count, so a retry is just calling
  it again).

## 4. Locations → incident location overview

Extend `LocationsPage.jsx` — don't replace the existing base map/marker
setup, add to it:

- Pull incidents via `useIncidents()` (same hook `IncidentListPage.jsx`
  uses). For each incident with a captured `location.lat`/`location.lng`,
  add an `L.circleMarker` colored via `INCIDENT_STATUS_COLORS` (the same map
  `reports.incidentsByStatus()` uses in `mock/index.js` — import/reuse it,
  do not redefine a second color set), popup with incident ref + short
  description, `bindPopup` click or a marker click handler navigating to
  `/incidents/:id`.
- Incidents without a location are silently skipped — not an error state.
- Remove the sentence *"Incident pin capture (BACC §7) ships with slice
  phase 2."* Add a short color legend only if it turns out necessary once
  real pins are on the map — use judgment, this isn't a hard requirement.

## 5. Reports additions

Add three entries to `ReportsPage.jsx`'s `SECTIONS` array plus matching
render blocks, same section-picker/CSV/PDF pattern the existing three
sections use.

**Important — check `src/data/repositories/mock/index.js` before writing any
new report method.** Several of these are already implemented there and
simply never called from `ReportsPage.jsx`:

- **Deficiency/incident section** — call the *already-existing*
  `openDeficienciesByLevel()`, `deficiencyAgeing()`, `nocRegisterStatus()`,
  and `reinspectionRate()`. No new repository method needed. Use the
  categorical palette from `src/config/deficiencyLevels.js` for level charts
  (already CVD-validated — do not touch it).
- **Work order / SLA section** — the NOC-level SLA half calls the
  *already-existing* `slaAdherence()`. The work-order-specific half needs
  one **new** method: `reports.workOrderTurnaround()` — mean/median days
  from `date_issued` to verification, bucketed by department. Add it to
  `types.js` (`REPORT_METHODS` and `REPORT_AGGREGATIONS`, following the
  existing entries' shape), then implement in the mock reading
  `s.work_orders`, then add the throwing stub in `supabase/`.
- **Per-annex/per-form completion section** — **new** method
  `reports.templateCompletion()`: same output shape as the existing
  `teamCompliance()` but grouped by `template_id`/code instead of `group`
  (team) — one row per registered template from `src/data/templates/registry.js`,
  columns scheduled/completed/onTime/late/outstanding. Add to `types.js`,
  mock, and the Supabase stub the same way.

Follow the rules already written down in `docs/CURSOR_PROMPT_PHASE3.md` §5
for every chart here too: stat tiles where the number is the point, never a
dual-axis chart, status colors reserved for SLA/overdue state and always
paired with a label, a table view alongside every chart, legend for ≥2
series. CSV via the existing `downloadCsv`/`rowsToCsv` helpers
(`src/lib/csv.js`), PDF via the existing `/api/export-report-pdf` pattern —
that endpoint is a house-style document generator, **not** the overlay
pipeline; do not touch anything under `scripts/verify-placement.mjs` or the
field-map pipeline for this work.

## 6. Settings additions

Add three entries to `SettingsPage.jsx`'s `SECTIONS` array, following the
existing `{ id, label, blurb, Icon, store, admin? }` shape.

- **Appearance** (everyone, no `admin` flag) — **the dark/light theme toggle
  already exists and works fine in `Sidebar.jsx` (Moon/Sun button). Leave it
  there — do not duplicate or move it.** This section is only the two
  genuinely new preferences: default landing page (`Select` of top-level nav
  routes from `Sidebar.jsx` — Dashboard, My Checklists, Incidents,
  Approvals, Reports — which route `/` redirects to) and a 12h/24h
  time-format preference consumed by `src/lib/airportFormat.js`'s display
  helpers. Both are per-device, stored in `localStorage` the same way
  `ThemeContext.jsx` stores theme — **not** part of `SettingsContext`'s
  synced sections, since they're personal display prefs, not airport-wide
  configuration (same reasoning `ThemeContext.jsx`'s own comment gives for
  why theme lives outside `SettingsContext`).
- **Users & roles** (`admin: true`) — new `src/components/settings/UsersRolesSection.jsx`.
  Full CRUD on top of the existing read-only `/users` page, which stays
  exactly as it is (do not remove or change `UsersPage.jsx`). Add user, edit
  name/position/department/role, toggle `is_approver`, and a
  **deactivate** action that is a soft flag only (`is_active: false` —
  blocks sign-in, hides from pickers) and must never hard-delete a user
  record, since submissions/sign-offs/approvals already attributed to that
  person must stay intact and attributable. Needs new `users.persist()`
  (create/update) and `users.setActive(id, isActive)` in `types.js`, the
  mock, and the Supabase stub.
- **Approvers & signing authority** (`admin: true`) — new section, same
  pattern as the existing `Lookups`/`Alerts` sections (`store: 'approvers'`
  in `settingsAudit`/`useSettings()`'s existing section-store convention —
  read how `deficiency`/`alerts`/`lookups` wire `saveSection`/`resetSection`
  and copy that shape exactly). Configures a department/annex → approver
  role mapping (who can sign as OM, COO, CEC per department).

## 7. Acceptance checklist

- [ ] Notification and Help dropdowns open/close correctly on mobile
      (inside the nav drawer context) and desktop, keyboard-navigable,
      unread badge still accurate, "View all" links work, deep-linked FAQ
      group opens expanded on the full Help page
- [ ] `/notifications` and `/help` pages/routes unchanged and still directly
      reachable
- [ ] Offline toast + modal fire once after ~3s offline, not on a
      sub-3s blip; modal reappears on a second, separate offline episode;
      reconnect toast shows correct outcome for both 0-failure and
      ≥1-failure flush results; existing `flushQueue`/queue behavior
      unaffected
- [ ] Locations page plots every incident with a captured location, colored
      by the existing status palette, clickable through to the incident;
      renders correctly with zero incidents too
- [ ] All three new Reports sections render against the existing 6-month
      seed data, with a table view, CSV export, and PDF export each;
      `openDeficienciesByLevel`/`deficiencyAgeing`/`nocRegisterStatus`/`reinspectionRate`/`slaAdherence`
      reused, not reimplemented; `workOrderTurnaround` and
      `templateCompletion` added correctly to `types.js` + mock + stub
- [ ] Settings shows Appearance (default landing page + time format only —
      no theme control), Users & roles (admin-only, full CRUD, deactivate is
      soft), and Approvers & signing authority (admin-only) as new sections;
      sidebar theme toggle untouched
- [ ] No component imports mock data or a repository implementation
      directly — everything through the existing hooks/repository pattern
- [ ] `desk:` (not bare `lg:`) used on any new density-sensitive utility;
      any new third-party widget gets `isolation: isolate`; every new
      tappable control meets the 44px minimum
- [ ] `npm run build` succeeds; if you touch `index.css`, confirm the
      relevant custom variant survives in the emitted CSS per `CLAUDE.md`'s
      instructions

## 8. Flag back, do not decide alone

- Whether "Approvers & signing authority" needs enforcement anywhere beyond
  Settings config right now (e.g. gating who can act on an approval) — the
  spec treats this round as configuration only, not new enforcement logic
- Exact wording/content of the offline modal's "what still works" list —
  ship a reasonable first draft, flag it as copy that should get a
  once-over
- Whether `templateCompletion()`'s per-form table should default to
  collapsed/grouped by family (PMM vs. VAES) given there will be 30+ rows
