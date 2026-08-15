export function workOrderToOverlayValues(wo) {
  const values = {
    work_order_number: wo.work_order_number || '',
    date_issued: wo.date_issued ? String(wo.date_issued).slice(0, 10) : '',
    issued_by_name: wo.issued_by_name || '',
    assigned_to_name: wo.assigned_to_name || '',
    noc_reference_no: wo.noc_reference_no || '',
    deficiency_level: wo.deficiency_level != null ? String(wo.deficiency_level) : '',
    description_of_work: wo.description_of_work || '',
    location_text: wo.location_text || '',
    target_completion_date: wo.target_completion_date ? String(wo.target_completion_date).slice(0, 10) : '',
    notam_ref: wo.notam_ref || '',
    date_works_completed: wo.date_works_completed ? String(wo.date_works_completed).slice(0, 10) : '',
    completed_by: wo.completed_by || '',
    description_of_work_performed: wo.description_of_work_performed || '',
    materials_used: wo.materials_used || '',
    test_verification_results: wo.test_verification_results || '',
    area_not_cleared_explanation: wo.area_not_cleared_explanation || '',
    cec_clearance_date: wo.cec_clearance_date ? String(wo.cec_clearance_date).slice(0, 10) : '',
  };
  if (wo.notam_required === true) values['notam_required.yes'] = true;
  if (wo.notam_required === false) values['notam_required.no'] = true;
  if (wo.area_cleared_for_operations === true) values['area_cleared.yes'] = true;
  if (wo.area_cleared_for_operations === false) values['area_cleared.no'] = true;
  if (wo.cec_clearance_issued === true) values['cec_clearance.yes'] = true;
  if (wo.cec_clearance_issued === false) values['cec_clearance.no'] = true;

  const om = (wo.signoffs ?? []).find((s) => s.role === 'om_coo_verification');
  const cec = (wo.signoffs ?? []).find((s) => s.role === 'cec_clearance');
  if (om) {
    values.om_name = om.name || '';
    values.om_date = om.signed_at ? String(om.signed_at).slice(0, 10) : '';
  }
  if (cec) {
    values.cec_name = cec.name || '';
    values.cec_date = cec.signed_at ? String(cec.signed_at).slice(0, 10) : '';
  }
  return values;
}
