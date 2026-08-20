function stub(name) {
  return async function notWired() {
    throw new Error(`Supabase adapter is not wired (${name}). Set VITE_DATA_SOURCE=mock for the demo.`);
  };
}

function stubRepo(methods) {
  const repo = {};
  for (const method of methods) repo[method] = stub(method);
  return repo;
}

export function createSupabaseRepositories() {
  return {
    users: stubRepo(['list', 'getById', 'getByEmail']),
    templates: stubRepo(['list', 'get']),
    checklists: stubRepo([
      'listMine',
      'listAll',
      'get',
      'persist',
      'amendItemResult',
      'deleteDraft',
      'acknowledge',
      'listQualifyingReinspections',
    ]),
    incidents: stubRepo(['list', 'get', 'persist', 'addUpdate']),
    workOrders: stubRepo(['listByIncident', 'get', 'persist']),
    approvals: stubRepo(['listInbox', 'get', 'decide']),
    instances: stubRepo(['list', 'generate', 'advanceClock', 'getClock', 'resetDemo']),
    notifications: stubRepo(['listForUser', 'unreadCount', 'markRead', 'markAllRead']),
    reports: stubRepo([
      'kpis',
      'teamCompliance',
      'onTimeByWeek',
      'lateCompletions',
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
    ]),
  };
}
