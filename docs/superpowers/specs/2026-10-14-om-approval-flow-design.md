# OM approval flow, OM signature, draft privacy — design

Date: 2026-10-14 · Status: agreed in chat, awaiting spec review
Data mode: D1 (`VITE_DATA_SOURCE=d1`). The Supabase path is not changed.
Governing rule kept: BACC §11 — a finished (OM-signed) record is never edited;
§14 — no change to approved form wording/layout.

## The flow (option A, agreed)

```
Inspector drafts ──Submit──▶ Submitted (locked, in OM's Approvals)
                                   │
              ┌────────────────────┴───────────────────┐
     OM: Return for changes (note required)    OM: Approve & sign
              │                                        │
     back to Draft for the inspector          Acknowledged = complete
     (inspector fixes, resubmits)             Export PDF available
```

## 1. OM signature shows on every form

**Cause.** Approving always stores the OM's signature as role `om_acknowledgment`
(Annex D's name). Other forms name the OM's box differently, so the signature
landed in no box on screen and, for the lighting and wildlife forms, not on the PDF.

**Fix.** Keep storing it as `om_acknowledgment` (the D1 lock triggers already allow
exactly that role to change on a locked record). Add one map that says which box
on each form is the OM's — `src/config/approverRoles.js`:

| Forms | OM's box (schema role) |
|---|---|
| Annex D | `om_acknowledgment` |
| Annex A, B, C, E, F, I | `om` |
| Appendix C-01 … C-20 | `supervisor` |
| Wildlife Findings Report | `received_by` |
| Annex J, K, L, Hazard Reporting, the 4 wildlife logs | none (approved in the portal; nothing stamped) |

Keyed by form code (`schema.code`). `approverRole(schema)` returns the role or `null`.

- **On screen** (`ChecklistForm`): the approver box shows the `om_acknowledgment`
  sign-off (name, signature, date).
- **On the PDF**: `signoffFieldPrefix` resolves `om_acknowledgment` to the form's
  approver role prefix (`om`, `supervisor`, `received_by`; Annex D keeps `om`), so
  `signatureImages` (browser) and the name/date mapper in
  `server/overlayChecklistPdf.js` stamp it in the right slot. Field maps unchanged.

## 2. Only the OM can sign the OM box

In `ChecklistForm`, the approver box is read-only for everyone, in every state —
it is filled only by the approval. It shows "Signed by the OM when approved" until
then. Other boxes behave as today. Server: `validateRecordPayload` drops any
sign-off whose role is the form's approver role from a draft/submit payload, so a
crafted request can't pre-fill it.

## 3. Return for changes

- **Approvals page:** "Reject" becomes **Return for changes**; a note is required.
  "Approve" becomes **Approve & sign**. The "Rejection … pending BACC confirmation"
  line is removed.
- **Server** (`approvals.decide`, decision `rejected`): in one batch — mark the
  approval rejected with the note; set the checklist back to `status='draft'`,
  `locked=0`, `submitted_at=NULL`; drop the inspector's own sign-off date stamp
  (they sign again on resubmit); unlink any schedule instance the submit linked;
  notify the inspector: "Returned for changes: {note}".
- **Migration `d1/migrations/0005_return_for_changes.sql`:** recreate
  `submissions_frozen_when_locked` so it also allows exactly this change:
  `OLD.status='submitted' AND NEW.status='draft' AND NEW.locked=0 AND NEW.submitted_at IS NULL`
  with every other column unchanged. Acknowledged records stay fully frozen.
- **Resubmit** creates a fresh pending approval (existing code already does when
  none is pending).
- Inspector sees the OM's note in a banner on the returned draft.

## 4. Export only when complete

- `ChecklistDetailPage`: **Export PDF** shows only when `status === 'acknowledged'`.
  **Show preview** stays available to everyone (it is not a download).
- Submit success text becomes "Submitted. The Operations Manager will review it."

## 5. Corrections after sign-off — OM only

- **Create correction** shows only for OM/admin, only on acknowledged records.
- Server: `checklists.persist` creating a record with `supersedes_id` requires a
  manager (`assertCanCorrect`).

## 6. Drafts are private

- Server: `checklists.listAll` and `checklists.get` return a draft only to its
  author or a manager (OM/admin — Kegan). Others get it filtered out / 404.
- `listMine` unchanged. No UI list of other people's drafts (removed 2026-10-14).

## 7. Incident close error visibility (already shipped)

Errors from "Yes, close it" now show inside the Progress card. Server close path
verified working on D1 (closes; DR-01 flips to SAT). Awaiting the on-screen message.

## Tests (node:test, real migrations via `tests/helpers/sqliteD1.js`)

- approverRoles: every form code in `src/data/checklists` maps to a role that exists
  in its schema, or to null.
- signoffFields: `om_acknowledgment` on a C-08 record yields `supervisor_signature`.
- Return: submit → return (note required) → row is draft/unlocked; inspector can
  edit and resubmit; a new pending approval exists; acknowledged rows still can't
  be unlocked (trigger aborts).
- Draft privacy: another inspector can't list/get a draft; OM can.
- Corrections: inspector can't create a correction; OM can.
- Approver sign-off in an inspector's payload is dropped.

## Out of scope

Server-side enforcement of the export gate (the export route renders whatever the
browser sends; the button gate is the control for now). Supabase mode.
