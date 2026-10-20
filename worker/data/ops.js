/**
 * The data API's operation names. Pure constants, shared by the Worker routes
 * and the browser client (src/data/repositories/d1/client.js), which uses
 * READ_OPS to choose GET vs POST.
 */
export const READ_OPS = [
  'users.list',
  'users.listLogins',
  'users.getById',
  'users.getByEmail',
  'checklists.listMine',
  'checklists.listAll',
  'checklists.get',
  'approvals.list',
  'approvals.listInbox',
  'approvals.get',
  'instances.rules',
  'instances.list',
  'instances.getClock',
  'notifications.listForUser',
  'notifications.unreadCount',
  'settings.get',
  'settings.audit',
  'incidents.list',
  'incidents.get',
  'workOrders.listByIncident',
  'workOrders.get',
  'workOrders.listVisible',
];

export const WRITE_OPS = [
  'users.update',
  'checklists.persist',
  'checklists.deleteDraft',
  'checklists.recall',
  'checklists.amendItemResult',
  'checklists.acknowledge',
  'approvals.decide',
  'instances.generate',
  'notifications.markRead',
  'notifications.markAllRead',
  'settings.save',
  'settings.resetSection',
  'incidents.persist',
  'incidents.addUpdate',
  'workOrders.persist',
];
