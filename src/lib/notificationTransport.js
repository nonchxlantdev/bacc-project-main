import { ruleFor } from '../config/notificationRules.js';
import { getStore, mutateStore, nowMs } from '../data/repositories/mock/store.js';

function interpolate(template, vars = {}) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

export const inAppTransport = {
  async send({ recipientIds, event_type, title, body, href }) {
    const at = new Date(nowMs()).toISOString();
    mutateStore((s) => {
      for (const recipient_id of recipientIds) {
        s.notifications.unshift({
          id: crypto.randomUUID(),
          recipient_id,
          event_type,
          entity_type: null,
          entity_id: null,
          title,
          body,
          href: href ?? null,
          read_at: null,
          created_at: at,
        });
      }
      return s;
    });
  },
};

/** Stub email provider — logs only. Swap this object when BACC names a vendor. */
export const emailTransport = {
  async send(message) {
    console.info('[emailTransport:stub]', {
      to: message.recipientIds,
      event_type: message.event_type,
      title: message.title,
      body: message.body,
    });
  },
};

export async function dispatchNotification({
  event_type,
  vars = {},
  recipientIds,
  href,
  title,
  body,
}) {
  const rule = ruleFor(event_type);
  const resolvedTitle = title || interpolate(rule?.title, vars);
  const resolvedBody = body || interpolate(rule?.body, vars);
  const ids = recipientIds?.length ? recipientIds : resolveRecipients(rule, vars);
  const payload = {
    event_type,
    title: resolvedTitle,
    body: resolvedBody,
    recipientIds: ids,
    href,
  };
  if (rule?.inApp !== false) await inAppTransport.send(payload);
  if (rule?.email) await emailTransport.send(payload);
}

function resolveRecipients(rule, vars) {
  if (!rule) return [];
  const users = getStore().users;
  const ids = [];
  for (const rec of rule.recipients) {
    if (rec === 'assignee' && vars.assigneeId) ids.push(vars.assigneeId);
    else if (rec === 'reporter' && vars.reporterId) ids.push(vars.reporterId);
    else {
      ids.push(...users.filter((u) => u.role === rec).map((u) => u.id));
    }
  }
  return [...new Set(ids)];
}
