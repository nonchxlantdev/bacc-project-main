/**
 * Optional sample history for demos and GitHub Pages.
 *
 * The default seed stays empty so Shamira's walkthrough can start from a clean
 * catalogue. This module layers realistic submissions, incidents, scheduling
 * occurrences, approvals, notifications, and activity on top without
 * touching generateSeed().
 */
import { addAirportDays, airportIso, airportYmd } from '../../lib/belizeTime.js';
import { emptyHeaderState, emptyItemState } from '../../lib/checklistSchema.js';
import { generatePendingInstances, linkSubmissionToInstance, refreshInstanceStatuses } from '../../lib/instanceGeneration.js';
import { targetDateFor } from '../../config/deficiencyLevels.js';
import { seedId } from './generateSeed.js';

/** Bump when showcase shape changes so a reload can refresh stale localStorage. */
export const SHOWCASE_VERSION = 2;

function padSeq(n) {
  return String(n).padStart(4, '0');
}

function formatIncidentRef(year, seq) {
  return `INC-${year}-${padSeq(seq)}`;
}

function formatNocNo(_year, seq) {
  return padSeq(seq);
}

function user(store, email) {
  return store.users.find((row) => row.email === email);
}

function template(store, registryKey) {
  return store.templates.find((row) => row.registry_key === registryKey);
}

function isoAt(store, offsetDays, time = '10:30:00.000') {
  const ms = Date.parse(store.demoNow) + offsetDays * 86400000;
  return airportIso(airportYmd(ms), time);
}

function ymdAt(store, offsetDays) {
  return airportYmd(Date.parse(store.demoNow) + offsetDays * 86400000);
}

/** Fill every header field the schema defines — keys differ per annex. */
function fillHeaderDefaults(schema, inspector, inspectionDate) {
  const conducted = `${inspector.full_name} / ${inspector.position}`;
  const header = emptyHeaderState(schema);

  for (const field of schema?.headerFields ?? []) {
    const key = field.key;
    const label = (field.label ?? '').toLowerCase();

    if (field.type === 'date' || key.includes('date') || label.includes('date')) {
      header[key] = inspectionDate;
      continue;
    }

    if (field.type === 'time' || key.includes('time') || label.includes('time')) {
      // Annex A NOTAM times are required on the form even when not used — midnight
      // reads as "not applicable" on a filed demo record without blocking the UI.
      header[key] = key.includes('notam') || label.includes('notam') ? '00:00' : '05:30';
      continue;
    }

    if (/conducted/i.test(key) || /conducted/i.test(label) || /personnel/i.test(label)) {
      header[key] = conducted;
      continue;
    }

    if (field.type === 'radio' && field.options?.length) {
      if (key === 'inspectionType' && field.options.some((o) => o.value === 'monthly_routine')) {
        header[key] = 'monthly_routine';
      } else if (key === 'typeOfInspection') {
        header[key] = 'morning_05_30';
      } else if (key === 'runwayInUse') {
        header[key] = '07';
      } else if (key === 'inspectionType') {
        header[key] = field.options[0].value;
      } else {
        header[key] = field.options[0].value;
      }
      continue;
    }

    if (field.type === 'yes_no') {
      header[key] = 'no';
      continue;
    }

    if (key === 'vehicleNo') {
      header[key] = 'PGIA-12';
      continue;
    }

    if (/weather|visibility/i.test(key) || /weather|visibility/i.test(label)) {
      header[key] = 'Clear, 10+ km';
      continue;
    }

    if (field.required && !String(header[key] ?? '').trim()) {
      header[key] = field.type === 'number' ? '0' : '—';
    }
  }

  return header;
}

function buildSubmission({
  id,
  tpl,
  inspector,
  status,
  inspectionDate,
  submittedAt,
  createdAt,
  updatedAt,
  itemPatches = {},
  signoffs = [],
}) {
  const schema = tpl.schema || tpl.content_schema;
  const header = fillHeaderDefaults(schema, inspector, inspectionDate);
  const items = emptyItemState(schema);
  for (const [code, patch] of Object.entries(itemPatches)) {
    if (items[code]) items[code] = { ...items[code], ...patch };
  }
  const locked = status !== 'draft';
  const stamp = createdAt || submittedAt || airportIso(inspectionDate);
  return {
    id,
    template_id: tpl.id,
    template_code: tpl.code,
    template_version: tpl.version || 'ed01',
    print_template_key: tpl.print_template_key || tpl.field_map?.templateKey,
    schema,
    field_map: tpl.field_map,
    location_id: null,
    inspector_id: inspector.id,
    inspector_name: inspector.full_name,
    inspection_type: header.inspectionType || 'monthly_routine',
    inspection_date: inspectionDate,
    rainfall_mm: null,
    status,
    deficiencies_summary: '',
    header,
    items,
    signoffs,
    locked,
    supersedes_id: null,
    pending_sync: false,
    created_at: stamp,
    submitted_at: status === 'draft' ? null : submittedAt,
    updatedAt: updatedAt || stamp,
  };
}

function buildSubmissionAt(store, opts) {
  const inspectionDate = opts.inspectionDate ?? ymdAt(store, opts.offsetDays ?? 0);
  const at = opts.submittedAt ?? isoAt(store, opts.offsetDays ?? 0);
  return buildSubmission({
    ...opts,
    inspectionDate,
    submittedAt: opts.status === 'draft' ? null : at,
    createdAt: at,
    updatedAt: at,
  });
}

function buildIncident(store, {
  n,
  title,
  status,
  level,
  source,
  submissionId,
  itemCode,
  itemText,
  section,
  inspector,
  reporter,
  assignedUnit = null,
  offsetDays = -10,
  closed = false,
}) {
  const year = Number(ymdAt(store, 0).slice(0, 4));
  const reportedAt = isoAt(store, offsetDays);
  const target = targetDateFor(level, ymdAt(store, offsetDays + 7));
  return {
    id: seedId('incident', n),
    year,
    seq: n,
    incident_ref: formatIncidentRef(year, n),
    noc_no: formatNocNo(year, n),
    submission_id: submissionId,
    checklist_item_id: null,
    source_template_code: source.code,
    source_section: section,
    source_item_code: itemCode,
    source_item_description: itemText,
    source_inspection_type: 'monthly_routine',
    source_inspection_date: ymdAt(store, offsetDays - 2),
    inspector_name: inspector.full_name,
    title,
    description: `Raised from ${source.code} item ${itemCode} during a routine inspection.`,
    deficiency_level: level,
    category: 'infrastructure',
    incident_type: 'deficiency',
    potential_impact: '',
    immediate_action_taken: '',
    location_label: itemText,
    latitude: null,
    longitude: null,
    location_accuracy_m: null,
    location_captured_at: null,
    location_capture_method: null,
    location_user_adjusted: false,
    status,
    reported_by: reporter.id,
    reported_by_name: reporter.full_name,
    reported_at: reportedAt,
    department: reporter.department,
    assigned_unit: assignedUnit,
    assigned_at: assignedUnit ? reportedAt : null,
    target_date: target,
    closed_at: closed ? isoAt(store, offsetDays + 14) : null,
    closure_notes: closed ? 'Cleared after corrective work and re-inspection.' : '',
    reinspection_submission_id: null,
    attachments: [],
    pending_sync: false,
    created_at: reportedAt,
  };
}

function pushApproval(store, { id, submissionId, status, assignedTo, offsetDays, notes = null }) {
  store.approvals.push({
    id,
    entity_type: 'checklist_submission',
    entity_id: submissionId,
    approval_role: 'om_acknowledgment',
    assigned_to: assignedTo,
    status,
    decided_by: status === 'pending' ? null : assignedTo,
    decided_at: status === 'pending' ? null : isoAt(store, offsetDays + 1),
    signature_image_path: status === 'approved' ? 'local-signature' : null,
    notes,
    created_at: isoAt(store, offsetDays),
  });
}

function pushNotification(store, { id, recipientId, title, body, href, offsetDays, read = false }) {
  store.notifications.push({
    id,
    recipient_id: recipientId,
    event_type: 'approval_required',
    entity_type: null,
    entity_id: null,
    title,
    body,
    href,
    read_at: read ? isoAt(store, offsetDays + 1) : null,
    created_at: isoAt(store, offsetDays),
  });
}

function pushActivity(store, { id, summary, actor, href, offsetDays }) {
  store.activity.push({
    id,
    summary,
    actor_name: actor.full_name,
    at: isoAt(store, offsetDays),
    href,
  });
}

/**
 * Populate `store` with sample records. Idempotent — safe to call more than once.
 */
export function applyShowcase(store) {
  if (store.showcaseLoaded && store.showcaseVersion === SHOWCASE_VERSION) return store;

  // Clear prior showcase payload so a version bump can refresh editable drafts.
  store.submissions = [];
  store.incidents = [];
  store.approvals = [];
  store.instances = [];
  store.notifications = [];
  store.activity = [];

  const glenrick = user(store, 'glenrick.spain@pgia.local');
  const michael = user(store, 'masevedo@pgiabelize.com');
  const andy = user(store, 'achable@pgiabelize.com');
  const kareem = user(store, 'kareemnunez24@gmail.com');
  const marsha = user(store, 'mhinkson@pgiabelize.com');
  const keagan = user(store, 'kmoore@pgiabelize.com');

  const annexD = template(store, 'annex-d-drainage');
  const annexA = template(store, 'annex-a-daily-routine-inspection-checklist');
  const annexE = template(store, 'annex-e-aerodrome-sign-inspection-checklist');
  const windCone = template(store, 'appendix-c08-wind-cone');
  const annexF = template(store, 'annex-f-unpaved-area-routine-inspection-checklist');

  const dr22Text =
    annexD.schema?.sections?.flatMap((s) => s.items)?.find((i) => i.code === 'DR-22')?.text ??
    'Drainage outlet blocked';

  const submissions = [
    buildSubmissionAt(store, {
      id: seedId('submission', 1),
      tpl: annexD,
      inspector: glenrick,
      status: 'draft',
      offsetDays: -2,
      itemPatches: {
        'DR-22': { result: 'no_sat', remarks: 'Outlet partially blocked — incident raised.' },
      },
    }),
    buildSubmissionAt(store, {
      id: seedId('submission', 2),
      tpl: annexA,
      inspector: michael,
      status: 'draft',
      offsetDays: -1,
    }),
    buildSubmissionAt(store, {
      id: seedId('submission', 3),
      tpl: annexE,
      inspector: andy,
      status: 'draft',
      offsetDays: -3,
    }),
    buildSubmissionAt(store, {
      id: seedId('submission', 4),
      tpl: windCone,
      inspector: glenrick,
      status: 'draft',
      offsetDays: -4,
      itemPatches: {
        'C08-01': { result: 'no_sat', remarks: 'Fabric torn at seam — see incident INC-2026-0004.' },
      },
    }),
    buildSubmissionAt(store, {
      id: seedId('submission', 5),
      tpl: annexF,
      inspector: kareem,
      status: 'draft',
      offsetDays: -1,
    }),
    buildSubmissionAt(store, {
      id: seedId('submission', 6),
      tpl: annexD,
      inspector: marsha,
      status: 'draft',
      offsetDays: 0,
    }),
  ];

  store.submissions = submissions;

  const today = ymdAt(store, 0);
  const nowMs = Date.parse(store.demoNow);
  let instances = generatePendingInstances({
    rules: store.assignment_rules,
    existing: [],
    fromYmd: addAirportDays(today, -120),
    toYmd: today,
    nowMs,
    idFactory: (n) => seedId('instance', n),
  });

  for (const sub of submissions.filter((s) => s.status === 'submitted' || s.status === 'acknowledged')) {
    instances = linkSubmissionToInstance(instances, sub);
  }

  store.instances = refreshInstanceStatuses(instances, nowMs);

  store.incidents = [
    buildIncident(store, {
      n: 1,
      title: `${dr22Text} — Runway 07 shoulder`,
      status: 'assigned',
      level: 2,
      source: annexD,
      submissionId: seedId('submission', 1),
      itemCode: 'DR-22',
      itemText: dr22Text,
      section: 'SECTION 3 — TAXIWAY AND APRON DRAINAGE',
      inspector: glenrick,
      reporter: michael,
      assignedUnit: 'grounds',
      offsetDays: -16,
    }),
    buildIncident(store, {
      n: 2,
      title: 'Apron edge lighting lens cracked — stand 4',
      status: 'open',
      level: 3,
      source: annexA,
      submissionId: seedId('submission', 2),
      itemCode: 'AR-12',
      itemText: 'Apron edge lighting serviceable',
      section: 'SECTION 2 — APRON',
      inspector: michael,
      reporter: michael,
      offsetDays: -4,
    }),
    buildIncident(store, {
      n: 3,
      title: 'Taxiway sign face faded — TWY C',
      status: 'in_progress',
      level: 1,
      source: annexE,
      submissionId: seedId('submission', 3),
      itemCode: 'SG-05',
      itemText: 'Taxiway guidance sign legible',
      section: 'SECTION 1 — SIGNS',
      inspector: andy,
      reporter: andy,
      assignedUnit: 'electrical',
      offsetDays: -8,
    }),
    buildIncident(store, {
      n: 4,
      title: 'Wind cone fabric torn — RWY 07',
      status: 'resolved',
      level: 2,
      source: windCone,
      submissionId: seedId('submission', 4),
      itemCode: 'WC-01',
      itemText: 'Wind cone assembly serviceable',
      section: 'WIND CONE',
      inspector: glenrick,
      reporter: keagan,
      assignedUnit: 'electrical',
      offsetDays: -20,
    }),
    buildIncident(store, {
      n: 5,
      title: 'Gravel erosion on TWY link — minor',
      status: 'closed',
      level: 1,
      source: annexF,
      submissionId: null,
      itemCode: 'UP-03',
      itemText: 'Taxiway shoulder free of erosion',
      section: 'SECTION 1 — UNPAVED AREAS',
      inspector: kareem,
      reporter: kareem,
      assignedUnit: 'civil',
      offsetDays: -45,
      closed: true,
    }),
  ];

  store.approvals = [];

  pushNotification(store, {
    id: seedId('notif', 1),
    recipientId: keagan.id,
    title: 'Incident assigned',
    body: 'INC-2026-0001 assigned to Grounds for follow-up.',
    href: `/incidents/${seedId('incident', 1)}`,
    offsetDays: -15,
  });
  pushNotification(store, {
    id: seedId('notif', 2),
    recipientId: michael.id,
    title: 'New deficiency logged',
    body: 'Apron edge lighting lens cracked — stand 4.',
    href: `/incidents/${seedId('incident', 2)}`,
    offsetDays: -4,
    read: true,
  });

  const activity = [
    {
      id: seedId('activity', 1),
      summary: 'Annex D drainage draft opened with a NO SAT item',
      actor: glenrick,
      href: `/checklists/${seedId('submission', 1)}`,
      offsetDays: -2,
    },
    {
      id: seedId('activity', 2),
      summary: 'Deficiency INC-2026-0001 assigned to Grounds',
      actor: keagan,
      href: `/incidents/${seedId('incident', 1)}`,
      offsetDays: -15,
    },
    {
      id: seedId('activity', 3),
      summary: 'Annex A daily routine inspection draft in progress',
      actor: michael,
      href: `/checklists/${seedId('submission', 2)}`,
      offsetDays: -1,
    },
    {
      id: seedId('activity', 4),
      summary: 'Wind cone inspection draft — fabric tear noted',
      actor: glenrick,
      href: `/checklists/${seedId('submission', 4)}`,
      offsetDays: -4,
    },
    {
      id: seedId('activity', 5),
      summary: 'Taxiway sign deficiency moved to In progress',
      actor: andy,
      href: `/incidents/${seedId('incident', 3)}`,
      offsetDays: -6,
    },
    {
      id: seedId('activity', 6),
      summary: 'Unpaved area incident INC-2026-0005 closed',
      actor: kareem,
      href: `/incidents/${seedId('incident', 5)}`,
      offsetDays: -30,
    },
  ];
  for (const row of activity) {
    pushActivity(store, row);
  }
  store.activity.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  store.showcaseLoaded = true;
  store.showcaseVersion = SHOWCASE_VERSION;
  return store;
}
