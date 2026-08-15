import { queueHandlers as submissionHandlers } from './submissions.js';
import { insertIncidentUpdateRemote, upsertIncidentRemote } from './incidents.js';
import { upsertWorkOrderRemote } from './workOrders.js';

export const queueHandlers = {
  ...submissionHandlers,
  upsert_incident: upsertIncidentRemote,
  insert_incident_update: insertIncidentUpdateRemote,
  upsert_work_order: upsertWorkOrderRemote,
};
