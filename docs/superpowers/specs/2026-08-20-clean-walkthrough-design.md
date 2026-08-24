# Clean walkthrough, real users, and in-app guidance

**Date:** 2026-08-20
**Status:** Approved for planning
**Author:** Vision Forge Ltd

## Why

Shamira Young needs to sit down in front of the portal and go from nothing to a
completed loop — open a checklist, fail an item, raise the deficiency, fix it,
verify it, and watch the original NO SAT turn into SAT — without a fictional
six-month backstory in the way.

Two things make that impossible today. The portal opens on 184 seeded Annex D
submissions attributed to four people who do not work at PGIA, so nothing she
files is distinguishable from the demo. And there is no explanation anywhere in
the product of what she is supposed to do; the rules live in this repository and
in BACC's requirements document, not on screen.

A third thing gets fixed along the way. Forms are currently scoped by role, so
most staff see only a slice of the library — which is not what BACC's rules say.
Everyone can see every checklist on file.

Separately, BACC has now supplied the real staff list. Wiping the seeded history
is what makes installing it possible: those four fictional users only exist
because submitted records are attributed to them, and §11 forbids rewriting a
submitted record's attribution. Delete the records and the fictional directory
can go with them.

## Scope

This spec covers one pass. A second pass, specified separately, adds the SMS
Aerodrome Hazard Reporting Form and the five Annex 5 Wildlife forms — the latter
needs a repeating-row table input the portal does not yet have, and needs BACC's
Word originals exported to PDF first.

Out of scope here: the Users page visual redesign, role permission configuration
(questions A3/A4), and email delivery.

## 1. A clean environment

### The directory

`SEED_VERSION` goes to 10. The user list becomes nine records.

| Name | Position | Role key | Department | Email |
|---|---|---|---|---|
| Keagan Moore | Operations Manager | `om` | Operations | kmoore@pgiabelize.com |
| Michael Asevedo | Duty Manager | `duty_manager` | Operations | masevedo@pgiabelize.com |
| Marsha Hinkson | Duty Manager | `duty_manager` | Operations | mhinkson@pgiabelize.com |
| Edair de la Cruz | Duty Manager | `duty_manager` | Operations | edelacruz@pgiabelize.com |
| Andy Chable | Apron Supervisor | `apron_supervisor` | Operations | achable@pgiabelize.com |
| Kareem Nunez | Apron Supervisor | `apron_supervisor` | Operations | kareemnunez24@gmail.com |
| Windell Thompson | SMS | `sms` | Operations | wthompson@pgiabelize.com |
| Shamira Young | Operations Manager (test) | `om` | Operations | shamira.young@pgia.local |
| Glenrick Spain | Electrical Maintenance Technician | `electrical_tech` | Engineering | glenrick.spain@pgia.local |

Source: `BACCUsers and Departments.xlsx`, transcribed without correction —
Kareem Nunez's address is a Gmail account in BACC's own list and is seeded as
given.

All nine have `can_login: true`, so each role can be demonstrated from its own
chair. The two `.local` addresses are deliberate: they are not deliverable
mailboxes, which makes the demo accounts obvious at a glance and means no test
notification can ever reach a real employee once email is wired up.

The spreadsheet carries a fifth column the pasted list omitted — Keagan Moore is
marked **"Sr. Access to Portal/Approver."** He is seeded with the approver flag.
This is a partial answer to configuration question A4 and should be recorded as
such; it does not answer A4 for the other departments.

`sms` is a new role key. It has no template assignments in this pass, because the
one form Windell Thompson owns arrives in pass two.

### The history

Empty. No submissions, no incidents, no work orders, no approvals, no
notifications, no activity entries. `generateSeed` stops producing them.

### The schedule

Nothing is scheduled either. `generatePendingInstances` is not called at seed
time, and `instances` is `[]` alongside every other collection.

An earlier draft of this spec generated the current period for each rule, so the
portal would open on work waiting rather than on zeros. That was rejected: a
staged environment is not a clean one, and a walkthrough that begins with
inspections somebody already booked is not a walkthrough from scratch. Shamira
starts by picking a form from the catalogue, which is the honest starting point
for an airport that has just been handed the tool.

The consequence is that recurring inspections are not created automatically by
anything. That was already true — nothing runs the scheduler on a timer — and it
stays on the backlog rather than being disguised by a seed that pre-creates a
period's worth. `src/lib/instanceGeneration.js` stays: `advanceClock` still calls
`refreshInstanceStatuses`, and the module is what a real scheduler will be built
on when one exists.

Every page that reads an empty collection must render rather than crash — the
Reports charts especially, which divide by counts.

`backfillCompletedHistory` and the `KEEP_OVERDUE` / `KEEP_MISSED` constants are
deleted rather than set to zero. They exist to make a fictional history look
plausible; with no history they have no purpose, and leaving them dormant invites
someone to switch them back on.

### Existing browsers

The mock store keys its cached snapshot on `SEED_VERSION`, so bumping to 10
regenerates on next load. The dev-only **Reset demo data** control in Settings is
retained and is the way to re-clean between demonstrations. No new user-facing
reset control is added.

## 2. The staffing gap

The thirty templates are owned by the folder each approved form arrived in:

| Folder | Templates | Staffed by the real list |
|---|---|---|
| Crash Fire & Rescue | 18 | No |
| Apron Supervisor | 4 | Yes — Chable, Nunez |
| Electrical Engineer | 3 | No |
| General Checklist | 2 | Any role |
| Duty Manager | 1 | Yes — Asevedo, Hinkson, de la Cruz |
| Civil Engineer | 1 | No |
| Operations Manager | 1 | Yes — Moore |

Twenty-two templates name a post nobody on the list holds. Counting by role
rather than by folder, five are unstaffed: `cfr`, `cec`, `inspector`,
`electrical_tech` — held only by a demo account, which does not count — and
`coo`, which owns one template and the `om_coo_verification` sign-off on Annex D
and Annex H.

### Everyone sees every form

BACC's rule is that any member of staff can see any checklist on file, so the §4
role filter in `templates.list(profile)` is removed rather than extended.

Today a form is hidden unless one of its assignment rules matches the viewer's
role *and* department, with `om` / `coo` / `admin` exempt. That is why a Duty
Manager cannot open an apron form, and it is also what made the unstaffed posts a
problem worth solving with a stand-in. With the filter gone the problem goes with
it — nothing is a dead end for anybody, and no stand-in mechanism is needed.

The assignment rules stay. They remain what says who a form belongs to and how
often it runs; they simply stop being a lock on the door. Three comments in the
codebase assert the old rule and are corrected, because a stale comment about
permissions is worse than none.

An assignment rule for an unfilled post carries a null assignee. That is the
honest answer, and it is what the Users page banner reports — inventing a stand-in
would paper over exactly the gap the banner exists to show.

`src/lib/roleStaffing.js` still computes the gap list from the registry and the
directory, and still discounts demo accounts: Glenrick Spain holding
`electrical_tech` must not make the Electrical Maintenance Technician post look
filled, because he is Vision Forge and not PGIA.

### Assignment reach

Already in place and only to be confirmed by the walkthrough test, not rebuilt:
`IncidentDetailPage` loads the full directory with no role or team filter, so
Glenrick can already be assigned any incident and can assign to anyone.
`defaultTeamFor` prefills his team as `eec` and the field stays editable.

### The banner

The Users page carries a plain-language notice above the table naming the roles
with no staff account: Crash Fire & Rescue, Electrical Engineer, Civil Engineer,
Maintenance Inspector, Chief Operations Officer. It states that anyone can still open and complete
those forms, and that what is missing is the name of the person responsible.

This is deliberately in the product rather than only in
`BACC_Configuration_Questions.docx`. The document is easy to leave unanswered;
a banner in the tool BACC is being shown is not.

The list is derived — it compares the roles named across `TEMPLATE_REGISTRY`
assignments and template sign-offs against the roles present in the directory —
so it shrinks by itself as accounts are added and cannot drift out of date.

The Users page also gains an email column and loses its current explanatory
paragraph, which describes the fictional-directory arrangement that this change
removes.

## 3. Help and FAQ

A new page at `/help`, in the sidebar below Settings, with a **?** control in the
top bar. Visible to every role.

A filter box over grouped questions, each group collapsible. Content lives in
`src/content/faq.js` as a plain array of `{ group, question, answer }` so wording
can be changed without touching the page component — BACC will want to reword
these, and that must not require a developer.

Groups and the questions that matter most:

**Getting started** — what the portal is for; why some checklists are not visible
to you; what the colours and the SAT / NO SAT / N/A answers mean.

**Filling in a checklist** — how to start one; whether you have to finish in one
sitting (no, it saves as you go); *can I change an answer after I have submitted?*
(no, and why: a submitted inspection is the record of what was observed that day);
attaching photos and drawings; who signs and whether a phone signature counts.

**When something is NO SAT** — what happens next; whether you must raise an
incident; *does raising an incident change my original checklist?* (no — the
original stays exactly as filed).

**Incidents** — deficiency levels; who gets told; how to assign and set a target
date; what verification means; *when does the original NO SAT turn into SAT?*

**Approvals** — what you are approving; why the queue is grouped by team.

**Reports and PDFs** — how to get a PDF that matches the paper form; *why does my
drawing come out on an extra page instead of on the form?* (the approved form has
no drawing area and its layout may not be altered).

**Your account** — who can sign in; what your role lets you do; what to do if a
form you need is not listed.

**Settings** — who can change deficiency levels; why email notifications show as
pending.

Roughly twenty-five questions. Answers are two to four sentences, written for
someone who has never used the portal, and never reference file names, code, or
requirement section numbers — the reasoning behind §11 and §14 is explained in
plain terms without citing them.

## 4. The guide inside the incident

### The card

A **How this works** card on the incident detail page showing the five lifecycle
stages with the current one highlighted. The stage names are the app's own
(`INCIDENT_STATUSES`), so the card matches the buttons the user will press, with
a plain-English line under each:

| Stage | Plain-English line |
|---|---|
| Reported | Describe what is wrong and where it is. |
| Assigned | Choose who will fix it and set a target date. |
| In Progress | Record what is being done. Add photos as the work goes on. |
| Resolved | The person who did the work says it is finished. |
| Verified/Closed | Someone re-checks it on site. **Confirming SAT here changes the original checklist item from NO SAT to SAT.** |

Extracted into `src/components/incidents/HowThisWorks.jsx`, reading stage state
from `incidentStepIndex`. `IncidentDetailPage.jsx` is 1,083 lines; this must not
be added inline.

### The link back to the checklist

Under the stages, the origin of the incident in one sentence — *"Raised from item
A-12 on PGIA-PMM-F04, filed 14 August"* — as a link to the source submission.

Once verified, it becomes *"✓ Item A-12 now reads SAT on the original
checklist."* The wording is driven by `itemResolutionState`, which already
distinguishes open, resolved-awaiting-verification, and cleared. No new state is
introduced.

### Microcopy at the decision point

One line beside the verification controls, where the choice is actually made
rather than at the top of the page where it will have been scrolled past:

> Confirming SAT updates the original checklist. Choose NO SAT if it still is not
> right — the incident stays open.

Content for both the stages and this line lives in `src/content/incidentGuide.js`,
alongside the FAQ content and editable the same way.

### Cross-link

The card ends with a link to the Incidents group on `/help` for anyone who wants
the longer explanation.

## 5. Proving it works

`scripts/verify-walkthrough.mjs`, registered as `npm run verify:walkthrough`.

Headless Chromium against the Vite dev server — the dev server, not `vite preview`,
because the run exports a PDF and the `/api/*` handler is a dev-server plugin.

The run is Shamira's walkthrough, performed by the script:

1. Sign in as Shamira Young.
2. Assert the day-one picture: zero filed, zero overdue, a non-zero count due.
3. Open a due checklist from My Checklists.
4. Answer one item NO SAT, the rest SAT.
5. Sign and submit.
6. Raise an incident from the NO SAT item.
7. Assign it to Glenrick Spain, set a target date, advance to In Progress, then
   Resolved.
8. Record the SAT verification and close it.
9. Reopen the original submission and assert the item now reads SAT, and that the
   record still carries the prior answer in its amendment trail.

Step 9 is the point. `SYNC_SAT_ON_VERIFICATION` is a deliberate, named departure
from §5 and §11 made on BACC's instruction, and the thing a departure like that
needs most is a test that fails loudly if it ever stops behaving as agreed.

The existing gates — `verify:pdf`, `verify:signoffs`, `verify:palette` — stay
green and are unaffected.

## Files

**New**

- `src/content/faq.js` — FAQ content
- `src/content/incidentGuide.js` — lifecycle stage copy and verification microcopy
- `src/pages/HelpPage.jsx`
- `src/components/help/FaqAccordion.jsx`
- `src/components/incidents/HowThisWorks.jsx`
- `src/lib/roleStaffing.js` — roles named by the forms but absent from the
  directory; consumed by the seed's owner fallback and the Users page banner
- `scripts/verify-walkthrough.mjs`

**Changed**

- `src/data/seed/generateSeed.js` — version 10, real directory, no history,
  forward-only schedule, `backfillCompletedHistory` removed
- `src/data/repositories/mock/index.js` — `templates.list` returns every
  template; the role and department filter is removed
- `src/lib/templates.js`, `src/components/checklist/NewInspectionPicker.jsx`,
  `src/data/templates/registry.js` — comments asserting the removed §4 rule
- `src/pages/UsersPage.jsx` — real copy, email column, staffing banner
- `src/pages/IncidentDetailPage.jsx` — mount `HowThisWorks`, add the verification
  microcopy
- `src/components/layout/Sidebar.jsx`, `TopBar.jsx`, `src/App.jsx` — Help route,
  nav entry, top-bar control
- `src/config/incidentLookups.js` — `TEAM_BY_ROLE` entry for `sms`
- `src/components/settings/OtherSections.jsx` — `ROLE_LABELS` entry for `sms`, so
  the role can be chosen as a notification recipient
- `package.json` — `verify:walkthrough`

## Risks

**Losing the demo.** The seeded history is what currently makes the dashboard and
Reports look populated. After this change every page is honestly empty until
someone files something. That is the point, but it means a demonstration to BACC
now requires walking through the flow rather than opening on a full dashboard.
The dev **Reset demo data** control remains, so the environment can be re-cleaned
between demonstrations — but it regenerates as an empty portal, not as the old
fictional history, and that history is not coming back.

**Empty-state coverage.** No page in this portal has ever rendered against zero
rows, because the seed always supplied some. Reports is the likeliest to break;
its charts divide by counts. Every page is checked by hand during implementation,
and the walkthrough test asserts the dashboard shows no `NaN`.

**Real names in a test system.** Seven real employees now exist in a portal where
anyone with access can file records against their names. The `.local` addresses
keep the two demo accounts separable, and no email is deliverable yet. Before
email is enabled, confirm with BACC that test notifications will not be sent to
live mailboxes.

**FAQ drift.** Answers describing current behaviour will go stale as the portal
changes — particularly the answers about email being pending and about work
orders being hidden. Both are tied to flags in the codebase (`EMAIL_INTEGRATION_READY`,
`WORK_ORDERS_ENABLED`); the corresponding answers should read those flags rather
than assert a fixed state.

## Open questions this does not resolve

Unchanged and still with BACC: A1 and A2 (deficiency level meanings and response
times), A3 (the authoritative role list — the staff list answers who, not what
each may do), A4 for departments other than the OM, and everything in sections B
and C.

Newly raised by this work: who holds Crash Fire & Rescue, Electrical Engineer,
Civil Engineer, Maintenance Inspector and Chief Operations Officer. These now
appear in the Users page banner as well as in the configuration questions
document.
