/**
 * Recipients, triggers, and copy for notifications.
 * BACC has not specified who receives what — change this file, not trigger code.
 *
 * recipient: role name, 'assignee', 'reporter', or a user id.
 * alerting incidents: driven by DEFICIENCY_LEVELS[].alerting (all false until BACC defines levels).
 */
export const NOTIFICATION_RULES = [
  {
    event_type: 'incident_assigned',
    title: 'Incident assigned',
    body: '{ref} was assigned to you.',
    recipients: ['assignee'],
    inApp: true,
    email: true,
  },
  {
    event_type: 'incident_alerting_level',
    title: 'Incident raised at an alerting level',
    body: '{ref} was raised at {level}. Alerting levels are configuration pending BACC.',
    recipients: ['om', 'coo'],
    inApp: true,
    email: true,
  },
  {
    event_type: 'approval_required',
    title: 'Approval required',
    body: '{summary} is waiting for your approval.',
    recipients: ['assignee'],
    inApp: true,
    email: true,
  },
  {
    event_type: 'checklist_due',
    title: 'Checklist due',
    body: '{template} is due today.',
    recipients: ['assignee'],
    inApp: true,
    email: true,
  },
  {
    event_type: 'checklist_overdue',
    title: 'Checklist overdue',
    body: '{template} is overdue.',
    recipients: ['assignee', 'om'],
    inApp: true,
    email: true,
    /** Expected escalation (unconfirmed): inspector → supervisor → OM. */
    escalation: ['assignee', 'duty_manager', 'om'],
  },
  {
    event_type: 'work_order_assigned',
    title: 'Work order assigned',
    body: '{number} was assigned to {team}.',
    recipients: ['assignee'],
    inApp: true,
    email: true,
  },
  {
    event_type: 'work_order_awaiting_verification',
    title: 'Work order awaiting verification',
    body: '{number} completion record is ready for verification.',
    recipients: ['om', 'coo'],
    inApp: true,
    email: true,
  },
  {
    event_type: 'sla_imminent',
    title: 'SLA breach imminent',
    body: '{ref} target date is within the warning window.',
    recipients: ['assignee', 'om'],
    inApp: true,
    email: true,
  },
  {
    event_type: 'sla_breached',
    title: 'SLA breached',
    body: '{ref} has passed its target date.',
    recipients: ['assignee', 'om', 'coo'],
    inApp: true,
    email: true,
  },
];

export function ruleFor(eventType) {
  return NOTIFICATION_RULES.find((row) => row.event_type === eventType) ?? null;
}
