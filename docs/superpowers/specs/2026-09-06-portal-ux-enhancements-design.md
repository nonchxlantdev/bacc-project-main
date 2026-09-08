# Notification/Help dropdowns, offline UX, Locations, Reports & Settings additions — design

Vision Forge Ltd · BACC Operations Management Portal · 6 September 2026

## Why

Phase II (checklist engine, 31+ templates, incidents, geo-location) and Phase
III (approvals, reports, notifications) are functionally built per
`docs/superpowers/specs/2026-08-14-approvals-reports-notifications-phase3-design.md`.
This is the next round on top of that, driven directly by user feedback
rather than the original phase scope:

- Notifications and Help currently force a full page navigation for what
  should be a quick glance.
- `LocationsPage.jsx` still carries a stale note — *"Incident pin capture
  (BACC §7) ships with slice phase 2"* — for a capability (the map picker in
  the Create Incident modal) that already shipped.
- Reports and Settings each already have a working section-based UI; this
  adds to that pattern rather than replacing it.
- There is no user-facing signal today beyond a small dot + "Online/Offline"
  text when the app goes offline, even though a full local queue + sync
  system already exists underneath it.

**Explicitly out of scope for this pass**: the Projects module (dropped, not
being revisited) and the Supabase/production-data cutover (deferred until
last, tracked separately against the 2026-09-03 security audit). Nothing
here touches `VITE_DATA_SOURCE`, RLS, or any API function.

## 1. Notification dropdown

`TopBar.jsx`'s bell is a `<Link to="/notifications">`. Replace it with the
existing `Dropdown` component (`src/components/ui/Dropdown.jsx`) already used
for the account menu — same toggle/menu/positioning/keyboard handling, so
this doesn't introduce a second interaction pattern or a fresh source of the
z-index/touch-target bugs already documented in `CLAUDE.md`.

- `Dropdown.Toggle` wraps the existing bell button (icon + unread badge,
  unchanged).
- `Dropdown.Menu` (`w-80`-ish, right-aligned like the account menu) contains:
  - `Dropdown.Header`: "Notifications" + "Mark all read" action.
  - The 5-8 most recent rows from `useNotifications(user?.id)` — same
    row markup `NotificationsPage.jsx` uses today (title/body/timestamp,
    unread rows tinted), clicking a row calls `markRead(row.id)` and
    navigates via `row.href`.
  - Empty state: "No notifications."
  - Footer: "View all notifications" → `/notifications`, which stays as a
    route, unchanged, for full history.
- `/notifications` page itself is untouched.

## 2. Help dropdown

Same component, same rationale. `HelpPage.jsx`'s content (a searchable FAQ
accordion, `FAQ_GROUPS`) is too much for a dropdown, so this is a
quick-access menu, not a replacement:

- `Dropdown.Menu` contains a small search input (reuses `FAQ_GROUPS`
  client-side filtering already in `HelpPage.jsx` — matches against group
  name *or* any question/answer text within it, same as the full page) and,
  when empty or matched, always renders a list of **group names** as links
  (never individual answers inline — that's what keeps this a quick-access
  panel rather than a second copy of the FAQ page).
- Each link navigates to `/help#<group-id>` — `HelpPage.jsx` already opens
  the matching group via its `useLocation().hash` / `target` logic, so no
  change needed there.
- Footer: "View all Help" → `/help`.
- `/help` page itself is untouched.

## 3. Offline UX

`AppShell.jsx` already tracks `online` via `navigator.onLine` +
`window.addEventListener('online'/'offline', ...)`, and
`src/utils/offlineQueue.js` already queues checklist/incident/work-order/photo
writes in IndexedDB and flushes them via `startOnlineFlush` on reconnect.
Today the only visible signal is the small dot + text in `TopBar.jsx`. This
adds a toast system (new, no dependency — the project has none, and
`CLAUDE.md`'s touch-target/`desk:`/z-index-isolation conventions would need
re-applying on top of any off-the-shelf toast library anyway, so a small
custom one is less total work and stays consistent) plus one modal.

**New `ToastProvider`** (`src/context/ToastContext.jsx` + `src/components/ui/Toast.jsx`):
a small stack anchored bottom-center, respecting
`env(safe-area-inset-bottom)`, `role="status"`/`aria-live="polite"`,
auto-dismiss after ~5s unless it carries an action.

**Going offline** (debounced): a `setTimeout` in `AppShell.jsx`'s existing
`online`/`offline` effect fires only if still offline after ~3 seconds
(avoids nagging on a momentary blip) —
- Toast: "You're offline — your changes are being saved and will sync
  automatically."
- Modal (`OfflineModal.jsx`, same scrim/animation convention as
  `SignaturePromptModal.jsx` — `bg-black/55`, `modal-pop`), shown once per
  offline episode (a `shownThisEpisode` ref reset when back online):
  listing what still works (fill and submit checklists, capture signatures,
  raise/update incidents and work orders — all queue locally) versus what
  needs a connection (Reports CSV/PDF export, anything requiring a fresh
  server read). Dismiss: "Got it."

**Reconnecting**: on the `online` event, a toast — "Back online, syncing…"
— then, once `flushQueue` resolves: "All caught up" on success, or "`N`
items failed to sync — tap to retry" on partial failure (tapping re-invokes
the same flush handlers already wired via `queueHandlers`).

## 4. Locations → incident location overview

`LocationsPage.jsx` today draws one static Leaflet marker for PGIA. This adds
a marker per incident that has a captured location, sourced from
`useIncidents()` (already used by `IncidentListPage`/`IncidentDetailPage`):

- Keep the base PGIA marker/view as the map center.
- One `L.circleMarker` per incident with `location.lat`/`lng` set, colored by
  `INCIDENT_STATUS_COLORS` (the same status-color map `incidentsByStatus()`
  already uses in `mock/index.js` — no new palette invented), popup showing
  incident ref + short description, click navigates to `/incidents/:id`.
- Incidents without a captured location are simply not plotted (no error
  state needed — this is expected for incidents raised before location
  capture, or from a device that couldn't get a GPS/manual pin).
- Remove the stale "ships with slice phase 2" sentence; replace with a short
  legend (status colors) if the marker count makes that necessary.

## 5. Reports additions

`ReportsPage.jsx`'s `SECTIONS` array (`headline`, `onTime`, `late`) gets three
more entries, same section-picker/CSV/PDF-export treatment as today.
Checking the actual repository contract turned up more good news than
expected: most of the data these need is **already implemented** in
`src/data/repositories/mock/index.js` under the `reports` object — it's
built but never wired into `ReportsPage.jsx`, which today only calls
`teamCompliance`, `onTimeByWeek`, and `lateCompletions`.

- **Deficiency/incident** — wires up already-existing
  `openDeficienciesByLevel()` (categorical palette from
  `deficiencyLevels.js`, per the already-settled palette decision),
  `deficiencyAgeing()` (mean time to close + open-age buckets),
  `nocRegisterStatus()`, and `reinspectionRate()`. No new backend method
  needed — this section is UI work only.
- **Work order / SLA** — `slaAdherence()` already covers NOC-level SLA
  on-track/warning/breached + closed-on-time-vs-late, so that part wires up
  directly. Work-order-specific turnaround time (`date_issued` →
  verification) and completion rate by department are **not** covered by
  anything existing and need one new method,
  `reports.workOrderTurnaround()` (mean/median days issued-to-verified,
  bucketed by department), added to `types.js`, the mock, and the Supabase
  stub (throws `'not wired'`, per the existing stub convention).
- **Per-annex/per-form completion** — also genuinely new:
  `reports.templateCompletion()`, the same shape as today's `teamCompliance()`
  but grouped by `template_id`/code instead of `group` (team) — one table
  row per one of the 31+ registered forms, on-time/late/outstanding.

All three follow the existing rules already written down in
`docs/CURSOR_PROMPT_PHASE3.md` §5: stat tiles where the number is the point,
no dual-axis charts, status colors reserved for SLA/overdue state, a table
view alongside every chart, CSV export via the existing `downloadCsv`
helper, PDF via the existing `/api/export-report-pdf` pattern (house-style
export, not the overlay pipeline).

## 6. Settings additions

`SettingsPage.jsx`'s role-gated `SECTIONS` array gets three more entries.

- **Appearance** (`AppearanceSection`, everyone) — dark mode is already
  fully implemented (`ThemeContext.jsx`, `data-theme` attribute, persisted to
  `localStorage`) **and already has a working toggle in `Sidebar.jsx`**
  (Moon/Sun button, works both collapsed and expanded). That stays exactly
  where it is — no duplication in Settings, per the sidebar toggle already
  being one click away at all times. This section is just the two genuinely
  new preferences: default landing page (a `Select` of the top-level routes
  already in `Sidebar.jsx`'s nav — Dashboard, My Checklists, Incidents,
  Approvals, Reports — which route `/` redirects to instead of always
  `/dashboard`; stored per-device via `localStorage`, same pattern as the
  theme choice, not synced settings) and a 12h/24h time-format preference for
  `lib/airportFormat.js`'s display helpers. Timezone itself stays fixed to
  America/Belize per the existing architecture decision — not
  user-configurable.
- **Users & roles** (admin-only, `ADMIN_ROLES`) — the standalone `/users`
  page stays exactly as it is today (read-only, visible to everyone, for
  general staff lookup). This new Settings section adds actual CRUD: add
  user, edit name/position/department/role, toggle `is_approver`,
  deactivate. "Deactivate" is a soft flag (`is_active: false`) that blocks
  sign-in and hides the account from pickers, never a hard delete — audit
  history (submissions, sign-offs, approvals already attributed to that
  person) must stay intact and attributable. This is genuinely new: the
  `users` repository interface today is read-only (`list`, `getById`,
  `getByEmail` — no `persist`). Needs a new `users.persist()` method
  (create/update) and `users.setActive(id, isActive)` added to `types.js`,
  the mock, and the Supabase stub — answers BACC's open A3 item
  (authoritative user/role list) once populated.
- **Approvers & signing authority** (admin-only) — a lookup-style config
  section, same pattern as the existing Lookups/Alerts sections: a
  department/annex → approver-role mapping (who can sign as OM, COO, CEC per
  department). Feeds BACC's open A4/B5 items. Stored via the existing
  `settingsStore.js`/`useSettings()` pattern the other admin sections
  already use (new `store: 'approvers'` section, same shape as
  `deficiency`/`alerts`/`lookups`).

## Files touched

- `src/components/layout/TopBar.jsx` (bell + help → `Dropdown`)
- New: `src/components/notifications/NotificationDropdown.jsx`,
  `src/components/help/HelpDropdown.jsx`
- New: `src/context/ToastContext.jsx`, `src/components/ui/Toast.jsx`,
  `src/components/offline/OfflineModal.jsx`
- `src/components/layout/AppShell.jsx` (offline debounce, toast/modal wiring,
  wrap tree in `ToastProvider`)
- `src/pages/LocationsPage.jsx`
- `src/pages/ReportsPage.jsx` (+3 `SECTIONS` entries and matching render
  blocks)
- `src/pages/SettingsPage.jsx` + `src/components/settings/OtherSections.jsx`
  (+3 sections; `Users & roles` likely warrants its own
  `src/components/settings/UsersRolesSection.jsx` given the CRUD surface)
- `src/data/repositories/types.js`, `src/data/repositories/mock/index.js`,
  `src/data/repositories/supabase/index.js` — add `workOrderTurnaround`,
  `templateCompletion`, `users.persist`, `users.deactivate`

## Testing

Behavioral, verified live against the dev server per this project's existing
convention — static/faithful reproductions have missed real bugs here before
(see the "blank space at bottom of page" investigation in project history),
so anything that resists a quick static check gets tested against the
running app instead:

1. Notification and Help dropdowns: open/close on both mobile (drawer
   context) and desktop, keyboard nav, unread badge still updates, "View
   all" links land correctly, deep-linked FAQ group opens expanded on the
   full Help page.
2. Offline: toggle DevTools "Offline", confirm the toast+modal fire once
   after ~3s (not on a same-second blip), confirm they don't refire on a
   second offline period without an intervening online period ending the
   first episode correctly; go back online with 0 and with ≥1 queued items
   with a forced handler failure, confirm both toast outcomes; confirm
   queued work actually flushes (existing `flushQueue` behavior unchanged).
3. Locations: incidents with and without a captured location; click-through
   from a pin to its incident; empty state (zero incidents) still renders
   the base PGIA map correctly.
4. Reports: each new section against the six-months-of-seed-data mock,
   CVD-safe palette reused (not re-validated, since `deficiencyLevels.js`'s
   palette is unchanged), table view present for every new chart, CSV/PDF
   export produce correct new columns.
5. Settings: default landing page + time-format prefs persist across reload
   and take effect where expected (redirect from `/`, `airportFormat.js`
   display strings); sidebar theme toggle unaffected. Users & roles CRUD
   round-trips through the mock repository and respects `ADMIN_ROLES`
   gating; Approvers config saves/resets via the existing
   `saveSection`/`resetSection` pattern.
6. Full `desk:`/touch-target pass on the two new dropdowns and the offline
   toast/modal specifically, since these are new interactive surfaces not
   covered by the 2026-09-05 QA pass.
