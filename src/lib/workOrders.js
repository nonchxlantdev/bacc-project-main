import { airportYmd } from './belizeTime.js';

export function newWorkOrderId() {
  return crypto.randomUUID();
}

export function buildWorkOrderFromIncident(incident, user, profile) {
  const today = airportYmd(Date.now());
  const year = Number(today.slice(0, 4));
  const cecRequired = /cec/i.test(incident.assigned_team || incident.assigned_to_name || '');
  return {
    id: newWorkOrderId(),
    incident_id: incident.id,
    work_order_number: `WO-${year}-TEMP-${crypto.randomUUID().slice(0, 6)}`,
    date_issued: today,
    issued_by: user?.id ?? null,
    issued_by_name: profile?.full_name || user?.email || '',
    assigned_to_name: incident.assigned_to_name || incident.assigned_team || '',
    assigned_to_user: incident.assigned_to || null,
    noc_reference_no: incident.noc_no || incident.incident_ref,
    deficiency_level: incident.deficiency_level,
    description_of_work: incident.title || incident.description,
    location_text: incident.location_label,
    target_completion_date: incident.target_date || null,
    notam_required: false,
    notam_ref: '',
    cec_clearance_required: cecRequired,
    date_works_completed: null,
    completed_by: '',
    description_of_work_performed: '',
    materials_used: '',
    test_verification_results: '',
    area_cleared_for_operations: null,
    area_not_cleared_explanation: '',
    cec_clearance_issued: null,
    cec_clearance_date: null,
    status: 'issued',
    exported_pdf_path: null,
    locked: false,
    signoffs: [],
    pending_sync: false,
    created_at: new Date().toISOString(),
  };
}

export async function persistWorkOrder(record) {
  return getRepos().workOrders.persist(record);
}

export async function listWorkOrders(incidentId) {
  return getRepos().workOrders.listByIncident(incidentId);
}

export async function getWorkOrder(id) {
  return getRepos().workOrders.get(id);
}

export async function upsertWorkOrderRemote(record) {
  return getRepos().workOrders.persist(record);
}
