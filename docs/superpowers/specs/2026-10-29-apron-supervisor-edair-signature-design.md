# Apron Supervisor forms — Edair de la Cruz name and signature — design

**Date:** 2026-10-29 · **Status:** approved in chat 2026-10-29 · **Repo:** `bacc-project-main`

When an Apron Supervisor fills one of their four checklists, the conducted-by name is `Their Name / Edair de la Cruz` and the signature in that box is the signature Edair saved on his own profile. He saves it once under Settings → My profile. The Apron Supervisor inserts that saved signature. The copy lives on the checklist.

## 1. Where it applies

The signed-in role is `apron_supervisor`, and the template code is one of:

| Code | Form |
| --- | --- |
| PGIA-PMM-F02 | Operational control inspection |
| PGIA-PMM-F05 | Aerodrome sign inspection |
| PGIA-PMM-F06 | Unpaved area routine inspection |
| PGIA-PMM-F10 | Construction area daily safety inspection |

An Operations Manager (or anyone else) opening those same templates keeps the current behaviour: their own name, their own saved-signature button, and a drawing pad they can use.

Edair de la Cruz is the active user whose email is `edelacruz@pgiabelize.com`. If that email is not on the directory, he is the single active user whose full name matches `Edair de la Cruz` with case and surrounding spaces ignored. Two active users with that name and neither on that email count as “not on the directory”. The app does not guess.

## 2. What the Apron Supervisor sees

**Name.** The name used on the form is `{signed-in full name} / Edair de la Cruz`. The position stays `Apron Supervisor` (the role title already used for this role, not the free-text position on the profile).

- F10 header field `inspectionConductedBy` (“Inspection conducted by”) is one text line. It is locked to `{signed-in full name} / Edair de la Cruz`. That is the line in the photo.
- F02, F05, and F06 already show a name box beside a title box. The name box shows the pair. The title box stays `Apron Supervisor`. The stored header value is those two halves joined with ` / `, which is how that field is stored today.
- The conducted-by signature block shows the same name and the same position, in its two fields. Both stay locked.
- Opening a draft re-syncs the name to whoever is signed in, the same way the form already does, so the pair stays current. It does not replace a signature already inserted.

**Signature.** The conducted-by signature box (the form’s first sign-off) has one button: **Insert Edair de la Cruz’s signature**. The drawing pad on that box does not accept a new drawing. The existing “Use my saved signature” button and the “Use your saved signature?” prompt do not appear on these four forms for an Apron Supervisor. His own profile signature is unchanged and still available under My profile for anything else.

Tapping the button copies Edair’s current saved signature onto that sign-off, with `signed_at` set to now. If the block has no `sign_date` yet, it is set to the checklist’s date, the same day the pad would have pinned. If a signature is already in the box, the button asks before replacing it (the confirm line the signature block already uses).

The image stored on the checklist is a copy. Redrawing his profile signature later leaves this checklist as it was until someone taps Insert again.

**Submit.** Submit is refused while the conducted-by box has no signature. Save-as-draft still works with the box empty. Once a signature is in the box, submit is allowed even if a later reload finds that Edair has cleared his profile signature or that the load failed — the checklist already holds its copy. On submit, the conducted-by sign-off name stays the paired name. The submit path must not write the signed-in name back over it.

The refused-submit banner is:

- Load succeeded and the box is empty: `Insert Edair de la Cruz's signature before submitting.`
- Otherwise: the sentence already shown beside the button (§4).

## 3. What the PDF prints

The overlay already prints a sign-off as `name / position` on one line (`server/overlayChecklistPdf.js`). With the values above, the conducted-by signature line prints:

`{signed-in full name} / Edair de la Cruz / Apron Supervisor`

F10’s header field is the name line only, so it prints `{signed-in full name} / Edair de la Cruz`.

F02, F05, and F06 print the joined header value, so that header line is `{signed-in full name} / Edair de la Cruz / Apron Supervisor`.

No field map, schema label, or PDF coordinate changes.

## 4. Loading his signature

Edair saves and clears his signature in Settings → My profile. That screen is unchanged.

When an Apron Supervisor opens a draft of one of the four forms, the client calls `users.getByEmail` with `edelacruz@pgiabelize.com`. It keeps that user only when the account is active (`is_active` is not false) and the email matches. Otherwise it calls `users.list`, keeps the active users whose full name matches `Edair de la Cruz`, and if there is exactly one, calls `users.getById` for that id. It uses a signature only after that check. The mock `getByEmail` falls back to some other login when the email is missing; that fallback must not be treated as him.

`worker/data/service.js` `withSignature` attaches `stored_signature_data_uri` for another user only when `canSeeOthersSignatures` is true (OM, COO, admin). Extend that so an `apron_supervisor` also receives the stored signature when the user being loaded is Edair, and for nobody else. `users.list` stays without signatures. The rule lives next to `canSeeOthersSignatures` in `worker/data/rules.js` so `tests/dataRules.test.js` can cover it. No change to `src/config/access.js`.

**Messages** shown beside the button. Submit uses these when the load is in that state, and the empty-box sentence in §2 when the load succeeded:

| State | Text |
| --- | --- |
| He has not saved a signature | Edair de la Cruz has not saved a signature yet. He can save one under Settings → My profile. |
| He is not on the directory | Edair de la Cruz is not on the directory, so his signature cannot be inserted. |
| The load failed | Could not load Edair de la Cruz's signature. |

The failed state offers **Try again**, which repeats the load. Insert is enabled only when a saved signature was loaded. It stays disabled in the first two states and while the load has failed.

## 5. Tests

- Paired name for an Apron Supervisor on each of the four codes, and the plain signed-in name for an Operations Manager on those same codes and for an Apron Supervisor on any other code.
- An Apron Supervisor reading Edair’s user receives `stored_signature_data_uri`. The same role reading any other user does not. OM, COO, and admin still receive other users’ signatures. An inspector still does not.
- Submit of an Apron Supervisor draft of one of the four forms keeps the paired name on the conducted-by sign-off, and is refused while that sign-off has no signature.

## 6. Files

- New helper for “does this apply?”, the paired name, and “is this user Edair?” — used by the checklist page and by the worker rule so the email and the name are written once.
- `src/components/checklist/ChecklistForm.jsx` — F10 header lock and fill; signature block gets the Insert button and a pad that does not take a drawing, only on this path.
- `src/components/checklist/SignoffBlock.jsx` — button label can be the Insert sentence; pad can be closed to drawing while still showing the image.
- `src/pages/ChecklistDetailPage.jsx` — load Edair, suppress the own-signature prompt, pass the paired name, refuse submit until the signature is present, and keep the paired name on submit.
- `worker/data/rules.js` and `worker/data/service.js` — the one-person signature read.
- Tests beside the existing signature and data-rule tests.
