/**
 * Repository contracts. Mock and Supabase adapters must satisfy these shapes.
 * Report aggregations are defined here first so SQL views/RPC can match later.
 *
 * Methods marked `aggregation: true` are computed client-side in mock and should
 * become SQL views or RPC in Supabase — do not reimplement the math in the UI.
 */

/** @typedef {'mock' | 'supabase'} DataSource */

/**
 * @typedef {Object} UserProfile
 * @property {string} id
 * @property {string} email
 * @property {string} full_name
 * @property {string} position
 * @property {string} role
 * @property {string} department
 */

/**
 * @typedef {Object} ChecklistListItem
 * @property {string} id
 * @property {string} template_id
 * @property {string} template_code
 * @property {string} template_version
 * @property {string} inspector_id
 * @property {string} inspection_type
 * @property {string} inspection_date
 * @property {string} status
 * @property {boolean} locked
 * @property {object} schema
 * @property {object} header
 * @property {object} items
 * @property {object[]} signoffs
 */

/**
 * @typedef {Object} ApprovalRow
 * @property {string} id
 * @property {'checklist_submission'|'work_order'} entity_type
 * @property {string} entity_id
 * @property {'om_acknowledgment'|'om_coo_verification'|'cec_clearance'} approval_role
 * @property {string|null} assigned_to
 * @property {'pending'|'approved'|'rejected'} status
 * @property {string|null} decided_by
 * @property {string|null} decided_at
 * @property {string|null} signature_image_path
 * @property {string|null} notes
 * @property {string} created_at
 * @property {object} [entity]  relation: submission or work order summary
 */

/**
 * @typedef {Object} ChecklistInstance
 * @property {string} id
 * @property {string} template_id
 * @property {string} template_version
 * @property {string} assignment_rule_id
 * @property {string} assigned_role
 * @property {string} assigned_department
 * @property {string|null} assigned_user
 * @property {string} period_start
 * @property {string} period_end
 * @property {string} due_at
 * @property {'pending'|'in_progress'|'submitted'|'overdue'|'missed'} status
 * @property {string|null} submission_id
 */

/**
 * @typedef {Object} NotificationRow
 * @property {string} id
 * @property {string} recipient_id
 * @property {string} event_type
 * @property {string|null} entity_type
 * @property {string|null} entity_id
 * @property {string} title
 * @property {string} body
 * @property {string|null} href
 * @property {string|null} read_at
 * @property {string} created_at
 */

/**
 * @typedef {Object} ActivityItem
 * @property {string} id
 * @property {string} at
 * @property {string} actor_name
 * @property {string} summary
 * @property {string|null} href
 */

/**
 * @typedef {Object} ReportPeriodInput
 * @property {string} from  YYYY-MM-DD airport local
 * @property {string} to
 * @property {number} asOfMs
 * @property {string} [department]
 * @property {string} [templateId]
 */

/**
 * @typedef {Object} ReportKpis
 * @property {number} incidentsOpen
 * @property {number} checklistsDue
 * @property {number} approvalsPending
 * @property {{ incidentsOpen: number, checklistsDue: number, approvalsPending: number }} prior
 */

/**
 * @typedef {Object} CompletionRatePoint
 * @property {string} period
 * @property {string} templateCode
 * @property {number} due
 * @property {number} submitted
 * @property {number} rate
 */

/**
 * @typedef {Object} CompletionRateResult
 * @property {CompletionRatePoint[]} points
 * @property {{ templateCode: string, color: string }[]} series
 */

/**
 * @typedef {Object} CountByCategory
 * @property {string} key
 * @property {string} label
 * @property {number} count
 * @property {string} color
 */

/**
 * @typedef {Object} AgeingBucket
 * @property {string} bucket
 * @property {string} label
 * @property {number} count
 */

/**
 * @typedef {Object} SlaAdherence
 * @property {number} onTrack
 * @property {number} warning
 * @property {number} breached
 * @property {number} closedOnTime
 * @property {number} closedLate
 * @property {object[]} rows
 */

/**
 * @typedef {Object} MttrResult
 * @property {number|null} meanDays
 * @property {number} closedCount
 * @property {AgeingBucket[]} openAgeing
 */

/**
 * @typedef {Object} NocRegisterStatus
 * @property {number} open
 * @property {number} closed
 * @property {CountByCategory[]} byStatus
 */

/**
 * @typedef {Object} ReinspectionRate
 * @property {number} closed
 * @property {number} withSatReinspection
 * @property {number} rate
 */

/**
 * @typedef {Object} OverdueInspectionRow
 * @property {string} id
 * @property {string} templateCode
 * @property {string} assignee
 * @property {string} due_at
 * @property {string} status
 * @property {number} daysOverdue
 */

export const REPOSITORY_METHODS = {
  users: ['list', 'getById', 'getByEmail'],
  templates: ['list', 'get'],
  checklists: [
    'listMine',
    'listAll',
    'get',
    'persist',
    'deleteDraft',
    'acknowledge',
    'listQualifyingReinspections',
  ],
  incidents: ['list', 'get', 'persist', 'addUpdate'],
  workOrders: ['listByIncident', 'get', 'persist'],
  approvals: ['listInbox', 'get', 'decide'],
  instances: ['list', 'generate', 'advanceClock', 'getClock'],
  notifications: ['listForUser', 'unreadCount', 'markRead', 'markAllRead'],
  reports: [
    'kpis',
    'completionRate',
    'overdueInspections',
    'openDeficienciesByLevel',
    'incidentsByStatus',
    'deficiencyAgeing',
    'departmentOverview',
    'slaAdherence',
    'nocRegisterStatus',
    'reinspectionRate',
    'activityFeed',
  ],
};

export const REPORT_AGGREGATIONS = {
  kpis: {
    aggregation: true,
    input: '{ asOfMs, from, to, department? }',
    output: 'ReportKpis',
    supabase: 'view/rpc dashboard_kpis(as_of, dept)',
  },
  completionRate: {
    aggregation: true,
    input: 'ReportPeriodInput',
    output: 'CompletionRateResult',
    supabase: 'view checklist_completion_by_period',
  },
  overdueInspections: {
    aggregation: true,
    input: '{ asOfMs }',
    output: 'OverdueInspectionRow[]',
    supabase: 'view overdue_checklist_instances',
  },
  openDeficienciesByLevel: {
    aggregation: true,
    input: '{ asOfMs }',
    output: 'CountByCategory[]',
    supabase: 'view open_deficiencies_by_level',
  },
  incidentsByStatus: {
    aggregation: true,
    input: '{ asOfMs }',
    output: 'CountByCategory[]',
    supabase: 'view incidents_by_status',
  },
  deficiencyAgeing: {
    aggregation: true,
    input: '{ asOfMs }',
    output: 'MttrResult',
    supabase: 'rpc deficiency_ageing(as_of)',
  },
  departmentOverview: {
    aggregation: true,
    input: '{ asOfMs, from, to }',
    output: 'CountByCategory[]',
    supabase: 'view department_inspection_counts',
  },
  slaAdherence: {
    aggregation: true,
    input: '{ asOfMs }',
    output: 'SlaAdherence',
    supabase: 'rpc sla_adherence(as_of)',
  },
  nocRegisterStatus: {
    aggregation: true,
    input: 'ReportPeriodInput',
    output: 'NocRegisterStatus',
    supabase: 'view noc_register_status',
  },
  reinspectionRate: {
    aggregation: true,
    input: '{ asOfMs }',
    output: 'ReinspectionRate',
    supabase: 'view reinspection_verification_rate',
  },
  activityFeed: {
    aggregation: true,
    input: '{ limit }',
    output: 'ActivityItem[]',
    supabase: 'view activity_feed',
  },
};
