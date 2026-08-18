/**
 * Deterministic six-month Annex D demo dataset. Fixed IDs so deep links never dangle.
 * Checklists are PGIA-PMM-F04 only. Incidents / work orders exist only as the NOC and
 * Annex H records raised from those drainage deficiencies — not other annex programmes.
 * Every incident traces to a real NO SAT item; every closure to a later SAT re-inspection.
 */
import annexD from '../checklists/annex-d-drainage.json';
import annexDFieldMap from '../field-maps/annex-d-drainage-ed01.json';
import { flattenItems, emptyItemState } from '../../lib/checklistSchema.js';
import { airportIso } from '../../lib/belizeTime.js';
import { generatePendingInstances, refreshInstanceStatuses } from '../../lib/instanceGeneration.js';
import { TEMPLATE_REGISTRY } from '../templates/registry.js';

// Bumped to 5: the sign-in roster changed (Shamira Young / Glenrick Spain, with
// can_login), so saved demo stores must regenerate or the login screen would
// still offer the old accounts.
export const SEED_VERSION = 5;
export const SEED_AS_OF = '2026-08-15';
export const SEED_FROM = '2026-02-01';

export function seedId(bucket, n) {
  const code = {
    user: '8001',
    template: '8002',
    rule: '8003',
    submission: '8004',
    incident: '8005',
    wo: '8006',
    approval: '8007',
    notif: '8008',
    instance: '8009',
    update: '8010',
    activity: '8011',
  }[bucket];
  return `00000000-0000-4000-${code}-${String(n).padStart(12, '0')}`;
}

const ITEMS = flattenItems(annexD);

function allSat(overrides = {}) {
  const items = emptyItemState(annexD);
  for (const [code, row] of Object.entries(overrides)) {
    items[code] = { ...items[code], ...row };
  }
  return items;
}

function signoffs(inspector, date, om) {
  const rows = [
    {
      role: 'inspector',
      name: inspector.full_name,
      position: inspector.position,
      signed_at: airportIso(date, '16:10:00.000'),
      signature_data_uri: null,
    },
  ];
  if (om) {
    rows.push({
      role: 'om_acknowledgment',
      name: om.full_name,
      position: om.position,
      signed_at: airportIso(date, '17:40:00.000'),
      signature_data_uri: null,
    });
  }
  return rows;
}

export function generateSeed({ asOf = SEED_AS_OF } = {}) {
  const asOfMs = Date.parse(airportIso(asOf, '12:00:00.000'));

  // Exactly two accounts can sign in (can_login). The rest stay in the directory
  // because the seeded six months of Annex D history — signoffs, approvals,
  // incident assignments — reference them, and BACC §11 forbids rewriting a
  // submitted record's attribution. Removing them would orphan those records.
  const users = [
    u(1, 'maya.castillo@pgia.local', 'Maya Castillo', 'Maintenance Inspector', 'inspector', 'Maintenance'),
    u(2, 'luis.pena@pgia.local', 'Luis Peña', 'Maintenance Inspector', 'inspector', 'Maintenance'),
    u(3, 'elena.vasquez@pgia.local', 'Elena Vasquez', 'Duty Manager', 'duty_manager', 'Operations'),
    u(4, 'shamira.young@pgia.local', 'Shamira Young', 'Operations Manager', 'om', 'Operations', true),
    u(5, 'patricia.gomez@pgia.local', 'Patricia Gomez', 'Chief Operations Officer', 'coo', 'Operations'),
    u(6, 'marcus.chi@pgia.local', 'Marcus Chi', 'Civil Engineering Consultant', 'cec', 'Engineering'),
    u(7, 'glenrick.spain@pgia.local', 'Glenrick Spain', 'Electrical Maintenance Technician', 'electrical_tech', 'Engineering', true),
  ];
  const byRole = (role) => users.find((row) => row.role === role);
  const inspector = byRole('inspector');
  const om = byRole('om');
  const coo = byRole('coo');
  const cec = byRole('cec');

  // Templates come from the registry, not hardcoded here — adding a form is one
  // registry entry. See src/data/templates/registry.js.
  const templates = TEMPLATE_REGISTRY.map((entry, i) => ({
    id: seedId('template', i + 1),
    code: entry.code,
    version: entry.version,
    title: entry.title,
    annex_label: entry.annexLabel,
    document_family: entry.family,
    manual: entry.manual,
    department: entry.department,
    default_frequency: entry.defaultFrequency,
    content_schema: entry.schema,
    schema: entry.schema,
    field_map: entry.fieldMap,
    base_pdf_path: entry.fieldMap.basePdf,
    print_template_key: entry.fieldMap.templateKey,
    registry_key: entry.key,
    status: 'active',
  }));
  const templateByKey = (key) => templates.find((t) => t.registry_key === key);
  // Seeded submissions are Annex D only; other templates exist as catalogue
  // entries with assignment rules but no historical submissions yet.
  const template = templateByKey('annex-d-drainage');

  let ruleSeq = 0;
  const assignment_rules = TEMPLATE_REGISTRY.flatMap((entry) => {
    const tpl = templateByKey(entry.key);
    return entry.assignments.map((a) => {
      ruleSeq += 1;
      const assignee = users.find((row) => row.role === a.role);
      return {
        id: seedId('rule', ruleSeq),
        template_id: tpl.id,
        template_version: entry.version,
        department: a.department,
        role: a.role,
        frequency: a.frequency,
        assigned_user: assignee?.id ?? null,
      };
    });
  });

  function submission({ n, date, type, status, items, rainfall, deficiencies, acknowledged }) {
    const locked = status !== 'draft';
    return {
      id: seedId('submission', n),
      template_id: template.id,
      template_code: template.code,
      template_version: 'ed01',
      print_template_key: template.print_template_key,
      schema: annexD,
      field_map: annexDFieldMap,
      location_id: null,
      inspector_id: inspector.id,
      inspector_name: inspector.full_name,
      inspection_type: type,
      inspection_date: date,
      rainfall_mm: rainfall ?? null,
      status,
      deficiencies_summary: deficiencies ?? '',
      header: {
        date,
        inspectionType: type,
        conductedBy: `${inspector.full_name} / ${inspector.position}`,
        rainfallMm: rainfall ?? '',
      },
      items,
      signoffs: signoffs(inspector, date, acknowledged ? om : null),
      locked,
      supersedes_id: null,
      pending_sync: false,
      created_at: airportIso(date, '07:30:00.000'),
      submitted_at: locked ? airportIso(date, '16:15:00.000') : null,
      updatedAt: airportIso(date, '16:15:00.000'),
    };
  }

  const submissions = [
    submission({
      n: 1,
      date: '2026-02-27',
      type: 'monthly_routine',
      status: 'acknowledged',
      items: allSat(),
      acknowledged: true,
    }),
    submission({
      n: 2,
      date: '2026-03-15',
      type: 'semi_annual_cec',
      status: 'acknowledged',
      items: allSat({
        'DR-17': {
          result: 'no_sat',
          remarks: 'Culvert at [Location 1] invert silted; headwall hairline crack on east wing.',
        },
      }),
      deficiencies: 'DR-17 culvert silted with hairline crack — NOC raised.',
      rainfall: 18,
      acknowledged: true,
    }),
    submission({
      n: 3,
      date: '2026-03-28',
      type: 'monthly_routine',
      status: 'acknowledged',
      items: allSat({
        'DR-04': {
          result: 'no_sat',
          remarks: 'Runway west edge channel blocked by vegetation near RWY 25 end.',
        },
      }),
      deficiencies: 'DR-04 west edge blockage — NOC raised.',
      acknowledged: true,
    }),
    submission({
      n: 4,
      date: '2026-04-12',
      type: 'post_storm_emergency',
      status: 'acknowledged',
      items: allSat({
        'DR-01': {
          result: 'no_sat',
          remarks: 'Runway 07 end swale filled with storm debris after overnight rainfall.',
        },
      }),
      deficiencies: 'Post-storm debris at RWY 07 swale.',
      rainfall: 62,
      acknowledged: true,
    }),
    submission({
      n: 5,
      date: '2026-04-29',
      type: 'monthly_routine',
      status: 'acknowledged',
      items: allSat(),
      acknowledged: true,
    }),
    submission({
      n: 6,
      date: '2026-05-30',
      type: 'monthly_routine',
      status: 'acknowledged',
      items: allSat(),
      acknowledged: true,
    }),
    submission({
      n: 7,
      date: '2026-06-08',
      type: 'post_storm_emergency',
      status: 'acknowledged',
      items: allSat({
        'DR-08': {
          result: 'no_sat',
          remarks: 'Taxiway Alpha west channel scoured; standing water remaining 40 min after rain.',
        },
      }),
      deficiencies: 'TWY A west channel scour after storm.',
      rainfall: 48,
      acknowledged: true,
    }),
    submission({
      n: 8,
      date: '2026-06-27',
      type: 'monthly_routine',
      status: 'acknowledged',
      items: allSat({
        'DR-13': {
          result: 'no_sat',
          remarks: 'Apron drainage channel at stand 4 obstructed by rubber and silt.',
        },
      }),
      deficiencies: 'Apron stand 4 channel obstruction.',
      acknowledged: true,
    }),
    submission({
      n: 9,
      date: '2026-07-30',
      type: 'monthly_routine',
      status: 'submitted',
      items: allSat({
        'DR-22': {
          result: 'no_sat',
          remarks: 'Open channel in runway strip south of TWY B vegetated and holding water.',
        },
      }),
      deficiencies: 'Strip channel vegetation south of TWY B.',
      acknowledged: false,
    }),
    submission({
      n: 10,
      date: '2026-08-10',
      type: 'monthly_routine',
      status: 'draft',
      items: allSat(),
      acknowledged: false,
    }),
  ];

  const itemByCode = Object.fromEntries(ITEMS.map((item) => [item.code, item]));

  function incident({
    n,
    seq,
    submission: src,
    code,
    level,
    status,
    title,
    description,
    assigned,
    target,
    closed,
    reinspection,
    reportedOffset = '09:20:00.000',
  }) {
    const year = 2026;
    const srcItem = itemByCode[code];
    const row = src.items[code];
    return {
      id: seedId('incident', n),
      year,
      seq,
      incident_ref: `INC-${year}-${String(seq).padStart(4, '0')}`,
      noc_no: String(seq).padStart(4, '0'),
      submission_id: src.id,
      checklist_item_id: null,
      source_template_code: src.template_code,
      source_section: srcItem?.sectionTitle,
      source_item_code: code,
      source_item_description: srcItem?.text,
      source_inspection_type: src.inspection_type,
      source_inspection_date: src.inspection_date,
      inspector_name: inspector.full_name,
      title,
      description: description || row?.remarks || title,
      deficiency_level: level,
      category: 'drainage',
      incident_type: 'drainage',
      potential_impact: 'Airside drainage performance',
      immediate_action_taken: status === 'open' ? '' : 'Crew notified; work order issued.',
      location_label: row?.remarks || srcItem?.text || code,
      latitude: 17.539 + n * 0.001,
      longitude: -88.308 - n * 0.001,
      location_accuracy_m: 8,
      location_captured_at: airportIso(src.inspection_date, reportedOffset),
      location_capture_method: 'map_pin',
      location_user_adjusted: true,
      status,
      reported_by: inspector.id,
      reported_by_name: inspector.full_name,
      reported_at: airportIso(src.inspection_date, reportedOffset),
      department: 'Maintenance',
      assigned_to: assigned?.id ?? null,
      assigned_team: assigned?.team ?? null,
      assigned_to_name: assigned?.name ?? '',
      assigned_at: assigned ? airportIso(src.inspection_date, '11:00:00.000') : null,
      target_date: target,
      closed_at: closed ? airportIso(closed, '15:00:00.000') : null,
      closure_notes: closed ? 'Verified closed after SAT re-inspection.' : '',
      reinspection_submission_id: reinspection?.id ?? null,
      attachments: [],
      updates: [],
      pending_sync: false,
      created_at: airportIso(src.inspection_date, reportedOffset),
    };
  }

  const incidents = [
    incident({
      n: 1,
      seq: 1,
      submission: submissions[1],
      code: 'DR-17',
      level: 3,
      status: 'closed',
      title: 'Culvert [Location 1] silted with headwall crack',
      assigned: { id: cec.id, name: cec.full_name, team: 'cec' },
      target: '2026-04-15',
      closed: '2026-07-30',
      reinspection: submissions[8],
    }),
    incident({
      n: 2,
      seq: 2,
      submission: submissions[2],
      code: 'DR-04',
      level: 2,
      status: 'closed',
      title: 'Runway west edge channel blocked near RWY 25',
      assigned: { id: cec.id, name: cec.full_name, team: 'cec' },
      target: '2026-04-20',
      closed: '2026-04-29',
      reinspection: submissions[4],
    }),
    incident({
      n: 3,
      seq: 3,
      submission: submissions[3],
      code: 'DR-01',
      level: 3,
      status: 'in_progress',
      title: 'RWY 07 end swale storm debris',
      assigned: { id: inspector.id, name: 'Maintenance Personnel', team: 'maintenance' },
      target: '2026-08-18',
    }),
    incident({
      n: 4,
      seq: 4,
      submission: submissions[6],
      code: 'DR-08',
      level: 4,
      status: 'assigned',
      title: 'Taxiway Alpha west channel scour',
      assigned: { id: cec.id, name: cec.full_name, team: 'cec' },
      target: '2026-08-12',
    }),
    incident({
      n: 5,
      seq: 5,
      submission: submissions[7],
      code: 'DR-13',
      level: 1,
      status: 'open',
      title: 'Apron stand 4 drainage channel obstructed',
      target: '2026-09-01',
    }),
    incident({
      n: 6,
      seq: 6,
      submission: submissions[8],
      code: 'DR-22',
      level: 2,
      status: 'resolved',
      title: 'Runway strip channel vegetated south of TWY B',
      assigned: { id: inspector.id, name: 'Maintenance Personnel', team: 'maintenance' },
      target: '2026-08-20',
    }),
  ];

  incidents[0].updates = [
    {
      id: seedId('update', 1),
      incident_id: incidents[0].id,
      author_id: om.id,
      author_name: om.full_name,
      body: 'Status changed to Verified/Closed.',
      status_from: 'resolved',
      status_to: 'closed',
      created_at: incidents[0].closed_at,
    },
  ];

  function wo({ n, incident: inc, number, issued, status, assignedName, extras = {} }) {
    const verified = status === 'verified';
    const completed = status === 'completed' || verified;
    return {
      id: seedId('wo', n),
      incident_id: inc.id,
      work_order_number: number,
      date_issued: issued,
      issued_by: om.id,
      issued_by_name: om.full_name,
      assigned_to_name: assignedName,
      assigned_to_user: extras.assigned_to_user ?? null,
      noc_reference_no: inc.noc_no,
      deficiency_level: inc.deficiency_level,
      description_of_work: inc.title,
      location_text: inc.location_label,
      target_completion_date: inc.target_date,
      notam_required: extras.notam_required ?? false,
      notam_ref: extras.notam_ref ?? '',
      cec_clearance_required: extras.cec_clearance_required ?? /cec/i.test(assignedName),
      date_works_completed: completed ? extras.completed_date ?? inc.target_date : null,
      completed_by: completed ? assignedName : '',
      description_of_work_performed: completed ? extras.performed ?? 'Corrective works completed per description.' : '',
      materials_used: completed ? extras.materials ?? 'Labour, hand tools' : '',
      test_verification_results: completed ? extras.test ?? 'Visual confirmation of free flow' : '',
      area_cleared_for_operations: extras.area_cleared_for_operations ?? (completed ? true : null),
      area_not_cleared_explanation: extras.area_not_cleared_explanation ?? '',
      cec_clearance_issued: extras.cec_clearance_issued ?? (verified && extras.cec_clearance_required ? true : null),
      cec_clearance_date: extras.cec_clearance_date ?? null,
      status,
      exported_pdf_path: verified ? `${number}.pdf` : null,
      locked: verified,
      signoffs: extras.signoffs ?? [],
      pending_sync: false,
      created_at: airportIso(issued, '10:00:00.000'),
    };
  }

  const work_orders = [
    wo({
      n: 1,
      incident: incidents[0],
      number: 'WO-2026-0001',
      issued: '2026-03-16',
      status: 'verified',
      assignedName: 'CEC',
      extras: {
        cec_clearance_required: true,
        cec_clearance_issued: true,
        cec_clearance_date: '2026-04-10',
        completed_date: '2026-04-08',
        assigned_to_user: cec.id,
        signoffs: [
          {
            role: 'om_coo_verification',
            name: om.full_name,
            signed_at: airportIso('2026-04-10', '14:00:00.000'),
          },
          {
            role: 'cec_clearance',
            name: cec.full_name,
            signed_at: airportIso('2026-04-10', '11:00:00.000'),
          },
        ],
      },
    }),
    wo({
      n: 2,
      incident: incidents[1],
      number: 'WO-2026-0002',
      issued: '2026-03-28',
      status: 'verified',
      assignedName: 'CEC',
      extras: {
        cec_clearance_required: true,
        cec_clearance_issued: true,
        cec_clearance_date: '2026-04-22',
        completed_date: '2026-04-21',
        assigned_to_user: cec.id,
        signoffs: [
          {
            role: 'om_coo_verification',
            name: om.full_name,
            signed_at: airportIso('2026-04-22', '15:00:00.000'),
          },
          { role: 'cec_clearance', name: cec.full_name, signed_at: airportIso('2026-04-22', '09:30:00.000') },
        ],
      },
    }),
    wo({
      n: 3,
      incident: incidents[2],
      number: 'WO-2026-0003',
      issued: '2026-04-12',
      status: 'in_progress',
      assignedName: 'Maintenance Personnel',
      extras: { cec_clearance_required: false, assigned_to_user: inspector.id },
    }),
    wo({
      n: 4,
      incident: incidents[3],
      number: 'WO-2026-0004',
      issued: '2026-06-09',
      status: 'issued',
      assignedName: 'CEC',
      extras: {
        notam_required: true,
        notam_ref: 'A0124/26',
        cec_clearance_required: true,
        assigned_to_user: cec.id,
      },
    }),
    wo({
      n: 5,
      incident: incidents[5],
      number: 'WO-2026-0005',
      issued: '2026-07-31',
      status: 'completed',
      assignedName: 'Maintenance Personnel',
      extras: {
        cec_clearance_required: false,
        cec_clearance_issued: false,
        completed_date: '2026-08-12',
        area_cleared_for_operations: true,
        assigned_to_user: inspector.id,
      },
    }),
  ];

  const approvals = [
    {
      id: seedId('approval', 1),
      entity_type: 'checklist_submission',
      entity_id: submissions[8].id,
      approval_role: 'om_acknowledgment',
      assigned_to: om.id,
      status: 'pending',
      decided_by: null,
      decided_at: null,
      signature_image_path: null,
      notes: null,
      created_at: submissions[8].submitted_at,
    },
    {
      id: seedId('approval', 2),
      entity_type: 'work_order',
      entity_id: work_orders[4].id,
      approval_role: 'om_coo_verification',
      assigned_to: om.id,
      status: 'pending',
      decided_by: null,
      decided_at: null,
      signature_image_path: null,
      notes: null,
      created_at: airportIso('2026-08-12', '16:00:00.000'),
    },
    {
      id: seedId('approval', 3),
      entity_type: 'checklist_submission',
      entity_id: submissions[5].id,
      approval_role: 'om_acknowledgment',
      assigned_to: om.id,
      status: 'approved',
      decided_by: om.id,
      decided_at: airportIso('2026-05-31', '09:00:00.000'),
      signature_image_path: null,
      notes: null,
      created_at: submissions[5].submitted_at,
    },
  ];

  let instances = generatePendingInstances({
    rules: assignment_rules,
    existing: [],
    fromYmd: SEED_FROM,
    toYmd: asOf,
    nowMs: asOfMs,
    idFactory: (n) => seedId('instance', n),
  });

  const extraInstances = [
    {
      id: seedId('instance', 80),
      template_id: template.id,
      template_version: 'ed01',
      assignment_rule_id: seedId('rule', 3),
      assigned_role: 'inspector',
      assigned_department: 'Maintenance',
      assigned_user: inspector.id,
      location_id: null,
      period_start: '2026-08-15',
      period_end: '2026-08-15',
      due_at: airportIso('2026-08-15', '23:59:59.999'),
      status: 'pending',
      submission_id: null,
      created_at: airportIso('2026-08-14', '06:00:00.000'),
    },
    {
      id: seedId('instance', 81),
      template_id: template.id,
      template_version: 'ed01',
      assignment_rule_id: seedId('rule', 3),
      assigned_role: 'inspector',
      assigned_department: 'Maintenance',
      assigned_user: inspector.id,
      location_id: null,
      period_start: '2026-08-08',
      period_end: '2026-08-08',
      due_at: airportIso('2026-08-08', '23:59:59.999'),
      status: 'overdue',
      submission_id: null,
      created_at: airportIso('2026-08-01', '06:00:00.000'),
    },
    {
      id: seedId('instance', 82),
      template_id: template.id,
      template_version: 'ed01',
      assignment_rule_id: seedId('rule', 1),
      assigned_role: 'inspector',
      assigned_department: 'Maintenance',
      assigned_user: inspector.id,
      location_id: null,
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      due_at: airportIso('2026-01-31', '23:59:59.999'),
      status: 'missed',
      submission_id: null,
      created_at: airportIso('2026-01-01', '06:00:00.000'),
    },
  ];

  const monthlySubs = submissions.filter((s) => s.inspection_type === 'monthly_routine' && s.status !== 'draft');
  instances = instances.map((row) => {
    if (row.assignment_rule_id !== seedId('rule', 1)) return row;
    const hit = monthlySubs.find((s) => s.inspection_date >= row.period_start && s.inspection_date <= row.period_end);
    if (!hit) return row;
    return { ...row, submission_id: hit.id, status: 'submitted' };
  });
  const august = instances.find(
    (row) => row.assignment_rule_id === seedId('rule', 1) && row.period_start === '2026-08-01',
  );
  if (august && submissions[9]) {
    august.submission_id = submissions[9].id;
    august.status = 'in_progress';
  }

  instances = refreshInstanceStatuses([...instances, ...extraInstances], asOfMs);

  const notifications = buildNotifications({ users, om, inspector, coo, cec, submissions, incidents, work_orders, asOf });

  const activity = [
    act(1, '2026-08-12T16:00:00.000-06:00', inspector.full_name, 'Completed work order WO-2026-0005', `/incidents/${incidents[5].id}`),
    act(2, '2026-08-10T07:30:00.000-06:00', inspector.full_name, 'Started August Annex D draft', `/checklists/${submissions[9].id}`),
    act(3, '2026-07-30T16:15:00.000-06:00', inspector.full_name, 'Submitted July Annex D inspection', `/checklists/${submissions[8].id}`),
    act(4, '2026-07-30T15:00:00.000-06:00', om.full_name, 'Closed INC-2026-0001 after SAT re-inspection', `/incidents/${incidents[0].id}`),
    act(5, '2026-06-27T16:15:00.000-06:00', inspector.full_name, 'Raised INC-2026-0005 from DR-13', `/incidents/${incidents[4].id}`),
    act(6, '2026-06-09T10:00:00.000-06:00', om.full_name, 'Issued WO-2026-0004 (NOTAM A0124/26)', `/incidents/${incidents[3].id}`),
    act(7, '2026-05-31T09:00:00.000-06:00', om.full_name, 'Acknowledged May Annex D inspection', `/checklists/${submissions[5].id}`),
    act(8, '2026-04-29T16:15:00.000-06:00', inspector.full_name, 'SAT re-inspection of DR-04', `/checklists/${submissions[4].id}`),
  ];

  return {
    seedVersion: SEED_VERSION,
    demoNow: airportIso(asOf, '12:00:00.000'),
    users,
    templates,
    assignment_rules,
    submissions,
    incidents,
    work_orders,
    approvals,
    instances,
    notifications,
    activity,
    projects: [],
  };
}

function u(n, email, full_name, position, role, department, can_login = false) {
  return {
    id: seedId('user', n),
    email,
    full_name,
    position,
    role,
    department,
    can_login,
  };
}

function act(n, at, actor_name, summary, href) {
  return { id: seedId('activity', n), at, actor_name, summary, href };
}

function buildNotifications({ users, om, inspector, coo, cec, submissions, incidents, work_orders, asOf }) {
  const jul = submissions[8];
  const wo5 = work_orders[4];
  const inc3 = incidents[2];
  const inc4 = incidents[3];
  const inc6 = incidents[5];
  let i = 0;
  const n = (recipient_id, event_type, title, body, href, created_at, read_at = null) => {
    i += 1;
    return {
      id: seedId('notif', i),
      recipient_id,
      event_type,
      entity_type: href?.startsWith('/incidents') ? 'incident' : href?.startsWith('/checklists') ? 'checklist_submission' : 'approval',
      entity_id: null,
      title,
      body,
      href,
      read_at,
      created_at,
    };
  };

  return [
    n(om.id, 'approval_required', 'Approval required', 'July Annex D inspection is waiting for OM acknowledgment.', `/approvals`, airportIso('2026-07-30', '16:20:00.000'), null),
    n(om.id, 'work_order_awaiting_verification', 'Work order awaiting verification', `${wo5.work_order_number} completion record is ready for verification.`, `/approvals`, airportIso('2026-08-12', '16:05:00.000'), null),
    n(om.id, 'sla_imminent', 'SLA breach imminent', `${inc3.incident_ref} target date is within the warning window.`, `/incidents/${inc3.id}`, airportIso('2026-08-15', '07:00:00.000'), null),
    n(om.id, 'sla_breached', 'SLA breached', `${inc4.incident_ref} has passed its target date.`, `/incidents/${inc4.id}`, airportIso('2026-08-13', '08:00:00.000'), null),
    n(om.id, 'checklist_overdue', 'Checklist overdue', 'Annex D follow-up inspection is overdue.', `/checklists/mine`, airportIso('2026-08-09', '06:05:00.000'), airportIso('2026-08-09', '09:00:00.000')),
    n(inspector.id, 'checklist_due', 'Checklist due', 'Annex D drainage inspection is due today.', `/checklists/mine`, airportIso(asOf, '06:00:00.000'), null),
    n(inspector.id, 'checklist_overdue', 'Checklist overdue', 'Annex D follow-up inspection is overdue.', `/checklists/mine`, airportIso('2026-08-09', '06:05:00.000'), null),
    n(inspector.id, 'work_order_assigned', 'Work order assigned', `${wo5.work_order_number} was assigned to Maintenance Personnel.`, `/incidents/${inc6.id}`, airportIso('2026-07-31', '10:05:00.000'), airportIso('2026-07-31', '11:00:00.000')),
    n(inspector.id, 'incident_assigned', 'Incident assigned', `${inc3.incident_ref} was assigned to you.`, `/incidents/${inc3.id}`, airportIso('2026-04-12', '11:05:00.000'), airportIso('2026-04-12', '12:00:00.000')),
    n(cec.id, 'work_order_assigned', 'Work order assigned', `WO-2026-0004 was assigned to CEC.`, `/incidents/${inc4.id}`, airportIso('2026-06-09', '10:05:00.000'), null),
    n(cec.id, 'incident_assigned', 'Incident assigned', `${inc4.incident_ref} was assigned to you.`, `/incidents/${inc4.id}`, airportIso('2026-06-08', '11:05:00.000'), null),
    n(coo.id, 'sla_breached', 'SLA breached', `${inc4.incident_ref} has passed its target date.`, `/incidents/${inc4.id}`, airportIso('2026-08-13', '08:00:00.000'), null),
    n(coo.id, 'approval_required', 'Approval required', `${wo5.work_order_number} is waiting for OM/COO verification.`, `/approvals`, airportIso('2026-08-12', '16:05:00.000'), null),
  ];
}

export function findSeedUserByEmail(email) {
  return generateSeed().users.find((row) => row.email === email) ?? null;
}
