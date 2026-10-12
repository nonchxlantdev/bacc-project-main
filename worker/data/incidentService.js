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
import { isSupervisor, optionalText, validId, validateSignature } from './rules.js';

const WORK_ORDER = 'work_order';

export function createIncidentOps({ store, now, newId }) {
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
    const blockers = workOrderVerifyBlockers(wo, row.approval_role);
    if (blockers.length) throw new HttpError(409, blockers.join(' '));
    const signature = validateSignature(signature_data_uri);
    await store.batch([
      // Sign first, lock last — the frozen-work-order trigger allows nothing after.
      store.upsertWorkOrderSignoffStmt(wo.id, {
        role: row.approval_role,
        name: optionalText(name, 'Name', 200) ?? actor.full_name ?? 'Signed',
        signature_data_uri: signature,
        signed_at: at,
        signed_by: actor.id,
      }),
      store.verifyWorkOrderStmt(wo.id, at, { cecIssued: row.approval_role === 'cec_clearance' }),
      store.decideApprovalStmt(row.id, {
        status: 'approved',
        decided_by: actor.id,
        decided_at: at,
        notes: cleanNotes,
        signed: Boolean(signature),
      }),
    ]);
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
      if (v.reinspection_submission_id && !(await store.getSubmissionRow(v.reinspection_submission_id))) {
        throw new HttpError(400, 'The linked re-inspection does not exist');
      }

      if (existing) {
        assertCanEditIncident(actor, existing);
        if (v.submission_id && v.submission_id !== existing.submission_id) {
          throw new HttpError(400, 'An incident cannot move to a different checklist');
        }
        const verification = resolveVerification(actor, v.verification, existing.verification_json);
        const next = { ...v, verification };
        const workOrders = await store.listWorkOrdersForIncidents([existing.id]);
        assertIncidentTransition({ ...existing, verification: existing.verification_json ? JSON.parse(existing.verification_json) : null }, next, { workOrders });
        const becomes = (s) => v.status === s && existing.status !== s;
        const values = {
          ...v,
          assigned_at: v.assigned_at ?? existing.assigned_at ?? (becomes('assigned') ? at : null),
          resolved_at: becomes('resolved') ? at : existing.resolved_at,
          closed_at: becomes('closed') ? at : existing.closed_at,
          verification_json: verification ? JSON.stringify(verification) : null,
          updated_at: at,
        };
        const [res] = await store.batch([store.updateIncidentStmt(existing.id, values)]);
        if (Number(res?.meta?.changes ?? 1) === 0) throw new HttpError(409, 'A closed incident cannot be changed');
        return store.getIncident(existing.id);
      }

      assertIncidentTransition(null, v);
      if (v.submission_id) {
        const sub = await store.getSubmissionRow(v.submission_id);
        if (!sub) throw new HttpError(400, 'The checklist this incident comes from does not exist');
        const items = JSON.parse(sub.items_json || '{}');
        if (v.source_item_code && !Object.hasOwn(items, v.source_item_code)) {
          throw new HttpError(400, `Item ${v.source_item_code} is not on that checklist`);
        }
      }
      const verification = resolveVerification(actor, v.verification, null);
      const values = {
        ...v,
        reported_by: actor.id,
        reported_by_name: actor.full_name ?? null,
        reported_at: at,
        department: v.department ?? actor.department ?? null,
        assigned_at: v.assigned_at ?? null,
        resolved_at: null,
        closed_at: null,
        verification_json: verification ? JSON.stringify(verification) : null,
        created_at: at,
        updated_at: at,
      };
      try {
        await store.batch([store.insertIncidentStmt(values, airportYear())]);
      } catch (err) {
        if (/UNIQUE constraint failed: incidents\.id/.test(String(err?.message))) {
          throw new HttpError(409, 'This incident was saved somewhere else at the same moment. Reload and try again.');
        }
        throw err;
      }
      return store.getIncident(v.id);
    },

    'incidents.addUpdate': async (actor, { incidentId, body, status_from, status_to }) => {
      const row = await visibleIncidentRow(actor, incidentId);
      if (!row) throw new HttpError(404, 'Incident not found');
      for (const s of [status_from, status_to]) {
        if (s != null && !INCIDENT_STATUSES.includes(s)) throw new HttpError(400, 'Unknown incident status');
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
        stmts.push(store.updateWorkOrderStmt(existing.id, { ...v, date_issued: v.date_issued ?? existing.date_issued, updated_at: at }));
      } else {
        if (v.status !== 'issued') throw new HttpError(400, 'A new work order starts Issued');
        const dateIssued = v.date_issued ?? airportYmd(now());
        stmts.push(
          store.insertWorkOrderStmt(
            {
              ...v,
              date_issued: dateIssued,
              issued_by: actor.id,
              issued_by_name: actor.full_name ?? 'Unknown',
              noc_reference_no: incident.noc_no,
              created_at: at,
              updated_at: at,
            },
            Number(dateIssued.slice(0, 4)),
          ),
        );
      }
      if (v.status === 'completed' && existing?.status !== 'completed') {
        const pending = await store.pendingApproval(WORK_ORDER, v.id, 'om_coo_verification');
        if (!pending) {
          const omId = await store.firstActiveOm();
          stmts.push(
            store.insertApprovalStmt({
              id: newId(),
              entity_type: WORK_ORDER,
              entity_id: v.id,
              approval_role: 'om_coo_verification',
              assigned_to: omId,
              created_at: at,
            }),
          );
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
