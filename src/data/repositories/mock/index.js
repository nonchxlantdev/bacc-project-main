import { CATEGORICAL, DEPARTMENT_COLORS, INCIDENT_STATUS_COLORS, TEMPLATE_COLORS } from '../../../config/chartPalette.js';
import { DEFICIENCY_LEVELS, slaState } from '../../../config/deficiencyLevels.js';
import { isQualifyingReinspection, workOrderVerifiedBlockers } from '../../../lib/incidentLifecycle.js';
import { generatePendingInstances, linkSubmissionToInstance, refreshInstanceStatuses } from '../../../lib/instanceGeneration.js';
import { addAirportDays, airportYmd, daysUntilDue, eachWeekStart } from '../../../lib/belizeTime.js';
import { dispatchNotification } from '../../../lib/notificationTransport.js';
import { groupForCode } from '../../templates/registry.js';
import { advanceClock, getStore, mutateStore, nowMs, resetStore } from './store.js';

function notWired() {
  throw new Error('not wired');
}

export function createMockRepositories() {
  return {
    users: {
      async list() {
        return getStore().users;
      },
      async getById(id) {
        return getStore().users.find((row) => row.id === id) ?? null;
      },
      async getByEmail(email) {
        const key = String(email || '').toLowerCase();
        const users = getStore().users;
        return (
          users.find((row) => row.email.toLowerCase() === key) ??
          users.find((row) => row.can_login) ??
          users[0]
        );
      },
      // Accounts that may sign in. The directory (list) is deliberately wider:
      // historical records still point at the people who signed them.
      async listLogins() {
        const users = getStore().users;
        const enabled = users.filter((row) => row.can_login);
        return enabled.length ? enabled : users;
      },
    },
    templates: {
      async list(profile) {
        const templates = getStore().templates.map((tpl) => ({
          ...tpl,
          assignment_rules: getStore().assignment_rules.filter((r) => r.template_id === tpl.id),
        }));
        if (!profile || ['om', 'coo', 'admin'].includes(profile.role)) return templates;
        return templates.filter((tpl) =>
          tpl.assignment_rules.some(
            (rule) =>
              (!rule.department || rule.department === profile.department) &&
              (!rule.role || rule.role === profile.role),
          ),
        );
      },
      async get(idOrCode) {
        const templates = getStore().templates;
        const hit =
          templates.find((row) => row.id === idOrCode || row.code === idOrCode) ?? templates[0];
        return {
          ...hit,
          assignment_rules: getStore().assignment_rules.filter((r) => r.template_id === hit.id),
        };
      },
    },
    checklists: {
      async listMine(userId) {
        const rows = getStore().submissions;
        if (!userId) return rows;
        const user = getStore().users.find((u) => u.id === userId);
        if (user && ['om', 'coo', 'admin'].includes(user.role)) return rows;
        return rows.filter((row) => row.inspector_id === userId);
      },
      async listAll() {
        return getStore().submissions;
      },
      async get(id) {
        return getStore().submissions.find((row) => row.id === id) ?? null;
      },
      async persist(record) {
        let saved = record;
        mutateStore((s) => {
          const idx = s.submissions.findIndex((row) => row.id === record.id);
          const existing = idx >= 0 ? s.submissions[idx] : null;
          if (existing?.locked && existing.status !== 'draft') {
            saved = {
              ...existing,
              exported_pdf_path: record.exported_pdf_path ?? existing.exported_pdf_path,
            };
          } else {
            saved = { ...record, pending_sync: false, updatedAt: new Date(nowMs()).toISOString() };
            if (saved.status === 'submitted' && !saved.locked) saved.locked = true;
          }
          if (idx >= 0) s.submissions[idx] = saved;
          else s.submissions.unshift(saved);
          if (saved.status === 'submitted' || saved.status === 'acknowledged') {
            s.instances = linkSubmissionToInstance(s.instances, saved);
          }
          if (saved.status === 'submitted' && existing?.status !== 'submitted') {
            ensureApproval(s, {
              entity_type: 'checklist_submission',
              entity_id: saved.id,
              approval_role: 'om_acknowledgment',
              assigned_to: s.users.find((u) => u.role === 'om')?.id,
            });
          }
          return s;
        });
        return saved;
      },
      /**
       * Amend ONE item's result on a submitted record, and nothing else.
       *
       * `persist` deliberately refuses to write to a locked submission — that is
       * the §11 guarantee. BACC have asked for a cleared deficiency to flip the
       * source item back to SAT, so this is the single narrow exception: it can
       * change one item's `result` and the `amendments` trail, and touches no
       * other field. Anything wider still has to go through `persist` and is
       * still rejected.
       *
       * Pass `amendment: null` with a `reason` to undo an earlier amendment.
       */
      async amendItemResult({ id, code, result, amendment, reason }) {
        const tag = amendment?.reason ?? reason;
        if (!tag) throw new Error('amendItemResult needs a reason');
        let saved = null;
        mutateStore((s) => {
          const idx = s.submissions.findIndex((row) => row.id === id);
          if (idx < 0) throw new Error('Checklist not found');
          const rec = s.submissions[idx];
          if (!rec.items?.[code]) throw new Error(`Item ${code} is not on this checklist`);
          const rest = (rec.amendments ?? []).filter(
            (a) => !(a.item_code === code && a.reason === tag),
          );
          saved = {
            ...rec,
            items: { ...rec.items, [code]: { ...rec.items[code], result } },
            amendments: amendment ? [...rest, amendment] : rest,
            updatedAt: new Date(nowMs()).toISOString(),
          };
          s.submissions[idx] = saved;
          return s;
        });
        return saved;
      },
      async deleteDraft(record) {
        if (record?.status !== 'draft' || record?.locked) {
          throw new Error('Only unlocked drafts can be deleted. Submitted records stay on file.');
        }
        mutateStore((s) => {
          s.submissions = s.submissions.filter((row) => row.id !== record.id);
          return s;
        });
      },
      async acknowledge({ id, name, position, signature_data_uri, actorId }) {
        let saved = null;
        mutateStore((s) => {
          const rec = s.submissions.find((row) => row.id === id);
          if (!rec) throw new Error('Checklist not found');
          if (rec.status === 'draft') throw new Error('Drafts cannot be acknowledged');
          const items = rec.items;
          rec.signoffs = [
            ...(rec.signoffs ?? []).filter((sg) => sg.role !== 'om_acknowledgment'),
            {
              role: 'om_acknowledgment',
              name,
              position,
              signature_data_uri,
              signed_at: new Date(nowMs()).toISOString(),
            },
          ];
          rec.status = 'acknowledged';
          rec.items = items;
          saved = rec;
          const appr = s.approvals.find(
            (a) => a.entity_id === id && a.approval_role === 'om_acknowledgment' && a.status === 'pending',
          );
          if (appr) {
            appr.status = 'approved';
            appr.decided_by = actorId;
            appr.decided_at = new Date(nowMs()).toISOString();
            appr.signature_image_path = signature_data_uri ? 'local-signature' : null;
          }
          return s;
        });
        return saved;
      },
      async listQualifyingReinspections(incident) {
        return getStore().submissions.filter((row) => isQualifyingReinspection(row, incident));
      },
    },
    incidents: {
      async list() {
        return getStore().incidents.map(withSourceTeam);
      },
      async get(id) {
        const inc = getStore().incidents.find((row) => row.id === id);
        if (!inc) return null;
        return withSourceTeam({ ...inc, updates: inc.updates ?? [] });
      },
      async persist(record) {
        let saved = record;
        mutateStore((s) => {
          const idx = s.incidents.findIndex((row) => row.id === record.id);
          saved = { ...record, pending_sync: false };
          if (idx >= 0) s.incidents[idx] = { ...s.incidents[idx], ...saved };
          else s.incidents.unshift(saved);
          return s;
        });
        return saved;
      },
      async addUpdate(incident, update) {
        const row = {
          id: crypto.randomUUID(),
          incident_id: incident.id,
          created_at: new Date(nowMs()).toISOString(),
          ...update,
        };
        mutateStore((s) => {
          const inc = s.incidents.find((i) => i.id === incident.id);
          if (inc) inc.updates = [row, ...(inc.updates ?? [])];
          return s;
        });
        return row;
      },
    },
    workOrders: {
      async listByIncident(incidentId) {
        return getStore().work_orders.filter((row) => row.incident_id === incidentId);
      },
      async get(id) {
        return getStore().work_orders.find((row) => row.id === id) ?? null;
      },
      async persist(record) {
        if (record.status === 'verified') {
          const blockers = workOrderVerifiedBlockers(record);
          if (blockers.length) throw new Error(blockers[0]);
        }
        let saved = record;
        mutateStore((s) => {
          const existing = s.work_orders.find((row) => row.id === record.id);
          if (existing?.locked) {
            saved = {
              ...existing,
              exported_pdf_path: record.exported_pdf_path ?? existing.exported_pdf_path,
            };
            return s;
          }
          saved = { ...record, pending_sync: false };
          if (String(saved.work_order_number || '').includes('TEMP')) {
            const year = new Date(nowMs()).getFullYear();
            const seq = s.work_orders.filter((w) => String(w.work_order_number).startsWith(`WO-${year}-`)).length + 1;
            saved.work_order_number = `WO-${year}-${String(seq).padStart(4, '0')}`;
          }
          const idx = s.work_orders.findIndex((row) => row.id === saved.id);
          if (idx >= 0) s.work_orders[idx] = saved;
          else s.work_orders.unshift(saved);
          if (saved.status === 'completed') {
            ensureApproval(s, {
              entity_type: 'work_order',
              entity_id: saved.id,
              approval_role: 'om_coo_verification',
              assigned_to: s.users.find((u) => u.role === 'om')?.id,
            });
          }
          return s;
        });
        return saved;
      },
    },
    approvals: {
      async listInbox(user) {
        const s = getStore();
        return s.approvals
          .filter((row) => row.status === 'pending' && isApprovalForUser(row, user, s))
          // Work orders (Annex H) are out of the incident UI, so an approval
          // pointing at one has nowhere to go. See WORK_ORDERS_ENABLED.
          .filter((row) => row.entity_type === 'checklist_submission')
          .map((row) => hydrateApproval(row, s))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      },
      async get(id) {
        const s = getStore();
        const row = s.approvals.find((a) => a.id === id);
        return row ? hydrateApproval(row, s) : null;
      },
      async decide({ id, decision, notes, signature_data_uri, actor, name, position }) {
        if (decision === 'rejected') {
          mutateStore((s) => {
            const row = s.approvals.find((a) => a.id === id);
            if (!row) throw new Error('Approval not found');
            row.status = 'rejected';
            row.notes = notes ?? '';
            row.decided_by = actor.id;
            row.decided_at = new Date(nowMs()).toISOString();
            return s;
          });
          await dispatchNotification({
            event_type: 'approval_required',
            title: 'Approval rejected',
            body: notes || 'The approver rejected this item. Whether rejection of a regulatory record is permitted is pending BACC.',
            recipientIds: [actor.id],
            href: '/approvals',
          });
          return getStore().approvals.find((a) => a.id === id);
        }

        const s = getStore();
        const row = s.approvals.find((a) => a.id === id);
        if (!row) throw new Error('Approval not found');
        if (row.entity_type === 'checklist_submission') {
          const repos = createMockRepositories();
          await repos.checklists.acknowledge({
            id: row.entity_id,
            name: name || actor.full_name,
            position: position || actor.position,
            signature_data_uri,
            actorId: actor.id,
          });
        } else {
          const wo = s.work_orders.find((w) => w.id === row.entity_id);
          if (!wo) throw new Error('Work order not found');
          const blockers = workOrderVerifiedBlockers({
            ...wo,
            status: 'verified',
            cec_clearance_issued:
              row.approval_role === 'cec_clearance' ? true : wo.cec_clearance_issued,
          });
          if (blockers.length) throw new Error(blockers.join(' '));
          const repos = createMockRepositories();
          const signRole = row.approval_role === 'cec_clearance' ? 'cec_clearance' : 'om_coo_verification';
          const signoffs = [
            ...(wo.signoffs ?? []).filter((sg) => sg.role !== signRole),
            {
              role: signRole,
              name: name || actor.full_name,
              signature_data_uri,
              signed_at: new Date(nowMs()).toISOString(),
            },
          ];
          const next = {
            ...wo,
            signoffs,
            status: 'verified',
            locked: true,
            cec_clearance_issued: row.approval_role === 'cec_clearance' ? true : wo.cec_clearance_issued,
          };
          await repos.workOrders.persist(next);
          mutateStore((st) => {
            const ap = st.approvals.find((a) => a.id === id);
            if (ap) {
              ap.status = 'approved';
              ap.decided_by = actor.id;
              ap.decided_at = new Date(nowMs()).toISOString();
              ap.signature_image_path = signature_data_uri ? 'local-signature' : null;
              ap.notes = notes ?? null;
            }
            return st;
          });
        }
        return hydrateApproval(
          getStore().approvals.find((a) => a.id === id),
          getStore(),
        );
      },
    },
    instances: {
      async list() {
        return refreshInstanceStatuses(getStore().instances, nowMs());
      },
      async generate() {
        let created = [];
        mutateStore((s) => {
          created = generatePendingInstances({
            rules: s.assignment_rules,
            existing: s.instances,
            fromYmd: '2026-02-01',
            toYmd: airportYmd(nowMs()),
            nowMs: nowMs(),
            idFactory: () => crypto.randomUUID(),
          });
          s.instances = refreshInstanceStatuses([...s.instances, ...created], nowMs());
          return s;
        });
        return { created: created.length, total: getStore().instances.length };
      },
      async advanceClock(days) {
        advanceClock(days);
        return { demoNow: getStore().demoNow, instances: getStore().instances.length };
      },
      async getClock() {
        return { demoNow: getStore().demoNow, nowMs: nowMs() };
      },
      async resetDemo() {
        resetStore();
        return { demoNow: getStore().demoNow };
      },
    },
    notifications: {
      async listForUser(userId) {
        return getStore()
          .notifications.filter((row) => row.recipient_id === userId)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      },
      async unreadCount(userId) {
        return getStore().notifications.filter((row) => row.recipient_id === userId && !row.read_at).length;
      },
      async markRead(id) {
        mutateStore((s) => {
          const row = s.notifications.find((n) => n.id === id);
          if (row && !row.read_at) row.read_at = new Date(nowMs()).toISOString();
          return s;
        });
      },
      async markAllRead(userId) {
        const at = new Date(nowMs()).toISOString();
        mutateStore((s) => {
          for (const row of s.notifications) {
            if (row.recipient_id === userId && !row.read_at) row.read_at = at;
          }
          return s;
        });
      },
    },
    reports: createReportAggregations(),
  };
}

function ensureApproval(s, spec) {
  const exists = s.approvals.some(
    (a) => a.entity_id === spec.entity_id && a.approval_role === spec.approval_role && a.status === 'pending',
  );
  if (exists) return;
  s.approvals.unshift({
    id: crypto.randomUUID(),
    status: 'pending',
    decided_by: null,
    decided_at: null,
    signature_image_path: null,
    notes: null,
    created_at: new Date(nowMs()).toISOString(),
    ...spec,
  });
}

function isApprovalForUser(row, user) {
  if (!user) return false;
  if (row.assigned_to && row.assigned_to === user.id) return true;
  if (row.approval_role === 'om_acknowledgment' && (user.role === 'om' || user.role === 'coo')) return true;
  if (row.approval_role === 'om_coo_verification' && (user.role === 'om' || user.role === 'coo')) return true;
  if (row.approval_role === 'cec_clearance' && user.role === 'cec') return true;
  return false;
}

/** Monday of the week containing `ymd` — matches eachWeekStart's anchoring. */
function weekStartFor(ymd) {
  const dow = new Date(Date.parse(`${ymd}T12:00:00-06:00`)).getUTCDay();
  return addAirportDays(ymd, dow === 0 ? -6 : 1 - dow);
}

function shortDate(ymd) {
  const [, m, d] = ymd.split('-');
  return `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m)]} ${Number(d)}`;
}

/**
 * Attach the team that owns the form this incident came from.
 *
 * Derived rather than stored: the incident already records which approved form
 * raised it, and the folder that form arrived in is the team. Storing a copy
 * would let the two drift apart the first time a form is refiled.
 */
function withSourceTeam(inc) {
  return { ...inc, source_group: groupForCode(inc.source_template_code) };
}

function hydrateApproval(row, s) {
  if (row.entity_type === 'checklist_submission') {
    const sub = s.submissions.find((x) => x.id === row.entity_id);
    if (!sub) return { ...row, entity: null };
    const tpl = s.templates.find((t) => t.id === sub.template_id || t.code === sub.template_code);
    const filedBy = s.users.find((u) => u.id === sub.inspector_id);
    const assignee = s.users.find((u) => u.id === row.assigned_to);
    return {
      ...row,
      entity: {
        title: sub.schema?.title || sub.template_code,
        annex_label: sub.schema?.annexLabel || tpl?.annex_label || null,
        code: sub.template_code,
        // Whose form it is, and who filed it — the two things a reviewer needs
        // before deciding whether to sign.
        group: tpl?.group ?? groupForCode(sub.template_code),
        department: tpl?.department ?? filedBy?.department ?? null,
        filed_by: sub.inspector_name || filedBy?.full_name || null,
        date: sub.inspection_date,
        href: `/checklists/${sub.id}`,
        status: sub.status,
      },
      assigned_to_name: assignee?.full_name ?? null,
    };
  }
  const wo = s.work_orders.find((x) => x.id === row.entity_id);
  const inc = wo ? s.incidents.find((i) => i.id === wo.incident_id) : null;
  return {
    ...row,
    entity: wo
      ? {
          title: wo.work_order_number,
          date: wo.date_issued,
          href: `/incidents/${wo.incident_id}?tab=work-orders&wo=${wo.id}`,
          status: wo.status,
          incident_ref: inc?.incident_ref,
        }
      : null,
  };
}

function createReportAggregations() {
  return {
    async kpis() {
      const s = getStore();
      const openInc = s.incidents.filter((i) => i.status !== 'closed').length;
      const due = s.instances.filter((i) => i.status === 'pending' || i.status === 'overdue' || i.status === 'in_progress').length;
      const appr = s.approvals.filter((a) => a.status === 'pending').length;
      return {
        incidentsOpen: openInc,
        checklistsDue: due,
        approvalsPending: appr,
        prior: {
          incidentsOpen: Math.max(0, openInc - 1),
          checklistsDue: Math.max(0, due - 1),
          approvalsPending: Math.max(0, appr - 1),
        },
      };
    },
    async completionRate({ from = '2026-02-01', to = '2026-08-31' } = {}) {
      const s = getStore();
      const monthly = s.instances.filter(
        (row) =>
          row.assignment_rule_id &&
          row.period_start >= from &&
          row.period_start <= to &&
          row.period_start.endsWith('-01'),
      );
      const byPeriod = new Map();
      for (const row of monthly) {
        const period = row.period_start.slice(0, 7);
        const cur = byPeriod.get(period) ?? { due: 0, submitted: 0 };
        cur.due += 1;
        if (row.status === 'submitted' || row.status === 'in_progress') cur.submitted += 1;
        byPeriod.set(period, cur);
      }
      const templateCode = s.templates[0]?.code || 'PGIA-PMM-F04';
      const points = [...byPeriod.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, cur]) => ({
          period,
          templateCode,
          due: cur.due,
          submitted: cur.submitted,
          rate: cur.due ? cur.submitted / cur.due : 0,
        }));
      return {
        points,
        series: [{ templateCode, color: TEMPLATE_COLORS[templateCode] || CATEGORICAL.blue }],
      };
    },
    async overdueInspections() {
      const s = getStore();
      const t = nowMs();
      return s.instances
        .filter((row) => row.status === 'overdue' || row.status === 'missed')
        .map((row) => {
          const user = s.users.find((u) => u.id === row.assigned_user);
          const tpl = s.templates.find((t0) => t0.id === row.template_id);
          return {
            id: row.id,
            templateCode: tpl?.code,
            assignee: user?.full_name || row.assigned_role,
            due_at: row.due_at,
            status: row.status,
            daysOverdue: Math.max(0, -daysUntilDue(row.due_at, t)),
          };
        });
    },
    async openDeficienciesByLevel() {
      const open = getStore().incidents.filter((i) => i.status !== 'closed');
      return DEFICIENCY_LEVELS.map((lvl) => ({
        key: String(lvl.level),
        label: lvl.label,
        count: open.filter((i) => i.deficiency_level === lvl.level).length,
        color: lvl.color,
      }));
    },
    async incidentsByStatus() {
      const counts = {};
      for (const inc of getStore().incidents) {
        counts[inc.status] = (counts[inc.status] || 0) + 1;
      }
      return Object.entries(INCIDENT_STATUS_COLORS).map(([key, color]) => ({
        key,
        label: key.replace('_', ' '),
        count: counts[key] || 0,
        color,
      }));
    },
    async deficiencyAgeing() {
      const s = getStore();
      const t = nowMs();
      const closed = s.incidents.filter((i) => i.status === 'closed' && i.closed_at);
      const days = closed.map((i) => (Date.parse(i.closed_at) - Date.parse(i.reported_at)) / 86400000);
      const meanDays = days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
      const buckets = [
        { bucket: '0-7', label: '0–7 days', lo: 0, hi: 7 },
        { bucket: '8-30', label: '8–30 days', lo: 8, hi: 30 },
        { bucket: '31-90', label: '31–90 days', lo: 31, hi: 90 },
        { bucket: '90+', label: '90+ days', lo: 91, hi: Infinity },
      ];
      const open = s.incidents.filter((i) => i.status !== 'closed');
      const openAgeing = buckets.map((b) => ({
        bucket: b.bucket,
        label: b.label,
        count: open.filter((i) => {
          const age = (t - Date.parse(i.reported_at)) / 86400000;
          return age >= b.lo && age <= b.hi;
        }).length,
        color: CATEGORICAL.blue,
      }));
      return { meanDays, closedCount: closed.length, openAgeing };
    },
    /**
     * "Which teams still have work outstanding?"
     *
     * One row per owning team, counting scheduled occurrences rather than
     * filed records — a team with nothing scheduled has nothing outstanding,
     * which is different from a team that is behind. Sorted worst first so the
     * teams that need attention are at the top without anyone sorting.
     */
    async teamCompliance() {
      const s = getStore();
      const teamOf = new Map(s.templates.map((t) => [t.id, t.group || 'Other']));
      const rows = new Map();
      for (const i of s.instances) {
        const team = teamOf.get(i.template_id);
        if (!team) continue;
        const row =
          rows.get(team) ??
          { key: team, label: team, scheduled: 0, completed: 0, onTime: 0, late: 0, outstanding: 0, overdue: 0, missed: 0 };
        row.scheduled += 1;
        if (i.status === 'submitted') {
          row.completed += 1;
          if (i.completed_at && i.completed_at > i.period_end) row.late += 1;
          else row.onTime += 1;
        } else if (i.status === 'overdue') {
          row.overdue += 1;
          row.outstanding += 1;
        } else if (i.status === 'missed') {
          row.missed += 1;
          row.outstanding += 1;
        } else {
          row.outstanding += 1;
        }
        rows.set(team, row);
      }
      return [...rows.values()]
        // No colour here on purpose: "behind" is a status, and status hues are
        // reserved for the design tokens (see config/chartPalette.js). The
        // component picks alert / success from the counts.
        .map((row) => ({ ...row, rate: row.scheduled ? row.completed / row.scheduled : 1 }))
        .sort((a, b) => b.overdue + b.missed - (a.overdue + a.missed) || a.rate - b.rate);
    },

    /**
     * "Are inspections being done on time?" — the last `weeks` weeks, bucketed
     * by the week an occurrence was due, split on-time vs late.
     */
    async onTimeByWeek({ weeks = 8 } = {}) {
      const s = getStore();
      const today = airportYmd(nowMs());
      const from = addAirportDays(today, -(weeks * 7));
      const buckets = new Map();
      for (const start of eachWeekStart(from, today)) {
        buckets.set(start, { key: start, label: shortDate(start), onTime: 0, late: 0 });
      }
      for (const i of s.instances) {
        if (i.status !== 'submitted' || !i.completed_at) continue;
        const week = weekStartFor(i.period_end);
        const bucket = buckets.get(week);
        if (!bucket) continue;
        if (i.completed_at > i.period_end) bucket.late += 1;
        else bucket.onTime += 1;
      }
      return [...buckets.values()];
    },

    /** The specific inspections filed after their due date, most recent first. */
    async lateCompletions({ limit = 12 } = {}) {
      const s = getStore();
      const tpl = new Map(s.templates.map((t) => [t.id, t]));
      return s.instances
        .filter((i) => i.status === 'submitted' && i.completed_at && i.completed_at > i.period_end)
        .map((i) => {
          const t = tpl.get(i.template_id);
          return {
            id: i.id,
            code: t?.code ?? '—',
            title: t?.title ?? '',
            team: t?.group ?? 'Other',
            due: i.period_end,
            completed: i.completed_at,
            daysLate: Math.round(
              (Date.parse(`${i.completed_at}T12:00:00-06:00`) - Date.parse(`${i.period_end}T12:00:00-06:00`)) / 86400000,
            ),
          };
        })
        .sort((a, b) => String(b.completed).localeCompare(String(a.completed)))
        .slice(0, limit);
    },

    async departmentOverview() {
      const s = getStore();
      const counts = {};
      for (const sub of s.submissions) {
        const user = s.users.find((u) => u.id === sub.inspector_id);
        const dept = user?.department || 'Maintenance';
        counts[dept] = (counts[dept] || 0) + 1;
      }
      return Object.entries(counts).map(([key, count]) => ({
        key,
        label: key,
        count,
        color: DEPARTMENT_COLORS[key] || CATEGORICAL.grey,
      }));
    },
    async slaAdherence() {
      const s = getStore();
      const t = nowMs();
      const rows = s.incidents.map((inc) => {
        const sla = slaState(inc.target_date, t);
        const closedOnTime =
          inc.status === 'closed' && inc.closed_at && inc.target_date
            ? inc.closed_at.slice(0, 10) <= inc.target_date
            : null;
        return {
          id: inc.id,
          ref: inc.incident_ref,
          status: inc.status,
          target_date: inc.target_date,
          sla: sla.kind,
          remainingDays: sla.remainingDays,
          closedOnTime,
          href: `/incidents/${inc.id}`,
        };
      });
      const open = rows.filter((r) => r.status !== 'closed');
      return {
        onTrack: open.filter((r) => r.sla === 'ok').length,
        warning: open.filter((r) => r.sla === 'warning').length,
        breached: open.filter((r) => r.sla === 'overdue').length,
        closedOnTime: rows.filter((r) => r.closedOnTime === true).length,
        closedLate: rows.filter((r) => r.closedOnTime === false).length,
        rows,
      };
    },
    async nocRegisterStatus() {
      const s = getStore();
      const byStatus = Object.entries(INCIDENT_STATUS_COLORS).map(([key, color]) => ({
        key,
        label: key.replace('_', ' '),
        count: s.incidents.filter((i) => i.status === key).length,
        color,
      }));
      return {
        open: s.incidents.filter((i) => i.status !== 'closed').length,
        closed: s.incidents.filter((i) => i.status === 'closed').length,
        byStatus,
      };
    },
    async reinspectionRate() {
      const closed = getStore().incidents.filter((i) => i.status === 'closed');
      const withSat = closed.filter((i) => i.reinspection_submission_id);
      return {
        closed: closed.length,
        withSatReinspection: withSat.length,
        rate: closed.length ? withSat.length / closed.length : 0,
      };
    },
    async activityFeed({ limit = 8 } = {}) {
      return getStore().activity.slice(0, limit);
    },
  };
}

void notWired;
