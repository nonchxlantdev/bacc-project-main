/**
 * Incident and work-order operations (sub-project 3b), plus the work-order
 * half of approvals. Composed into createDataService().
 *
 * Same shape as service.js: `(actor, args) => result`, permissions from
 * incidentRules.js, SQL from the store, multi-table changes in one batch.
 */
import { HttpError } from '../../api/_shared.js';
import { airportYmd } from '../../src/lib/belizeTime.js';
import {
  SAT_SYNC_REASON,
  SYNC_SAT_ON_VERIFICATION,
  hasSatVerification,
  isQualifyingReinspection,
} from '../../src/lib/incidentLifecycle.js';
import {
  INCIDENT_STATUSES,
  assertCanDecideWorkOrder,
  assertCanEditIncident,
  assertIncidentTransition,
  canSeeIncident,
  canSeeWorkOrderApproval,
  validateIncidentPayload,
  validateUpdateBody,
  validateWorkOrderPayload,
  workOrderVerifyBlockers,
} from './incidentRules.js';
import { foldAmendments, isSupervisor, optionalText, validId, validateSignature } from './rules.js';

const WORK_ORDER = 'work_order';

export function createIncidentOps({ store, forms = null, now, newId }) {
  const iso = () => new Date(now()).toISOString();
  const airportYear = () => Number(airportYmd(now()).slice(0, 4));

  async function visibleIncidentRow(actor, id) {
    const row = await store.getIncidentRow(validId(id, 'incident id'));
    return row && canSeeIncident(actor, row) ? row : null;
  }

  async function assertUserExists(id, label) {
    if (id && !(await store.getUser(id))) throw new HttpError(400, `${label} is not a user`);
  }

  /** Keep who/when of an unchanged verification; stamp the actor on a new one. */
  function resolveVerification(actor, incoming, existingJson) {
    if (!incoming) return null;
    const old = existingJson ? JSON.parse(existingJson) : null;
    if (old && old.result === incoming.result && (old.note ?? '') === (incoming.note ?? '')) return old;
    return {
      result: 'sat',
      note: incoming.note ?? '',
      verified_by: actor.id,
      verified_by_name: actor.full_name ?? null,
      verified_at: iso(),
      photo_url: null,
    };
  }

  /** The checklist as isQualifyingReinspection reads it. */
  function reinspectionView(hit) {
    let code = null;
    try {
      code = forms?.loadSchema?.(hit.row.template_id)?.code ?? null;
    } catch {
      code = null;
    }
    return { ...hit.record, template_code: code };
  }

  /** A linked re-inspection must be a filed checklist where this item came back SAT. */
  async function assertQualifyingReinspection(subId, incidentView) {
    const hit = await store.getSubmission(subId);
    if (!hit) throw new HttpError(400, 'The linked re-inspection does not exist');
    if (!isQualifyingReinspection(reinspectionView(hit), incidentView)) {
      throw new HttpError(400, `That checklist is not a filed re-inspection with ${incidentView.source_item_code} SAT`);
    }
  }

  /**
   * Statements that bring the source checklist item in line with the incident
   * (lib/checklistSync.js, done here on the server so it is part of the same
   * save and works for whoever records the verification). Idempotent.
   */
  async function satSyncStatements(actor, incident, at) {
    if (!SYNC_SAT_ON_VERIFICATION) return [];
    const code = incident.source_item_code;
    if (!code || !incident.submission_id) return [];
    const hit = await store.getSubmission(incident.submission_id);
    if (!hit || !hit.row.locked) return [];
    const items = JSON.parse(hit.row.items_json || '{}');
    if (!Object.hasOwn(items, code)) return [];
    const previous = foldAmendments(hit.amendmentRows.filter(Boolean)).find(
      (a) => a.item_code === code && a.reason === SAT_SYNC_REASON,
    );
    const current = items[code].result;
    let result;
    let amendment = null;
    if (hasSatVerification(incident)) {
      if (current === 'sat' && previous) return [];
      const from = previous?.from ?? current;
      if (from !== 'no_sat') return [];
      result = 'sat';
      amendment = {
        item_code: code,
        from,
        to: 'sat',
        reason: SAT_SYNC_REASON,
        incident_id: incident.id,
        incident_ref: incident.incident_ref ?? null,
        at: incident.verification?.verified_at ?? at,
        by: incident.verification?.verified_by ?? actor.id,
        by_name: incident.verification?.verified_by_name ?? actor.full_name ?? null,
        note: incident.verification?.note || null,
      };
    } else {
      if (!previous) return [];
      result = previous.from;
    }
    items[code] = { ...items[code], result };
    let reopenedAt = at;
    if (reopenedAt === hit.row.reopened_at) reopenedAt = new Date(Date.parse(at) + 1).toISOString();
    return [
      store.amendItemsStmt(hit.row.id, JSON.stringify(items), reopenedAt, actor.id),
      store.insertAuditStmt({
        id: newId(),
        entity_type: 'checklist_submission',
        entity_id: hit.row.id,
        action: 'amend_item',
        actor_id: actor.id,
        detail_json: JSON.stringify({ item_code: code, reason: SAT_SYNC_REASON, amendment }),
        created_at: reopenedAt,
      }),
    ];
  }

  async function hydrateWorkOrderApproval(row) {
    const wo = await store.getWorkOrderRow(row.entity_id);
    const inc = wo ? await store.getIncidentRow(wo.incident_id) : null;
    const assignee = row.assigned_to ? await store.getUser(row.assigned_to) : null;
    return {
      ...row,
      signed: Boolean(row.signed),
      signature_image_path: row.signed ? 'local-signature' : null,
      entity: wo
        ? {
            id: wo.id,
            title: wo.work_order_number,
            date: wo.date_issued,
            href: `/incidents/${wo.incident_id}?tab=work-orders&wo=${wo.id}`,
            status: wo.status,
            incident_ref: inc?.incident_ref ?? null,
          }
        : null,
      assigned_to_name: assignee?.full_name ?? null,
    };
  }

  async function decideWorkOrder(actor, row, { decision, notes, signature_data_uri, name }) {
    assertCanDecideWorkOrder(actor, row, decision);
    const at = iso();
    const cleanNotes = optionalText(notes, 'Notes', 2000);
    if (decision === 'rejected') {
      await store.batch([
        store.decideApprovalStmt(row.id, { status: 'rejected', decided_by: actor.id, decided_at: at, notes: cleanNotes ?? '' }),
      ]);
      return hydrateWorkOrderApproval(await store.getApproval(row.id));
    }
    const wo = await store.getWorkOrderRow(row.entity_id);
    if (!wo) throw new HttpError(404, 'Work order not found');
    if (wo.locked) throw new HttpError(409, 'This work order is already verified');
    if (wo.status !== 'completed') throw new HttpError(409, 'Only a completed work order can be signed off');
    const isCec = row.approval_role === 'cec_clearance';
    if (!isCec) {
      const blockers = workOrderVerifyBlockers(wo, row.approval_role);
      if (blockers.length) throw new HttpError(409, blockers.join(' '));
    }
    const signature = validateSignature(signature_data_uri);
    const stmts = [
      // Sign first, lock last — the frozen-work-order trigger allows nothing after.
      store.upsertWorkOrderSignoffStmt(wo.id, {
        role: row.approval_role,
        name: optionalText(name, 'Name', 200) ?? actor.full_name ?? 'Signed',
        signature_data_uri: signature,
        signed_at: at,
        signed_by: actor.id,
      }),
      // CEC clearance records the clearance; only the OM/COO verification verifies and locks.
      isCec ? store.recordCecClearanceStmt(wo.id, at, airportYmd(now())) : store.verifyWorkOrderStmt(wo.id, at),
      store.decideApprovalStmt(row.id, {
        status: 'approved',
        decided_by: actor.id,
        decided_at: at,
        notes: cleanNotes,
        signed: Boolean(signature),
      }),
    ];
    try {
      await store.batch(stmts);
    } catch (err) {
      if (/locked work order|Locked work orders/.test(String(err?.message))) {
        throw new HttpError(409, 'This work order was just verified by someone else');
      }
      throw err;
    }
    return hydrateWorkOrderApproval(await store.getApproval(row.id));
  }

  const ops = {
    // ── incidents ─────────────────────────────────────────────────────
    'incidents.list': async (actor) => store.listIncidents({ all: isSupervisor(actor), userId: actor.id }),

    'incidents.get': async (actor, { id }) => {
      const row = await visibleIncidentRow(actor, id);
      return row ? store.getIncident(row.id) : null;
    },

    'incidents.persist': async (actor, { record }) => {
      const v = validateIncidentPayload(record);
      const at = iso();
      const existing = await store.getIncidentRow(v.id);
      await assertUserExists(v.assigned_to, 'The assignee');

      if (existing) {
        assertCanEditIncident(actor, existing);
        if (v.submission_id && v.submission_id !== existing.submission_id) {
          throw new HttpError(400, 'An incident cannot move to a different checklist');
        }
        if (v.reinspection_submission_id && v.reinspection_submission_id !== existing.reinspection_submission_id) {
          await assertQualifyingReinspection(v.reinspection_submission_id, existing);
        }
        const verification = resolveVerification(actor, v.verification, existing.verification_json);
        const next = { ...v, verification };
        const workOrders = await store.listWorkOrdersForIncidents([existing.id]);
        assertIncidentTransition(
          { ...existing, verification: existing.verification_json ? JSON.parse(existing.verification_json) : null },
          next,
          { workOrders },
        );
        const becomes = (st) => v.status === st && existing.status !== st;
        const values = {
          ...v,
          // No unit means no hand-over time; otherwise keep the first one.
          assigned_at: v.assigned_team ? v.assigned_at ?? existing.assigned_at ?? at : null,
          resolved_at: becomes('resolved') ? at : existing.resolved_at,
          closed_at: becomes('closed') ? at : existing.closed_at,
          verification_json: verification ? JSON.stringify(verification) : null,
          updated_at: at,
        };
        // Same save keeps the source checklist item in step (lib/checklistSync.js).
        const after = { ...existing, ...values, verification };
        const stmts = [store.updateIncidentStmt(existing.id, values), ...(await satSyncStatements(actor, after, at))];
        const [res] = await store.batch(stmts);
        if (Number(res?.meta?.changes ?? 1) === 0) throw new HttpError(409, 'A closed incident cannot be changed');
        return store.getIncident(existing.id);
      }

      assertIncidentTransition(null, v);
      if (v.submission_id) {
        const sub = await store.getSubmissionRow(v.submission_id);
        if (!sub) throw new HttpError(400, 'The checklist this incident comes from does not exist');
        if (sub.inspector_id !== actor.id && !isSupervisor(actor)) {
          throw new HttpError(403, 'Incidents are raised from your own checklist, or by an OM, the COO or an administrator');
        }
        const items = JSON.parse(sub.items_json || '{}');
        if (v.source_item_code && !Object.hasOwn(items, v.source_item_code)) {
          throw new HttpError(400, `Item ${v.source_item_code} is not on that checklist`);
        }
      }
      if (v.reinspection_submission_id) {
        await assertQualifyingReinspection(v.reinspection_submission_id, { ...v, reported_at: at });
      }
      const verification = resolveVerification(actor, v.verification, null);
      const values = {
        ...v,
        reported_by: actor.id,
        reported_by_name: actor.full_name ?? null,
        reported_at: at,
        department: v.department ?? actor.department ?? null,
        assigned_at: v.assigned_team ? v.assigned_at ?? at : null,
        resolved_at: null,
        closed_at: null,
        verification_json: verification ? JSON.stringify(verification) : null,
        created_at: at,
        updated_at: at,
      };
      try {
        await store.batch(store.insertIncidentStmts(values, airportYear()));
      } catch (err) {
        if (/UNIQUE constraint failed: incidents\.id/.test(String(err?.message))) {
          throw new HttpError(409, 'This incident was saved somewhere else at the same moment. Reload and try again.');
        }
        throw err;
      }
      // Rare: an incident created already verified. Its number exists now.
      const created = await store.getIncidentRow(v.id);
      const sync = await satSyncStatements(actor, { ...created, verification }, at);
      if (sync.length) await store.batch(sync);
      return store.getIncident(v.id);
    },

    'incidents.addUpdate': async (actor, { incidentId, body, status_from, status_to }) => {
      const row = await visibleIncidentRow(actor, incidentId);
      if (!row) throw new HttpError(404, 'Incident not found');
      for (const st of [status_from, status_to]) {
        if (st != null && !INCIDENT_STATUSES.includes(st)) throw new HttpError(400, 'Unknown incident status');
      }
      // History may only record the status the incident is actually in.
      if (status_to != null && status_to !== row.status) {
        throw new HttpError(400, `This incident is ${row.status}, not ${status_to}`);
      }
      const update = {
        id: newId(),
        incident_id: row.id,
        author_id: actor.id,
        author_name: actor.full_name ?? null,
        body: validateUpdateBody(body),
        status_from: status_from ?? null,
        status_to: status_to ?? null,
        created_at: iso(),
      };
      await store.batch([store.insertIncidentUpdateStmt(update)]);
      return store.getIncidentUpdate(update.id);
    },

    // ── work orders ───────────────────────────────────────────────────
    'workOrders.listByIncident': async (actor, { incidentId }) => {
      const row = await visibleIncidentRow(actor, incidentId);
      return row ? store.listWorkOrdersForIncidents([row.id]) : [];
    },

    'workOrders.get': async (actor, { id }) => {
      const wo = await store.getWorkOrderRow(validId(id, 'work order id'));
      if (!wo || !(await visibleIncidentRow(actor, wo.incident_id))) return null;
      return store.getWorkOrder(wo.id);
    },

    /** Work orders on every incident this user can see — for reports. */
    'workOrders.listVisible': async (actor) => {
      const incidents = await store.listIncidents({ all: isSupervisor(actor), userId: actor.id });
      return store.listWorkOrdersForIncidents(incidents.map((i) => i.id));
    },

    'workOrders.persist': async (actor, { record }) => {
      const v = validateWorkOrderPayload(record);
      const at = iso();
      const incident = await store.getIncidentRow(v.incident_id);
      if (!incident) throw new HttpError(404, 'Incident not found');
      assertCanEditIncident(actor, incident);
      await assertUserExists(v.assigned_to_user, 'The assignee');
      const existing = await store.getWorkOrderRow(v.id);
      const stmts = [];
      if (existing) {
        if (existing.locked) throw new HttpError(409, 'Locked work orders cannot be overwritten');
        if (existing.incident_id !== v.incident_id) throw new HttpError(400, 'A work order cannot move to another incident');
        stmts.push(store.updateWorkOrderStmt(existing.id, { ...v, updated_at: at }));
        // Reopened after completion: its sign-off requests no longer apply.
        if (existing.status === 'completed' && v.status !== 'completed') {
          stmts.push(store.deletePendingApprovalsStmt(WORK_ORDER, existing.id));
        }
      } else {
        if (v.status !== 'issued') throw new HttpError(400, 'A new work order starts Issued');
        // The number's year is the airport's today, never the browser's date.
        const today = airportYmd(now());
        stmts.push(
          ...store.insertWorkOrderStmts(
            {
              ...v,
              date_issued: today,
              issued_by: actor.id,
              issued_by_name: actor.full_name ?? 'Unknown',
              noc_reference_no: incident.noc_no,
              created_at: at,
              updated_at: at,
            },
            Number(today.slice(0, 4)),
          ),
        );
      }
      if (v.status === 'completed' && existing?.status !== 'completed') {
        const omId = await store.firstActiveOm();
        const roles = ['om_coo_verification', ...(v.cec_clearance_required ? ['cec_clearance'] : [])];
        for (const role of roles) {
          if (await store.pendingApproval(WORK_ORDER, v.id, role)) continue;
          stmts.push(
            store.insertApprovalStmt({
              id: newId(),
              entity_type: WORK_ORDER,
              entity_id: v.id,
              approval_role: role,
              assigned_to: role === 'om_coo_verification' ? omId : null,
              created_at: at,
            }),
          );
        }
        if (omId && omId !== actor.id) {
          stmts.push(
            store.insertNotificationStmt({
              id: newId(),
              recipient_id: omId,
              event_type: 'work_order_awaiting_verification',
              title: 'Work order awaiting verification',
              body: `A work order on ${incident.incident_ref} is complete and ready for verification.`,
              href: `/incidents/${incident.id}?tab=work-orders&wo=${v.id}`,
              entity_type: WORK_ORDER,
              entity_id: v.id,
              created_at: at,
            }),
          );
        }
      }
      try {
        const results = await store.batch(stmts);
        if (existing && Number(results?.[0]?.meta?.changes ?? 1) === 0) {
          throw new HttpError(409, 'Locked work orders cannot be overwritten');
        }
      } catch (err) {
        if (err instanceof HttpError) throw err;
        const msg = String(err?.message ?? err);
        if (/UNIQUE constraint failed: (work_orders\.id|approvals)/.test(msg)) {
          throw new HttpError(409, 'This work order was saved somewhere else at the same moment. Reload and try again.');
        }
        if (/Locked work orders/.test(msg)) throw new HttpError(409, 'Locked work orders cannot be overwritten');
        throw err;
      }
      return store.getWorkOrder(v.id);
    },
  };

  return {
    ops,
    canSeeWorkOrderApproval,
    hydrateWorkOrderApproval,
    decideWorkOrder,
    deleteIncidentsForSubmissionStmts: (id) => store.deleteIncidentsForSubmissionStmts(id),
  };
}
