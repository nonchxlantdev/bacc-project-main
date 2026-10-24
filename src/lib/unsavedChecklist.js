/** True while a checklist on screen has edits the autosave has not confirmed. */
let unsaved = false;

export function setUnsavedChecklist(value) {
  unsaved = Boolean(value);
}

export function checklistHasUnsavedEdits() {
  return unsaved;
}
