/**
 * The "Open drafts" list on All Checklists: other people's unsubmitted drafts
 * that a manager may delete. The viewer's own drafts are left out — they are
 * already in My Checklists, which is where you resume or delete your own.
 *
 * `canDelete(row, profile)` is `canDeleteDraft` from lib/submissions.js
 * (injected so this stays a pure, Node-testable function).
 */
export function teamOpenDrafts(rows, profile, canDelete) {
  if (!profile?.id) return [];
  return rows.filter((row) => row.inspector_id !== profile.id && canDelete(row, profile));
}
