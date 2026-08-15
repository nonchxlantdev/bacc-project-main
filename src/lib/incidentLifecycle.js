export const INCIDENT_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Verified/Closed' },
];

export const WORK_ORDER_STATUSES = [
  { value: 'issued', label: 'Issued' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'verified', label: 'Verified' },
];

const INCIDENT_FLOW = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];

export function incidentStatusLabel(status) {
  return INCIDENT_STATUSES.find((row) => row.value === status)?.label ?? status;
}

export function workOrderStatusLabel(status) {
  return WORK_ORDER_STATUSES.find((row) => row.value === status)?.label ?? status;
}

export function incidentStepIndex(status) {
  const i = INCIDENT_FLOW.indexOf(status);
  return i < 0 ? 0 : i;
}

/**
 * Closure and assignment gates. Do not infer urgency from deficiency_level.
 */
export function incidentTransitionBlockers(incident, toStatus, { workOrders = [], reinspection } = {}) {
  const blockers = [];
  if (toStatus === 'assigned' || (toStatus === 'in_progress' && incident.status === 'open')) {
    if (!incident.assigned_to && !incident.assigned_team && !incident.assigned_to_name) {
      blockers.push('Assign a person or team before leaving Open.');
    }
    if (!incident.target_date) {
      blockers.push('Set a target date before leaving Open.');
    }
  }
  if (toStatus === 'resolved') {
    const done = workOrders.some((wo) => wo.status === 'completed' || wo.status === 'verified');
    if (!done) {
      blockers.push('Fill in a work-order completion record before marking Resolved.');
    }
  }
  if (toStatus === 'closed') {
    if (!incident.reinspection_submission_id && !reinspection) {
      blockers.push(
        'Verified/Closed requires a linked re-inspection of the same template where this item came back SAT.',
      );
    }
  }
  return blockers;
}

export function workOrderVerifiedBlockers(wo) {
  const blockers = [];
  if (wo.area_cleared_for_operations === false) {
    blockers.push('Area is not cleared for operations. Verification is blocked until the area is cleared.');
  }
  if (wo.notam_required === true && !String(wo.notam_ref ?? '').trim()) {
    blockers.push('NOTAM is required but no NOTAM reference is recorded.');
  }
  if (wo.cec_clearance_required && wo.cec_clearance_issued !== true) {
    blockers.push('CEC written clearance is required and has not been issued.');
  }
  return blockers;
}

export function isQualifyingReinspection(submission, incident) {
  if (!submission || !incident) return false;
  if (submission.status === 'draft') return false;
  if (submission.template_code && incident.source_template_code) {
    if (submission.template_code !== incident.source_template_code) return false;
  }
  const item = submission.items?.[incident.source_item_code];
  if (item?.result !== 'sat') return false;
  const date = submission.inspection_date || submission.header?.date;
  if (!date || !incident.reported_at) return true;
  return String(date) >= String(incident.reported_at).slice(0, 10);
}
