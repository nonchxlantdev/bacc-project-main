/**
 * Report aggregations computed in the browser from repository lists.
 *
 * Shared by the Supabase and D1 adapters: each passes a `loadCtx()` that
 * returns { templates, users, submissions, incidents, instances, approvals,
 * workOrders }. Moved verbatim out of supabase/index.js (sub-project 3a).
 */
import { CATEGORICAL, DEPARTMENT_COLORS, INCIDENT_STATUS_COLORS, TEMPLATE_COLORS } from '../../config/chartPalette.js';
import { deficiencyLevels, slaState } from '../../config/deficiencyLevels.js';
import { addAirportDays, airportYmd, daysUntilDue, eachWeekStart } from '../../lib/belizeTime.js';
import { groupForCode } from '../templates/templateMeta.js';

function weekStartFor(ymd) {
  const dow = new Date(Date.parse(`${ymd}T12:00:00-06:00`)).getUTCDay();
  return addAirportDays(ymd, dow === 0 ? -6 : 1 - dow);
}

function shortDate(ymd) {
  const [, m, d] = ymd.split('-');
  return `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m)]} ${Number(d)}`;
}

export function createReportAggregations(loadCtx) {
  return {
    async kpis() {
      const { incidents, instances, approvals } = await loadCtx();
      const openInc = incidents.filter((i) => i.status !== 'closed').length;
      const due = instances.filter(
        (i) => i.status === 'pending' || i.status === 'overdue' || i.status === 'in_progress',
      ).length;
      const appr = approvals.filter((a) => a.status === 'pending').length;
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
      const { instances, templates } = await loadCtx();
      const monthly = instances.filter(
        (row) =>
          row.assignment_rule_id &&
          row.period_start >= from &&
          row.period_start <= to &&
          String(row.period_start).endsWith('-01'),
      );
      const byPeriod = new Map();
      for (const row of monthly) {
        const period = String(row.period_start).slice(0, 7);
        const cur = byPeriod.get(period) ?? { due: 0, submitted: 0 };
        cur.due += 1;
        if (row.status === 'submitted' || row.status === 'in_progress') cur.submitted += 1;
        byPeriod.set(period, cur);
      }
      const templateCode = templates[0]?.code || 'PGIA-PMM-F04';
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
      const { instances, users, templates } = await loadCtx();
      const t = Date.now();
      return instances
        .filter((row) => row.status === 'overdue' || row.status === 'missed')
        .map((row) => {
          const user = users.find((u) => u.id === row.assigned_user);
          const tpl = templates.find((t0) => t0.id === row.template_id);
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
      const { incidents } = await loadCtx();
      const open = incidents.filter((i) => i.status !== 'closed');
      return deficiencyLevels().map((lvl) => ({
        key: String(lvl.level),
        label: lvl.label,
        count: open.filter((i) => i.deficiency_level === lvl.level).length,
        color: lvl.color,
      }));
    },
    async incidentsByStatus() {
      const { incidents } = await loadCtx();
      const counts = {};
      for (const inc of incidents) {
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
      const { incidents } = await loadCtx();
      const t = Date.now();
      const closed = incidents.filter((i) => i.status === 'closed' && i.closed_at);
      const days = closed.map((i) => (Date.parse(i.closed_at) - Date.parse(i.reported_at)) / 86400000);
      const meanDays = days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
      const buckets = [
        { bucket: '0-7', label: '0–7 days', lo: 0, hi: 7 },
        { bucket: '8-30', label: '8–30 days', lo: 8, hi: 30 },
        { bucket: '31-90', label: '31–90 days', lo: 31, hi: 90 },
        { bucket: '90+', label: '90+ days', lo: 91, hi: Infinity },
      ];
      const open = incidents.filter((i) => i.status !== 'closed');
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
    async teamCompliance() {
      const { instances, templates } = await loadCtx();
      const teamOf = new Map(templates.map((t) => [t.id, t.group || groupForCode(t.code) || 'Other']));
      const rows = new Map();
      for (const i of instances) {
        const team = teamOf.get(i.template_id);
        if (!team) continue;
        const row =
          rows.get(team) ??
          {
            key: team,
            label: team,
            scheduled: 0,
            completed: 0,
            onTime: 0,
            late: 0,
            outstanding: 0,
            overdue: 0,
            missed: 0,
          };
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
        .map((row) => ({ ...row, rate: row.scheduled ? row.completed / row.scheduled : 1 }))
        .sort((a, b) => b.overdue + b.missed - (a.overdue + a.missed) || a.rate - b.rate);
    },
    async onTimeByWeek({ weeks = 8 } = {}) {
      const { instances } = await loadCtx();
      const today = airportYmd(Date.now());
      const from = addAirportDays(today, -(weeks * 7));
      const buckets = new Map();
      for (const start of eachWeekStart(from, today)) {
        buckets.set(start, { key: start, label: shortDate(start), onTime: 0, late: 0 });
      }
      for (const i of instances) {
        if (i.status !== 'submitted' || !i.completed_at) continue;
        const week = weekStartFor(i.period_end);
        const bucket = buckets.get(week);
        if (!bucket) continue;
        if (i.completed_at > i.period_end) bucket.late += 1;
        else bucket.onTime += 1;
      }
      return [...buckets.values()];
    },
    async lateCompletions({ limit = 12 } = {}) {
      const { instances, templates } = await loadCtx();
      const tpl = new Map(templates.map((t) => [t.id, t]));
      return instances
        .filter((i) => i.status === 'submitted' && i.completed_at && i.completed_at > i.period_end)
        .map((i) => {
          const t = tpl.get(i.template_id);
          return {
            id: i.id,
            code: t?.code ?? '—',
            title: t?.title ?? '',
            team: t?.group ?? groupForCode(t?.code) ?? 'Other',
            due: i.period_end,
            completed: i.completed_at,
            daysLate: Math.round(
              (Date.parse(`${i.completed_at}T12:00:00-06:00`) -
                Date.parse(`${i.period_end}T12:00:00-06:00`)) /
                86400000,
            ),
          };
        })
        .sort((a, b) => String(b.completed).localeCompare(String(a.completed)))
        .slice(0, limit);
    },
    async departmentOverview() {
      const { submissions, users } = await loadCtx();
      const counts = {};
      for (const sub of submissions) {
        const user = users.find((u) => u.id === sub.inspector_id);
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
      const { incidents } = await loadCtx();
      const t = Date.now();
      const rows = incidents.map((inc) => {
        const sla = slaState(inc.target_date, t);
        const closedOnTime =
          inc.status === 'closed' && inc.closed_at && inc.target_date
            ? String(inc.closed_at).slice(0, 10) <= inc.target_date
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
      const { incidents } = await loadCtx();
      const byStatus = Object.entries(INCIDENT_STATUS_COLORS).map(([key, color]) => ({
        key,
        label: key.replace('_', ' '),
        count: incidents.filter((i) => i.status === key).length,
        color,
      }));
      return {
        open: incidents.filter((i) => i.status !== 'closed').length,
        closed: incidents.filter((i) => i.status === 'closed').length,
        byStatus,
      };
    },
    async reinspectionRate() {
      const { incidents } = await loadCtx();
      const closed = incidents.filter((i) => i.status === 'closed');
      const withSat = closed.filter((i) => i.reinspection_submission_id);
      return {
        closed: closed.length,
        withSatReinspection: withSat.length,
        rate: closed.length ? withSat.length / closed.length : 0,
      };
    },
    async activityFeed({ limit = 8 } = {}) {
      const { submissions, incidents, approvals, users } = await loadCtx();
      const feed = [];
      for (const sub of submissions.slice(0, 20)) {
        const actor = users.find((u) => u.id === sub.inspector_id);
        feed.push({
          id: `sub-${sub.id}`,
          at: sub.submitted_at || sub.created_at,
          actor_name: actor?.full_name || sub.inspector_name || 'Inspector',
          summary: `${sub.status === 'draft' ? 'Drafted' : 'Filed'} ${sub.template_code || 'checklist'}`,
          href: `/checklists/${sub.id}`,
        });
      }
      for (const inc of incidents.slice(0, 20)) {
        feed.push({
          id: `inc-${inc.id}`,
          at: inc.reported_at,
          actor_name: inc.reported_by_name || 'Reporter',
          summary: `Opened ${inc.incident_ref || 'incident'}`,
          href: `/incidents/${inc.id}`,
        });
      }
      for (const ap of approvals.filter((a) => a.status !== 'pending').slice(0, 20)) {
        feed.push({
          id: `ap-${ap.id}`,
          at: ap.decided_at || ap.created_at,
          actor_name: 'Approver',
          summary: `${ap.status === 'approved' ? 'Approved' : 'Rejected'} ${ap.approval_role}`,
          href: '/approvals',
        });
      }
      return feed
        .filter((row) => row.at)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)))
        .slice(0, limit);
    },
    async workOrderTurnaround() {
      const { workOrders, users } = await loadCtx();
      const byDept = new Map();
      for (const wo of workOrders) {
        const dept =
          wo.department ||
          users.find((u) => u.id === wo.issued_by)?.department ||
          'Other';
        const row =
          byDept.get(dept) ??
          { key: dept, label: dept, count: 0, completed: 0, days: [] };
        row.count += 1;
        const end = wo.date_works_completed || wo.verified_at || null;
        if (end && wo.date_issued) {
          const days =
            (Date.parse(`${String(end).slice(0, 10)}T12:00:00-06:00`) -
              Date.parse(`${String(wo.date_issued).slice(0, 10)}T12:00:00-06:00`)) /
            86400000;
          if (Number.isFinite(days) && days >= 0) {
            row.days.push(days);
            row.completed += 1;
          }
        }
        byDept.set(dept, row);
      }
      return [...byDept.values()]
        .map((row) => {
          const sorted = [...row.days].sort((a, b) => a - b);
          const meanDays = sorted.length
            ? sorted.reduce((a, b) => a + b, 0) / sorted.length
            : null;
          const mid = Math.floor(sorted.length / 2);
          const medianDays = !sorted.length
            ? null
            : sorted.length % 2
              ? sorted[mid]
              : (sorted[mid - 1] + sorted[mid]) / 2;
          return {
            key: row.key,
            label: row.label,
            count: row.count,
            completed: row.completed,
            meanDays: meanDays == null ? null : Math.round(meanDays * 10) / 10,
            medianDays: medianDays == null ? null : Math.round(medianDays * 10) / 10,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
    },
    async templateCompletion() {
      const { instances, templates } = await loadCtx();
      const rows = new Map();
      for (const tpl of templates) {
        rows.set(tpl.id, {
          key: tpl.id,
          code: tpl.code,
          label: tpl.title || tpl.code,
          family: tpl.document_family || tpl.group || groupForCode(tpl.code) || 'Other',
          group: tpl.group || groupForCode(tpl.code) || 'Other',
          scheduled: 0,
          completed: 0,
          onTime: 0,
          late: 0,
          outstanding: 0,
          overdue: 0,
          missed: 0,
        });
      }
      for (const i of instances) {
        const row = rows.get(i.template_id);
        if (!row) continue;
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
      }
      return [...rows.values()]
        .map((row) => ({ ...row, rate: row.scheduled ? row.completed / row.scheduled : 1 }))
        .sort((a, b) => a.family.localeCompare(b.family) || a.code.localeCompare(b.code));
    },
  };
}
