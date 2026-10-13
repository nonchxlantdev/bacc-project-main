# In-app walkthrough — design

Date: 2026-10-13 · Status: approved in brainstorming, built the same day

## Goal

New staff can find their way around the portal without a training session: a
short welcome tour on first sign-in, then a short guide on each screen the first
time they open it. Every tour shows only what the person's role can actually
use, and nothing in a tour ever writes to a record.

## Decisions

| Question | Decision |
| --- | --- |
| Access | One access map (`src/config/access.js`) drives the sidebar, the Settings admin sections, a route guard on `/users`, and the tours. It mirrors the Worker rules and a test keeps the two in step. The server stays the real gate. |
| Shape | Short welcome tour (shell + one stop per menu item the role can open) plus a per-screen tour on first visit. All replayable from Help. |
| Depth | Point out and link to the Help FAQ. Tours never click, fill or submit anything. |
| Seen state | On the account (D1 `users.tours_seen`), so it follows the person across devices and shared tablets. Supabase and mock builds keep it in browser storage until the D1 cutover. |
| Engine | driver.js 1.8.0 (MIT) for the spotlight and popover, wrapped so only one file imports it. |

## Access map

| Screen / capability | Roles |
| --- | --- |
| Dashboard, My Checklists, All Checklists, Incidents, Approvals, Reports, Locations, Settings, Help | everyone signed in |
| Users (`/users`) — `users` | om, admin (`canListUsers`) |
| Airport-wide Settings sections — `orgSettings` | om, admin (`MANAGERS`, `assertCanWriteSettings`) |
| See every incident / approval — `seeAll` | om, coo, admin (`SUPERVISORS`) |
| Acknowledge a checklist — `acknowledge` | om, admin |

Changes this makes to what people see:

- The sidebar hides Users from everyone except OM and admin.
- Settings shows the airport-wide sections to OM and admin only. The COO used
  to see them but the server refused every save.
- `/users` typed directly redirects to the Dashboard for other roles.

## Components (`src/components/tour/`)

| File | Job |
| --- | --- |
| `tours.js` | Content only: id, version, route, steps (`target`, `title`, `body`, `requires`, `needsNav`, `faq`). `body` may be a function of the role context. |
| `tourSteps.js` | Pure: pick the tour for a path, drop steps the role cannot use, resolve bodies. Unit-tested. |
| `tourProgress.js` | Pure + storage: sanitise, merge (highest version wins), local cache per user. |
| `driverAdapter.js` | The only driver.js import. Builds the popover HTML (escaped), styles via `tour.css` using the app's colour tokens, handles the FAQ link. |
| `TourProvider.jsx` | Chooses when to run, waits for targets, opens the phone drawer for sidebar stops, saves progress, exposes `useTour()`. |

Targets are `data-tour="…"` attributes, never CSS classes.

## Behaviour

- **Welcome tour** runs once after sign-in — never over the forced password
  change or any open dialog. Finishing it chains into the current screen's
  guide. Skipping it marks it seen and pauses screen guides for the rest of the
  session.
- **Screen guides** run the first time a screen opens. One tour at a time. A
  guide waits while a dialog (signature prompt, offline notice, pickers) is open.
- **Controls:** Next, Back, Skip (×), Esc, arrow keys. Skipping counts as seen.
  A step's "More in Help" link opens the matching FAQ group and ends the tour.
- **Help answers:** a screen opened at a specific answer (`/help#group`, the "More in Help" link) shows the answer and starts no guide.
- **Replay:** Help page "Guided tours" card (welcome tour + each screen the role
  can open) and "Show me around this page" in the Help menu.
- **Leaving mid-tour** (browser back): the tour closes unfinished and offers
  itself again next time.
- **Automated browsers** (`navigator.webdriver`, i.e. the QA harness and
  `verify-walkthrough`) get no automatic tours, so no overlay blocks them.
  Replays from Help still work there.
- **Versioning:** raising a tour's `version` shows it again once.
- **Missing targets:** wait up to 3 s, then drop the step. Hidden targets (for
  example the evidence rail on a phone) are dropped. A tour with no steps left
  does not start and is not marked seen.
- **Phone:** stops on the sidebar open the drawer first and close it after.
- **Offline:** driver.js ships in the bundle. Seen marks always land in the local
  cache; on D1 they are pushed to the account, and any mark that failed to push
  is merged up on the next load.

## Server (D1)

- Migration `0004_tours_seen.sql`: `users.tours_seen TEXT NOT NULL DEFAULT '{}'`.
- `validateProfilePatch` accepts `tours_seen`: an object of at most 40 tour ids
  (`^[a-z][a-z0-9-]{0,39}$`) to whole-number versions 1–1000. Anything else → 400.
- `tours_seen` is returned only to the account itself (`users.getById`,
  `users.getByEmail`, `users.update`), never in `users.list` or to supervisors.

## Writing rules for tour copy

- Production wording only. No demo, pilot, trial or test wording.
- Nothing about switched-off features: work orders and photo attachments are not
  mentioned.
- 25 words or fewer per step; detail lives in the FAQ.

## Testing

- `tests/access.test.js`: access map agrees with `worker/auth/permissions.js`
  and `worker/data/rules.js` for every role.
- `tests/tours.test.js`: role filtering (no Users stop for a Duty Manager), word
  limit, banned words, every `data-tour` target exists in `src/`, every FAQ link
  names a real FAQ group, progress merge/sanitise.
- `tests/dataRules.test.js`, `tests/dataService.test.js`: `tours_seen`
  validation, self-only visibility, round trip.
- Browser check (Playwright, mock data): welcome tour as Duty Manager and as
  admin, desktop and phone width.

## Deploying

1. Merge.
2. `npx wrangler d1 migrations apply bacc-portal-db --remote` (adds the column;
   harmless while production is still on Supabase).
3. Deploy as usual.
