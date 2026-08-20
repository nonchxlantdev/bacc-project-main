# Settings — design

Vision Forge Ltd · BACC Operations Management Portal · 20 August 2026

## Why

`/settings` currently holds a name field, a position field, and a dev-only demo
clock. Meanwhile fifteen questions sit unanswered in
`docs/BACC_Configuration_Questions.docx`, and the two blocking ones — what
Deficiency Levels 1–4 mean, and the response time for each — are the reason
`DEFICIENCY_LEVELS[].targetDays` is still `null` and no incident has a real
due-date rule.

A settings page turns nine of those questions from *waiting on a returned
document* into *something BACC fill in themselves*.

| Question | Asks | Section |
| --- | --- | --- |
| A1 | What Levels 1–4 mean, which is most severe | Deficiency Levels |
| A2 | Response timeframe per level | Deficiency Levels |
| B1 | NOC number format | Lookups |
| B2 | Deficiency categories | Lookups |
| B3 | Who is notified per event, and escalation | Alerts & Escalation |
| C1 | Retention period | Organisation |
| C4 | Sending email address | Alerts & Escalation |
| C6 | High-resolution logo | Organisation |

**Out of scope for this pass**, at BACC's request: roles and permissions (A3),
approver routing per department (A4), and Annex H signing restrictions (B5).
The page is built so those drop in as further sections without restructuring.

## §14 and editability

BACC have confirmed the level definitions should be **editable in the portal**,
not read-only. §14 requires that a change to approved configuration be a
*controlled* change rather than a convenience edit, so every save appends to an
audit trail recording section, actor, timestamp, and the previous value. The
current section shows who last changed it and when, in the section itself
rather than buried in a log. That visibility is what makes it controlled.

Nothing here edits an approved form. Item wording, numbering, section order and
layout remain untouchable — this configures how the portal *reacts* to a form,
not the form.

## Architecture

`getDeficiencyLevel()`, `slaState()` and `ruleFor()` are called synchronously
from eight files. Three options were considered:

- **A — settings context + module cache** *(chosen)*
- B — make the helpers async: turns eight call sites into loading states for
  values that never change mid-session
- C — thread a settings object through props: forces components that have no
  other reason to know about settings to carry one

### How A works

```
config/settingsDefaults.js   the shipped defaults — the current hardcoded values
        │
        ▼
data/repositories/…/settings  { get, save, resetSection }  ← persisted overrides
        │
        ▼
lib/settingsStore.js          merge(defaults, overrides) → module-level cache
        │                     + subscribe() for React
        ├──────────────► config/deficiencyLevels.js   (sync helpers, unchanged signature)
        ├──────────────► config/notificationRules.js  (ruleFor, unchanged signature)
        └──────────────► context/SettingsContext.jsx  (components re-render on save)
```

The store is loaded once at boot, before the first render that needs it. The
one mutable module-level value lives in `settingsStore.js` and nowhere else;
its comment explains why it exists.

Defaults are never edited. The store persists only what BACC actually changed,
so a shipped default that later improves is picked up by every deployment that
had not overridden it.

## Sections

Sections are filtered by role, so there is no separate admin URL to protect and
no route that renders empty for the wrong person.

| Section | Visible to | Contents |
| --- | --- | --- |
| My Profile | everyone | Name and position as they appear on sign-offs |
| Notifications | everyone | Which events this person wants, in-app and email |
| Deficiency Levels | om, coo, admin | Severity order, label, definition, target days, alerting |
| Alerts & Escalation | om, coo, admin | Per-event recipients, escalation delay, sending address |
| Scheduling | om, coo, admin | Due-soon window, overdue→missed threshold, backfill caps |
| Lookups | om, coo, admin | Deficiency categories, incident types, NOC number format |
| Organisation | om, coo, admin | Airport name, retention period, PDF footer |
| Demo controls | dev builds only | The existing clock and reset tools |

### Deficiency Levels — the section that unblocks the rest

Four rows, each carrying label, definition, target days and an alerting flag,
plus one control above them all: **which end of the scale is most severe**.

Nothing in the app infers severity direction today, deliberately — guessing
would invert urgency, colour and alerting everywhere at once. That control is
the single place the direction is stated, and the colour ramp and default sort
read from it.

Setting a target day count is what finally makes `target_date` and the incident
countdown real.

## Save behaviour

Per section. A section with unsaved edits shows a marker on its rail item and a
sticky Save / Discard bar; leaving with unsaved changes warns first. No
auto-save — these settings have regulatory consequences and a stray keystroke
should not be one of them.

Each control states what it affects in one line, so nobody changes an SLA
without seeing that it moves every countdown in the portal.

## Testing

Behavioural, not cosmetic — the point is that settings *do* something:

1. Set Level 2 target days to 7; a Level 2 incident's countdown reflects it.
2. Flip severity order; the level ordering and colour ramp invert.
3. Turn off an event's email recipient; `ruleFor` reports it off.
4. Reset a section; shipped defaults return and the audit records the reset.
5. Existing route smoke test and the PDF fidelity gate stay green.
