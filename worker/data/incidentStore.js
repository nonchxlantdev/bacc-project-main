/**
 * All SQL for incidents, incident updates and work orders (sub-project 3b).
 * Merged into createD1DataStore() so service code sees one store.
 *
 * Numbering is allocated inside the INSERT itself
 * (`SELECT COALESCE(MAX(seq),0)+1 … WHERE year = ?`), so it is atomic: D1
 * runs one statement at a time, and UNIQUE(year, seq) backs it up.
 */
const n = (v) => (v === undefined ? null : v);
const parseJson = (text, fallback) => {
  if (text == null || text === '') return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};
const triBool = (v) => (v === null || v === undefined ? null : Boolean(v));

/** Columns a save may set (server-owned ones are set separately). */
export const INCIDENT_EDIT_COLUMNS = [
  'title', 'description', 'deficiency_level', 'category', 'incident_type', 'potential_impact',
  'immediate_action_taken', 'location_label', 'location_id', 'latitude', 'longitude', 'location_accuracy_m',
  'location_captured_at', 'location_capture_method', 'location_user_adjusted', 'status', 'department',
  'assigned_to', 'assigned_team', 'assigned_at', 'target_date', 'resolved_at', 'closed_at', 'closure_notes',
  'reinspection_submission_id', 'verification_json',
];

const INCIDENT_CREATE_COLUMNS = [
  'id', 'submission_id', 'source_template_code', 'source_section', 'source_item_code', 'source_item_description',
  'source_inspection_type', 'source_inspection_date', 'inspector_name', 'reported_by', 'reported_by_name',
  'reported_at', 'created_at', 'updated_at', ...INCIDENT_EDIT_COLUMNS,
];

export const WORK_ORDER_EDIT_COLUMNS = [
  'status', 'date_issued', 'assigned_to_name', 'assigned_to_user', 'deficiency_level', 'description_of_work',
  'location_text', 'target_completion_date', 'notam_required', 'notam_ref', 'cec_clearance_required',
  'date_works_completed', 'completed_by', 'description_of_work_performed', 'materials_used',
  'test_verification_results', 'area_cleared_for_operations', 'area_not_cleared_explanation', 'cec_clearance_date',
];

const WORK_ORDER_CREATE_COLUMNS = [
  'id', 'incident_id', 'issued_by', 'issued_by_name', 'noc_reference_no', 'created_at', 'updated_at',
  ...WORK_ORDER_EDIT_COLUMNS,
];

export function toIncidentRecord(row, updates = []) {
  if (!row) return null;
  const { verification_json, ...rest } = row;
  return {
    ...rest,
    location_user_adjusted: Boolean(row.location_user_adjusted),
    assigned_unit: row.assigned_team ?? null,
    verification: parseJson(verification_json, null),
    updates,
    attachments: [],
    pending_sync: false,
    updatedAt: row.updated_at,
  };
}

export function toWorkOrderRecord(row, signoffs = []) {
  if (!row) return null;
  return {
    ...row,
    notam_required: triBool(row.notam_required),
    cec_clearance_required: Boolean(row.cec_clearance_required),
    area_cleared_for_operations: triBool(row.area_cleared_for_operations),
    cec_clearance_issued: triBool(row.cec_clearance_issued),
    locked: Boolean(row.locked),
    exported_pdf_path: null,
    pending_sync: false,
    signoffs: signoffs.map((s) => ({
      role: s.role,
      name: s.name,
      signature_data_uri: s.signature_data_uri ?? null,
      signed_at: s.signed_at,
      signed_by: s.signed_by,
    })),
  };
}

export function createIncidentStore(db) {
  const all = async (sql, ...params) => (await db.prepare(sql).bind(...params).all()).results ?? [];
  const first = (sql, ...params) => db.prepare(sql).bind(...params).first();
  const stmt = (sql, ...params) => db.prepare(sql).bind(...params);

  async function updatesFor(ids) {
    const rows = await all(
      `SELECT * FROM incident_updates WHERE incident_id IN (SELECT value FROM json_each(?1)) ORDER BY created_at DESC, rowid DESC`,
      JSON.stringify(ids),
    );
    const out = new Map();
    for (const r of rows) {
      const list = out.get(r.incident_id) ?? [];
      list.push(r);
      out.set(r.incident_id, list);
    }
    return out;
  }

  async function woSignoffsFor(ids) {
    const rows = await all(
      'SELECT * FROM work_order_signoffs WHERE work_order_id IN (SELECT value FROM json_each(?1))',
      JSON.stringify(ids),
    );
    const out = new Map();
    for (const r of rows) {
      const list = out.get(r.work_order_id) ?? [];
      list.push(r);
      out.set(r.work_order_id, list);
    }
    return out;
  }

  return {
    // ── incidents ───────────────────────────────────────────────────────
    getIncidentRow(id) {
      return first('SELECT * FROM incidents WHERE id = ?1', id);
    },
    async getIncident(id) {
      const row = await first('SELECT * FROM incidents WHERE id = ?1', id);
      if (!row) return null;
      return toIncidentRecord(row, (await updatesFor([id])).get(id) ?? []);
    },
    /** Incidents a user may see: everything for supervisors, else reported by or assigned to them. */
    async listIncidents({ all: everything, userId }) {
      const rows = await all(
        `SELECT * FROM incidents WHERE ?1 = 1 OR reported_by = ?2 OR assigned_to = ?2 ORDER BY reported_at DESC`,
        everything ? 1 : 0,
        userId,
      );
      const updates = rows.length ? await updatesFor(rows.map((r) => r.id)) : new Map();
      return rows.map((r) => toIncidentRecord(r, updates.get(r.id) ?? []));
    },
    insertIncidentStmt(values, year) {
      const cols = INCIDENT_CREATE_COLUMNS;
      const placeholders = cols.map((_, i) => `?${i + 2}`).join(', ');
      // ?1 is the year; the number comes from the same statement.
      return stmt(
        `INSERT INTO incidents (year, seq, incident_ref, noc_no, ${cols.join(', ')})
         SELECT CAST(?1 AS INTEGER), nxt, printf('INC-%d-%04d', CAST(?1 AS INTEGER), nxt), printf('%04d', nxt), ${placeholders}
         FROM (SELECT COALESCE(MAX(seq), 0) + 1 AS nxt FROM incidents WHERE year = CAST(?1 AS INTEGER))`,
        year,
        ...cols.map((c) => n(values[c])),
      );
    },
    updateIncidentStmt(id, values) {
      const cols = [...INCIDENT_EDIT_COLUMNS, 'updated_at'];
      const sets = cols.map((c, i) => `${c} = ?${i + 2}`).join(', ');
      return stmt(`UPDATE incidents SET ${sets} WHERE id = ?1 AND status <> 'closed'`, id, ...cols.map((c) => n(values[c])));
    },
    insertIncidentUpdateStmt(u) {
      return stmt(
        `INSERT INTO incident_updates (id, incident_id, author_id, author_name, body, status_from, status_to, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        u.id, u.incident_id, u.author_id, n(u.author_name), u.body, n(u.status_from), n(u.status_to), u.created_at,
      );
    },
    getIncidentUpdate(id) {
      return first('SELECT * FROM incident_updates WHERE id = ?1', id);
    },
    /** Incidents (and their work orders + approvals) raised from a draft, for deleteDraft. */
    deleteIncidentsForSubmissionStmts(submissionId) {
      return [
        stmt(
          `DELETE FROM approvals WHERE entity_type = 'work_order' AND entity_id IN
             (SELECT w.id FROM work_orders w JOIN incidents i ON i.id = w.incident_id WHERE i.submission_id = ?1)`,
          submissionId,
        ),
        stmt('DELETE FROM work_orders WHERE incident_id IN (SELECT id FROM incidents WHERE submission_id = ?1)', submissionId),
        stmt('DELETE FROM incidents WHERE submission_id = ?1', submissionId),
      ];
    },

    // ── work orders ─────────────────────────────────────────────────────
    getWorkOrderRow(id) {
      return first('SELECT * FROM work_orders WHERE id = ?1', id);
    },
    async getWorkOrder(id) {
      const row = await first('SELECT * FROM work_orders WHERE id = ?1', id);
      if (!row) return null;
      return toWorkOrderRecord(row, (await woSignoffsFor([id])).get(id) ?? []);
    },
    async listWorkOrdersForIncidents(incidentIds) {
      if (!incidentIds.length) return [];
      const rows = await all(
        `SELECT * FROM work_orders WHERE incident_id IN (SELECT value FROM json_each(?1)) ORDER BY date_issued DESC, seq DESC`,
        JSON.stringify(incidentIds),
      );
      const signoffs = rows.length ? await woSignoffsFor(rows.map((r) => r.id)) : new Map();
      return rows.map((r) => toWorkOrderRecord(r, signoffs.get(r.id) ?? []));
    },
    insertWorkOrderStmt(values, year) {
      const cols = WORK_ORDER_CREATE_COLUMNS;
      const placeholders = cols.map((_, i) => `?${i + 2}`).join(', ');
      return stmt(
        `INSERT INTO work_orders (year, seq, work_order_number, ${cols.join(', ')})
         SELECT CAST(?1 AS INTEGER), nxt, printf('WO-%d-%04d', CAST(?1 AS INTEGER), nxt), ${placeholders}
         FROM (SELECT COALESCE(MAX(seq), 0) + 1 AS nxt FROM work_orders WHERE year = CAST(?1 AS INTEGER))`,
        year,
        ...cols.map((c) => n(values[c])),
      );
    },
    updateWorkOrderStmt(id, values) {
      const cols = [...WORK_ORDER_EDIT_COLUMNS, 'updated_at'];
      const sets = cols.map((c, i) => `${c} = ?${i + 2}`).join(', ');
      return stmt(`UPDATE work_orders SET ${sets} WHERE id = ?1 AND locked = 0`, id, ...cols.map((c) => n(values[c])));
    },
    upsertWorkOrderSignoffStmt(workOrderId, s) {
      return stmt(
        `INSERT INTO work_order_signoffs (work_order_id, role, name, signature_data_uri, signed_at, signed_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(work_order_id, role) DO UPDATE SET name = excluded.name,
           signature_data_uri = excluded.signature_data_uri, signed_at = excluded.signed_at, signed_by = excluded.signed_by`,
        workOrderId, s.role, s.name, n(s.signature_data_uri), s.signed_at, s.signed_by,
      );
    },
    verifyWorkOrderStmt(id, nowIso, { cecIssued = false } = {}) {
      return stmt(
        `UPDATE work_orders SET status = 'verified', locked = 1, updated_at = ?2,
           cec_clearance_issued = CASE WHEN ?3 = 1 THEN 1 ELSE cec_clearance_issued END,
           cec_clearance_date = CASE WHEN ?3 = 1 AND cec_clearance_date IS NULL THEN substr(?2, 1, 10) ELSE cec_clearance_date END
         WHERE id = ?1 AND locked = 0`,
        id, nowIso, cecIssued ? 1 : 0,
      );
    },
  };
}
