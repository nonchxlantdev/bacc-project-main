/**
 * What each stage of an incident means, in one line.
 *
 * Keyed to the status values in incidentLifecycle.js so the guide always names
 * the stages the same way the buttons do — a guide that says "Fixed" while the
 * control says "Resolved" costs more than it gives.
 *
 * Wording lives here rather than in the component for the same reason as the
 * FAQ: BACC will want to reword it, and that should not need a developer.
 */
export const INCIDENT_STAGES = {
  open: 'Describe what is wrong and where it is.',
  assigned: 'Choose the unit that will fix it and set a target date.',
  in_progress: 'Record what is being done. Add photos as the work goes on.',
  resolved: 'Record that the unit has finished the work.',
  closed: 'Someone re-checks it on site. Confirming SAT here changes the original checklist item from NO SAT to SAT.',
};

/** Beside the verification controls, where the choice is actually made. */
export const VERIFICATION_HINT =
  'Confirming SAT updates the original checklist. Choose NO SAT if it still is not right — the incident stays open.';
