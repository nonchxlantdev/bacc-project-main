# Stored signature — save once, apply on checklists

**Date:** 2026-08-31
**Status:** Approved for planning
**Author:** Vision Forge Ltd

## Why

Every checklist today asks the inspector to draw their signature again on a pad at
the bottom of the form, even when they filed one an hour ago on another Annex.
That is slow on a tablet, error-prone in the field, and unlike how people expect
a work tool to behave once they have identified themselves to the system.

BACC still need a defensible record: each submission must carry the signature
image, the signer's name and position, and the time it was applied, stamped onto
the approved PDF. Nothing here weakens that. A stored signature is a
**convenience copy on the user profile**; applying it **writes a snapshot onto
the draft** the same way drawing on the pad does today.

## Scope

### In scope (v1)

- One stored signature **per user account**.
- Apply stored signature to the **`inspector` sign-off block only** on draft
  checklists that define that role in `schema.signoffs`.
- Prompt when opening an **editable** checklist draft (see §3).
- **“Don’t show this again”** on the prompt; preference stored on the profile.
- **Settings → My profile → My signature** to add, update, preview, or clear the
  stored signature at any time.
- **“Use my saved signature”** on the inspector `SignoffBlock` when a stored
  signature exists (for users who dismissed the prompt).
- Demo mode: store on the mock user record; production path: `profiles` table +
  Supabase Storage (implementation plan may stage Storage for pass two if demo
  ships first).

### Out of scope (v1)

- OM / COO **acknowledgment** signature after submit (`ChecklistDetailPage` OM
  pad) — separate moment, separate workflow.
- Appendix C **`responsible` / `supervisor`** and other non-inspector sign-off
  roles — pass two can match `profile.role` to `signoff.role`.
- **Log table** signature cells (`LogTable.jsx`) — different control path.
- Work order or incident signatures.
- Per-role signature wallets (multiple stored images per user).
- Biometric or typed-signature substitutes.

## Constraints

- **BACC §11** — a submitted checklist is never overwritten. Stored signature
  changes in Settings do not alter submitted records or exported PDFs.
- **BACC §14** — approved form layout and sign-off block labels are unchanged.
  Only how the inspector **fills** the existing pad changes.
- Applying a stored signature must be an **explicit user action** (prompt button
  or SignoffBlock control), not silent auto-sign on load.
- A user may only read and update **their own** stored signature (RLS
  `profiles_update_own` in production).

## 1. Data model

### Profile fields (new)

| Field | Type | Purpose |
| --- | --- | --- |
| `stored_signature_data_uri` | `string \| null` | PNG data URI in demo; storage path or data URI in production |
| `stored_signature_updated_at` | `ISO string \| null` | When the user last saved in Settings |
| `hide_signature_prompt` | `boolean` | `true` when “Don’t show this again” is checked |

Demo: extend each user in the mock directory / `AuthContext.updateProfile`.
Production: migration adding columns to `public.profiles`; prefer
`signatures/{user_id}.png` in Supabase Storage with `stored_signature_data_uri`
holding the path or a signed URL cache — decision left to implementation plan.

### Checklist submission (unchanged)

`record.signoffs[]` entries remain:

```js
{
  role: 'inspector',
  name: string,
  position: string,
  signature_data_uri: string | null,
  signed_at: ISO string,  // set when signature is applied or block is saved
}
```

`applyStoredSignature` **copies** `profile.stored_signature_data_uri` into the
inspector sign-off entry and sets `name` / `position` from the profile (same as
submit does today). `signed_at` is set at apply time, not at submit — so the
timestamp reflects when they signed the draft.

### Preferences vs profile

`hide_signature_prompt` lives on the **profile**, not the global Settings store,
because it is per-person. `stored_signature_*` is personal data, not airport
configuration.

## 2. User flows

### 2.1 First-time — no stored signature

1. User opens a draft checklist.
2. Modal: **“Set up your signature?”**
   - Short copy: save once, reuse on checklists; can still sign manually per form.
   - **Set up signature** — `SignaturePad` in modal → **Save to my profile** →
     optional **Apply to this checklist** (fills inspector block).
   - **Sign manually on this form** — close modal; use existing pad at bottom.
3. No “Don’t show again” until they have a stored signature (checkbox hidden or
   disabled on this variant).

### 2.2 Returning — stored signature, prompt not dismissed

1. User opens a draft checklist.
2. Modal: **“Use your saved signature?”**
   - Preview thumbnail of stored signature.
   - **Use my signature** — `applyStoredSignature` → close.
   - **Sign manually** — close; no change to sign-offs.
   - ☐ **Don’t show this again** — if checked, set `hide_signature_prompt: true`
     when either primary button is clicked (persist via `updateProfile`).
3. User continues inspection and submits as today.

### 2.3 Prompt dismissed

1. Opening a draft checklist shows **no modal**.
2. Inspector `SignoffBlock` shows **Use my saved signature** when
   `stored_signature_data_uri` is set and block is empty or user wants to replace.
3. Settings always allows manage signature.

### 2.4 When the prompt does not run

| Condition | Prompt |
| --- | --- |
| `record.status !== 'draft'` or `readOnly` | No |
| Reference sheet (`schema.referenceGroups`) | No |
| Form has no `inspector` entry in `schema.signoffs` | No |
| `hide_signature_prompt === true` | No |

The prompt may run **once per checklist open** (each navigation to
`/checklists/:id`), not once per session globally — unless dismissed.

### 2.5 Submit

Unchanged validation: inspector sign-off must have `signature_data_uri` before
submit (existing walkthrough and submit handler). Stored signature is just another
way to populate that field.

## 3. UI components

### 3.1 `SignaturePromptModal` (new)

- Props: `open`, `hasStoredSignature`, `storedPreviewUri`, `onUseSaved`,
  `onManual`, `onSetupSave`, `onDismissForever`, `onClose`.
- Accessible: focus trap, `Escape` closes to same as “Sign manually”.
- Mobile: full-width sheet; desktop: centred dialog.

### 3.2 Settings — `ProfileSection` (extend)

New block **My signature** below name/position:

- Preview or empty state.
- `SignaturePad` + **Save signature** / **Clear signature**.
- Effect line: *“Used when you tap ‘Use my saved signature’ on a checklist. Does
  not change records you have already submitted.”*

### 3.3 `SignoffBlock` (extend)

When `role === 'inspector'`, not `readOnly`, and profile has stored signature:

- Button **Use my saved signature** above the pad.
- If block already has a different drawing, confirm before overwrite (lightweight:
  “Replace current signature?”).

### 3.4 `ChecklistDetailPage` (orchestration)

On load when draft is editable and schema has inspector sign-off:

1. Read profile signature + `hide_signature_prompt`.
2. If prompt rules pass → `setSignaturePromptOpen(true)`.
3. Wire `applyStoredSignature(record, profile)` to patch `record.signoffs` for
   `role === 'inspector'` only.

## 4. Core logic

### `applyStoredSignature({ record, profile, displayName, position })`

1. Find `schema.signoffs` entry with `role === 'inspector'`; if none, no-op.
2. Merge into `record.signoffs`:
   - `name`: `displayName` / `profile.full_name`
   - `position`: `position` / `profile.position`
   - `signature_data_uri`: `profile.stored_signature_data_uri`
   - `signed_at`: `new Date().toISOString()`
3. Return updated `record` (caller persists via existing autosave).

### `shouldShowSignaturePrompt({ record, profile, schema, readOnly })`

Returns true when all hold:

- `!readOnly`
- `record.status === 'draft'`
- `schema.signoffs` includes `inspector`
- `!profile.hide_signature_prompt`

## 5. Security and privacy

- Stored signature is **PII / evidential** — same protection as profile name.
- Demo: stays in localStorage inside user object; warn in security assessment
  that production must use authenticated storage.
- Production: Storage bucket not public; RLS on `profiles`; audit log optional
  v2 (`stored_signature_updated_at` already provides basic traceability).
- FAQ addition under **Filling in a checklist**: explain saved vs per-form
  signature and that submit still records time and image on that submission.

## 6. Testing

| Test | Assert |
| --- | --- |
| `node --test` unit | `applyStoredSignature` only touches `inspector`; no-op without role |
| `verify-walkthrough` extension | Save signature in Settings → open Annex D → use saved → submit without drawing on pad |
| Manual | Prompt + “Don’t show again” → reopen checklist → no prompt; Settings still works |
| Manual | Submitted checklist → no prompt; changing stored sig does not change PDF |

## 7. Implementation order (for planning)

1. Profile fields + `updateProfile` + Settings UI.
2. `applyStoredSignature` helper + unit tests.
3. `SignoffBlock` “Use my saved signature” button.
4. `SignaturePromptModal` + `ChecklistDetailPage` wiring.
5. FAQ line + Help search keyword “signature”.
6. (Production) Supabase migration + Storage bucket.

## 8. Open questions

None for v1. Inspector-only scope is confirmed by BACC / Vision Forge on
2026-08-31.

Pass two (not scheduled): map stored signature to `responsible` / `supervisor`
when `profile.role` matches `signoff.role`; OM acknowledgment stored signature
optional separate spec.
