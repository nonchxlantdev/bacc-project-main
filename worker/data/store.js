/**
 * Every SQL statement for portal data (sub-project 3a) lives here.
 *
 * Reads are async functions returning plain rows or records. Writes are
 * statement builders: service.js collects them and runs them through
 * `batch()`, so a multi-table change (submit, acknowledge, amend) is one
 * all-or-nothing D1 transaction. Tests run this same file against SQLite
 * (tests/helpers/sqliteD1.js).
 */

import { createIncidentStore } from './incidentStore.js';

const parseJson = (text, fallback) => {
  if (text == null || text === '') return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

const bool = (v) => (v ? 1 : 0);
/** D1 cannot bind undefined. */
const n = (v) => (v === undefined ? null : v);

const PUBLIC_USER_COLUMNS =
  'u.id, u.email, u.full_name, u.position, u.role, u.department, u.is_active, u.can_login, u.is_approver, u.location_id, u.has_ever_signed';

function mapPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    position: row.position ?? '',
    role: row.role,
    department: row.department ?? null,
    location_id: row.location_id ?? null,
    is_active: Boolean(row.is_active),
    can_login: Boolean(row.can_login),
    is_approver: Boolean(row.is_approver),
    has_ever_signed: Boolean(row.has_ever_signed),
    avatar_url: null,
  };
}

function mapSignoff(row) {
  return {
    role: row.role,
    name: row.name,
    position: row.position ?? null,
    signature_data_uri: row.signature_data_uri ?? null,
    has_signature: Boolean(row.signature_data_uri),
    signed_at: row.signed_at,
    signed_by: row.signed_by,
  };
}

/** Lists never carry signature images (size, and privacy): the flag only. */
function mapListedSignoff(row) {
  const { signature_data_uri: _omit, ...rest } = mapSignoff(row);
  return rest;
}

function groupDrawings(rows) {
  const out = {};
  for (const row of rows) {
    const key = row.section_key ?? '';
    (out[key] ??= []).push({
      id: row.id,
      label: row.label ?? '',
      contentType: row.content_type || 'image/jpeg',
      dataUri: row.data_uri,
      addedAt: row.added_at,
    });
  }
  return out;
}

/** A stored checklist as the browser's record shape (minus registry fields). */
export function toRecord(row, { signoffs = [], drawings, amendments = [], inspectorName = null } = {}) {
  const form = parseJson(row.form_json, {});
  const record = {
    ...form,
    id: row.id,
    template_id: row.template_id,
    template_version: row.template_version,
    location_id: row.location_id ?? null,
    inspector_id: row.inspector_id,
    inspector_name: inspectorName,
    inspection_type: row.inspection_type ?? null,
    inspection_date: row.inspection_date ?? null,
    status: row.status,
    locked: Boolean(row.locked),
    deficiencies_summary: row.deficiencies_summary ?? '',
    supersedes_id: row.supersedes_id ?? null,
    reopened_at: row.reopened_at ?? null,
    reopened_by: row.reopened_by ?? null,
    content_hash: row.content_hash ?? null,
    exported_pdf_path: null,
    created_at: row.created_at,
    submitted_at: row.submitted_at ?? null,
    updatedAt: row.updated_at,
    pending_sync: false,
    header: parseJson(row.header_json, {}),
    items: parseJson(row.items_json, {}),
    signoffs,
    amendments,
  };
  if (drawings) record.attachments = groupDrawings(drawings);
  return record;
}

export function createD1DataStore(db) {
  return { ...createCoreStore(db), ...createIncidentStore(db) };
}

function createCoreStore(db) {
  const all = async (sql, ...params) => (await db.prepare(sql).bind(...params).all()).results ?? [];
  const first = (sql, ...params) => db.prepare(sql).bind(...params).first();
  const stmt = (sql, ...params) => db.prepare(sql).bind(...params);

  /** Rows of `audit_log` amend entries, folded later by rules.foldAmendments. */
  async function amendRowsBySubmission(ids) {
    const rows = ids
      ? await all(
          `SELECT entity_id, detail_json FROM audit_log
           WHERE entity_type = 'checklist_submission' AND action = 'amend_item'
             AND entity_id IN (SELECT value FROM json_each(?1)) ORDER BY created_at, rowid`,
          JSON.stringify(ids),
        )
      : await all(
          `SELECT entity_id, detail_json FROM audit_log
           WHERE entity_type = 'checklist_submission' AND action = 'amend_item' ORDER BY created_at, rowid`,
        );
    const out = new Map();
    for (const row of rows) {
      const list = out.get(row.entity_id) ?? [];
      list.push(parseJson(row.detail_json, null));
      out.set(row.entity_id, list);
    }
    return out;
  }

  async function signoffsBySubmission(ids) {
    const rows = ids
      ? await all(
          `SELECT submission_id, role, name, position, signed_at, signed_by,
             CASE WHEN signature_data_uri IS NULL THEN NULL ELSE 'x' END AS signature_data_uri
           FROM checklist_signoffs WHERE submission_id IN (SELECT value FROM json_each(?1))`,
          JSON.stringify(ids),
        )
      : await all(
          `SELECT submission_id, role, name, position, signed_at, signed_by,
             CASE WHEN signature_data_uri IS NULL THEN NULL ELSE 'x' END AS signature_data_uri
           FROM checklist_signoffs`,
        );
    const out = new Map();
    for (const row of rows) {
      const list = out.get(row.submission_id) ?? [];
      list.push(mapListedSignoff(row));
      out.set(row.submission_id, list);
    }
    return out;
  }

  return {
    batch: (statements) => (statements.length ? db.batch(statements) : Promise.resolve([])),

    // ── users ────────────────────────────────────────────────────────────
    async listUsers() {
      return (await all(`SELECT ${PUBLIC_USER_COLUMNS} FROM users u ORDER BY u.full_name COLLATE NOCASE`)).map(
        mapPublicUser,
      );
    },
    async getUser(id) {
      return mapPublicUser(await first(`SELECT ${PUBLIC_USER_COLUMNS} FROM users u WHERE u.id = ?1`, id));
    },
    async getUserByEmail(email) {
      return mapPublicUser(
        await first(`SELECT ${PUBLIC_USER_COLUMNS} FROM users u WHERE u.email = ?1 COLLATE NOCASE`, email),
      );
    },
    /** The account's own guided-tour progress; never part of the public user row. */
    async getToursSeen(userId) {
      const row = await first('SELECT tours_seen FROM users WHERE id = ?1', userId);
      try {
        const parsed = JSON.parse(row?.tours_seen || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    },
    async getSignature(userId) {
      const row = await first('SELECT * FROM profile_signatures WHERE user_id = ?1', userId);
      return {
        stored_signature_data_uri: row?.stored_signature_data_uri ?? null,
        stored_signature_updated_at: row?.stored_signature_updated_at ?? null,
        hide_signature_prompt: Boolean(row?.hide_signature_prompt),
      };
    },
    async firstActiveOm() {
      const row = await first(
        "SELECT id FROM users WHERE role = 'om' AND is_active = 1 ORDER BY created_at, id LIMIT 1",
      );
      return row?.id ?? null;
    },
    updateProfileStmt(id, fields, nowIso) {
      const cols = Object.keys(fields);
      const sets = cols.map((c, i) => `${c} = ?${i + 1}`).join(', ');
      const values = cols.map((c) => (typeof fields[c] === 'boolean' ? bool(fields[c]) : n(fields[c])));
      return stmt(`UPDATE users SET ${sets}, updated_at = ?${cols.length + 1} WHERE id = ?${cols.length + 2}`, ...values, nowIso, id);
    },
    upsertSignatureStmt(userId, fields) {
      const cols = Object.keys(fields);
      const values = cols.map((c) => (typeof fields[c] === 'boolean' ? bool(fields[c]) : n(fields[c])));
      const placeholders = cols.map((_, i) => `?${i + 2}`).join(', ');
      const updates = cols.map((c) => `${c} = excluded.${c}`).join(', ');
      return stmt(
        `INSERT INTO profile_signatures (user_id${cols.map((c) => `, ${c}`).join('')}) VALUES (?1${cols.length ? `, ${placeholders}` : ''})
         ON CONFLICT(user_id) DO UPDATE SET ${updates || 'user_id = excluded.user_id'}`,
        userId,
        ...values,
      );
    },

    // ── checklists ───────────────────────────────────────────────────────
    getSubmissionRow(id) {
      return first('SELECT * FROM checklist_submissions WHERE id = ?1', id);
    },
    async getSubmission(id) {
      const row = await first(
        `SELECT s.*, u.full_name AS inspector_name FROM checklist_submissions s
         LEFT JOIN users u ON u.id = s.inspector_id WHERE s.id = ?1`,
        id,
      );
      if (!row) return null;
      const [signoffs, drawings, amend] = await Promise.all([
        all('SELECT * FROM checklist_signoffs WHERE submission_id = ?1', id),
        all('SELECT * FROM checklist_drawings WHERE submission_id = ?1 ORDER BY section_key, position', id),
        amendRowsBySubmission([id]),
      ]);
      return {
        row,
        record: toRecord(row, {
          signoffs: signoffs.map(mapSignoff),
          drawings,
          inspectorName: row.inspector_name ?? null,
        }),
        amendmentRows: amend.get(id) ?? [],
      };
    },
    /** Every checklist (or one inspector's), newest first, without drawing data. */
    async listSubmissions({ inspectorId = null } = {}) {
      const rows = inspectorId
        ? await all(
            `SELECT s.*, u.full_name AS inspector_name FROM checklist_submissions s
             LEFT JOIN users u ON u.id = s.inspector_id WHERE s.inspector_id = ?1 ORDER BY s.created_at DESC`,
            inspectorId,
          )
        : await all(
            `SELECT s.*, u.full_name AS inspector_name FROM checklist_submissions s
             LEFT JOIN users u ON u.id = s.inspector_id ORDER BY s.created_at DESC`,
          );
      const ids = inspectorId ? rows.map((r) => r.id) : null;
      const [signoffs, amend] = await Promise.all([signoffsBySubmission(ids), amendRowsBySubmission(ids)]);
      return rows.map((row) => ({
        row,
        record: toRecord(row, { signoffs: signoffs.get(row.id) ?? [], inspectorName: row.inspector_name ?? null }),
        amendmentRows: amend.get(row.id) ?? [],
      }));
    },
    async signoffRows(submissionId) {
      return all('SELECT * FROM checklist_signoffs WHERE submission_id = ?1', submissionId);
    },
    insertSubmissionStmt(r) {
      return stmt(
        `INSERT INTO checklist_submissions (id, template_id, template_version, inspector_id, location_id, status, locked,
           inspection_type, inspection_date, header_json, items_json, form_json, deficiencies_summary, supersedes_id,
           created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'draft', 0, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)`,
        r.id, r.template_id, r.template_version, r.inspector_id, n(r.location_id), n(r.inspection_type),
        n(r.inspection_date), r.header_json, r.items_json, r.form_json, n(r.deficiencies_summary),
        n(r.supersedes_id), r.now,
      );
    },
    updateDraftStmt(r) {
      return stmt(
        `UPDATE checklist_submissions SET template_version = ?2, location_id = ?3, inspection_type = ?4,
           inspection_date = ?5, header_json = ?6, items_json = ?7, form_json = ?8, deficiencies_summary = ?9,
           updated_at = ?10
         WHERE id = ?1 AND locked = 0 AND status = 'draft'`,
        r.id, r.template_version, n(r.location_id), n(r.inspection_type), n(r.inspection_date), r.header_json,
        r.items_json, r.form_json, n(r.deficiencies_summary), r.now,
      );
    },
    /** Replace every sign-off except the OM acknowledgment block. */
    replaceSignoffsStmts(submissionId, blocks) {
      return [
        stmt(`DELETE FROM checklist_signoffs WHERE submission_id = ?1 AND role <> 'om_acknowledgment'`, submissionId),
        ...blocks.map((b) =>
          stmt(
            `INSERT INTO checklist_signoffs (submission_id, role, name, position, signature_data_uri, signed_at, signed_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
            submissionId, b.role, b.name, n(b.position), n(b.signature_data_uri), b.signed_at, b.signed_by,
          ),
        ),
      ];
    },
    replaceDrawingsStmts(submissionId, drawings) {
      return [
        stmt('DELETE FROM checklist_drawings WHERE submission_id = ?1', submissionId),
        ...drawings.map((d) =>
          stmt(
            `INSERT INTO checklist_drawings (id, submission_id, section_key, position, label, content_type, data_uri, added_by, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
            d.id, submissionId, d.section_key, d.position, d.label, d.content_type, d.data_uri, d.added_by, d.added_at,
          ),
        ),
      ];
    },
    lockSubmittedStmt(id, nowIso) {
      return stmt(
        `UPDATE checklist_submissions SET status = 'submitted', locked = 1, submitted_at = ?2, updated_at = ?2
         WHERE id = ?1 AND status = 'draft' AND locked = 0`,
        id, nowIso,
      );
    },
    /** OM "Return for changes": a submitted (never a signed-off) record back to its inspector's draft. */
    returnForChangesStmt(id, nowIso) {
      return stmt(
        `UPDATE checklist_submissions SET status = 'draft', locked = 0, submitted_at = NULL, updated_at = ?2
         WHERE id = ?1 AND status = 'submitted' AND locked = 1`,
        id, nowIso,
      );
    },
    acknowledgeStmt(id, nowIso) {
      return stmt(
        `UPDATE checklist_submissions SET status = 'acknowledged', updated_at = ?2 WHERE id = ?1 AND status = 'submitted'`,
        id, nowIso,
      );
    },
    upsertOmSignoffStmt(submissionId, b) {
      return stmt(
        `INSERT INTO checklist_signoffs (submission_id, role, name, position, signature_data_uri, signed_at, signed_by)
         VALUES (?1, 'om_acknowledgment', ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(submission_id, role) DO UPDATE SET name = excluded.name, position = excluded.position,
           signature_data_uri = excluded.signature_data_uri, signed_at = excluded.signed_at, signed_by = excluded.signed_by`,
        submissionId, b.name, n(b.position), n(b.signature_data_uri), b.signed_at, b.signed_by,
      );
    },
    amendItemsStmt(id, itemsJson, reopenedAt, by) {
      return stmt(
        `UPDATE checklist_submissions SET items_json = ?2, reopened_at = ?3, reopened_by = ?4, updated_at = ?3 WHERE id = ?1`,
        id, itemsJson, reopenedAt, by,
      );
    },
    deleteSubmissionStmts(id) {
      return [
        stmt(`DELETE FROM approvals WHERE entity_type = 'checklist_submission' AND entity_id = ?1`, id),
        stmt('DELETE FROM checklist_submissions WHERE id = ?1 AND locked = 0', id),
      ];
    },

    // ── approvals ────────────────────────────────────────────────────────
    getApproval(id) {
      return first('SELECT * FROM approvals WHERE id = ?1', id);
    },
    pendingApproval(entityType, entityId, role) {
      return first(
        `SELECT * FROM approvals WHERE entity_type = ?1 AND entity_id = ?2 AND approval_role = ?3 AND status = 'pending'`,
        entityType, entityId, role,
      );
    },
    /** The most recent decided approval of this kind (for a returned draft's note). */
    latestDecision(entityType, entityId, role) {
      return first(
        `SELECT * FROM approvals WHERE entity_type = ?1 AND entity_id = ?2 AND approval_role = ?3 AND status <> 'pending'
         ORDER BY decided_at DESC LIMIT 1`,
        entityType, entityId, role,
      );
    },
    listApprovals({ status = null, entityType = null } = {}) {
      return all(
        `SELECT * FROM approvals WHERE (?1 IS NULL OR status = ?1) AND (?2 IS NULL OR entity_type = ?2)
         ORDER BY created_at DESC`,
        status, entityType,
      );
    },
    insertApprovalStmt(a) {
      return stmt(
        `INSERT INTO approvals (id, entity_type, entity_id, approval_role, assigned_to, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6)`,
        a.id, a.entity_type, a.entity_id, a.approval_role, n(a.assigned_to), a.created_at,
      );
    },
    decideApprovalStmt(id, { status, decided_by, decided_at, notes = null, signed = false }) {
      return stmt(
        `UPDATE approvals SET status = ?2, decided_by = ?3, decided_at = ?4, notes = COALESCE(?5, notes), signed = ?6
         WHERE id = ?1 AND status = 'pending'`,
        id, status, decided_by, decided_at, n(notes), bool(signed),
      );
    },

    // ── schedule ─────────────────────────────────────────────────────────
    listRules({ activeOnly = true } = {}) {
      return all(
        `SELECT * FROM assignment_rules WHERE (?1 = 0 OR active = 1) ORDER BY template_id, id`,
        activeOnly ? 1 : 0,
      );
    },
    listInstances() {
      return all('SELECT * FROM checklist_instances ORDER BY due_at');
    },
    listInstanceKeys() {
      return all('SELECT assignment_rule_id, period_start FROM checklist_instances');
    },
    listUnlinkedInstances(templateId) {
      return all('SELECT * FROM checklist_instances WHERE template_id = ?1 AND submission_id IS NULL', templateId);
    },
    countInstances: async () => Number((await first('SELECT COUNT(*) AS c FROM checklist_instances'))?.c ?? 0),
    insertInstanceStmt(i) {
      return stmt(
        `INSERT OR IGNORE INTO checklist_instances (id, template_id, template_version, assignment_rule_id, assigned_role,
           assigned_department, assigned_user, location_id, period_start, period_end, due_at, status, submission_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, NULL, ?13)`,
        i.id, i.template_id, i.template_version || 'ed01', i.assignment_rule_id, n(i.assigned_role),
        n(i.assigned_department), n(i.assigned_user), n(i.location_id), i.period_start, i.period_end, i.due_at,
        i.status || 'pending', i.created_at,
      );
    },
    /** A returned checklist no longer completes its schedule slot. */
    unlinkInstancesStmt(submissionId) {
      return stmt(
        `UPDATE checklist_instances SET submission_id = NULL, status = 'pending', completed_at = NULL
         WHERE submission_id = ?1`,
        submissionId,
      );
    },
    linkInstanceStmt(id, submissionId, completedAt) {
      return stmt(
        `UPDATE checklist_instances SET submission_id = ?2, status = 'submitted', completed_at = ?3
         WHERE id = ?1 AND submission_id IS NULL`,
        id, submissionId, n(completedAt),
      );
    },

    // ── notifications ────────────────────────────────────────────────────
    listNotifications(recipientId) {
      return all('SELECT * FROM notifications WHERE recipient_id = ?1 ORDER BY created_at DESC LIMIT 200', recipientId);
    },
    async unreadCount(recipientId) {
      return Number(
        (await first('SELECT COUNT(*) AS c FROM notifications WHERE recipient_id = ?1 AND read_at IS NULL', recipientId))
          ?.c ?? 0,
      );
    },
    markReadStmt(id, recipientId, nowIso) {
      return stmt(
        'UPDATE notifications SET read_at = ?3 WHERE id = ?1 AND recipient_id = ?2 AND read_at IS NULL',
        id, recipientId, nowIso,
      );
    },
    markAllReadStmt(recipientId, nowIso) {
      return stmt('UPDATE notifications SET read_at = ?2 WHERE recipient_id = ?1 AND read_at IS NULL', recipientId, nowIso);
    },
    insertNotificationStmt(x) {
      return stmt(
        `INSERT INTO notifications (id, recipient_id, event_type, title, body, href, entity_type, entity_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
        x.id, x.recipient_id, x.event_type, x.title, n(x.body), n(x.href), n(x.entity_type), n(x.entity_id), x.created_at,
      );
    },

    // ── settings ─────────────────────────────────────────────────────────
    async getSettings() {
      const out = {};
      for (const row of await all('SELECT section, value_json FROM app_settings')) {
        out[row.section] = parseJson(row.value_json, null);
      }
      return out;
    },
    upsertSettingStmt(section, valueJson, nowIso, by) {
      return stmt(
        `INSERT INTO app_settings (section, value_json, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(section) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`,
        section, valueJson, nowIso, n(by),
      );
    },
    deleteSettingStmt(section) {
      return stmt('DELETE FROM app_settings WHERE section = ?1', section);
    },
    insertSettingsAuditStmt(a) {
      return stmt(
        `INSERT INTO settings_audit (id, section, action, from_json, to_json, by, by_name, at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        a.id, a.section, a.action, n(a.from_json), n(a.to_json), n(a.by), n(a.by_name), a.at,
      );
    },
    async listSettingsAudit() {
      return (await all('SELECT * FROM settings_audit ORDER BY at DESC, rowid DESC LIMIT 500')).map((row) => ({
        id: row.id,
        section: row.section,
        action: row.action,
        from: parseJson(row.from_json, null),
        to: parseJson(row.to_json, null),
        by: row.by,
        by_name: row.by_name,
        at: row.at,
      }));
    },

    // ── audit ────────────────────────────────────────────────────────────
    insertAuditStmt(a) {
      return stmt(
        `INSERT INTO audit_log (id, entity_type, entity_id, action, actor_id, detail_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        a.id, a.entity_type, a.entity_id, a.action, n(a.actor_id), a.detail_json, a.created_at,
      );
    },
  };
}
