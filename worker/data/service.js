/**
 * Portal data operations (sub-projects 3a and 3b — incidents and work orders
 * live in incidentService.js and are composed in here). One method per API op, each
 * `(actor, args) => result`, where `actor` is the D1 session user.
 *
 * No SQL here (store.js) and no permission tables (rules.js). Multi-table
 * changes are collected as statements and run as ONE batch, so a submit or an
 * acknowledgment either fully happens or not at all.
 */
import { HttpError } from '../../api/_shared.js';
import { generatePendingInstances, linkSubmissionToInstance, refreshInstanceStatuses } from '../../src/lib/instanceGeneration.js';
import { addAirportDays, airportYmd } from '../../src/lib/belizeTime.js';
import {
  LOCKED_MESSAGE,
  assertCanAcknowledge,
  assertCanAmend,
  assertCanCorrect,
  assertCanDecide,
  assertCanDeleteDraft,
  assertCanEditDraft,
  assertCanRecall,
  assertCanGenerate,
  assertCanSeeApproval,
  assertCanSubmit,
  assertCanWriteSettings,
  assertSelf,
  canSeeOthersSignatures,
  foldAmendments,
  isSupervisor,
  optionalText,
  validId,
  validateProfilePatch,
  validateRecordPayload,
  validateResult,
  validateSettingsSection,
  validateSettingsValue,
  validateSignature,
  canSeeChecklist,
  validateSignDate,
  validateReturnNote,
} from './rules.js';
import { OM_SIGNOFF_ROLE, isApproverSignoffRole } from '../../src/config/approverRoles.js';
import { createIncidentOps } from './incidentService.js';

export const BACKFILL_DAYS = 120;
const CHECKLIST = 'checklist_submission';

const notFound = (what) => new HttpError(404, `${what} not found`);

export function createDataService({ store, forms = null, now = () => Date.now(), newId = () => crypto.randomUUID() }) {
  const iso = () => new Date(now()).toISOString();
  const incidentOps = createIncidentOps({ store, forms, now, newId });

  function templateTitle(templateId) {
    try {
      return forms?.loadSchema?.(templateId)?.title || templateId;
    } catch {
      return templateId;
    }
  }

  function assertKnownTemplate(templateId) {
    if (!templateId) throw new HttpError(400, 'template_id is required');
    if (forms?.templateKeys && !forms.templateKeys.has(templateId)) {
      throw new HttpError(400, `Unknown form: ${templateId}`);
    }
  }

  function finish({ record, amendmentRows }) {
    return { ...record, amendments: foldAmendments(amendmentRows.filter(Boolean)) };
  }

  async function getChecklist(actor, { id }) {
    const hit = await store.getSubmission(validId(id));
    if (!hit || !canSeeChecklist(actor, hit.row)) return null;
    const out = finish(hit);
    // A returned draft carries the OM's reason so the inspector knows what to fix.
    if (hit.row.status === 'draft') {
      const back = await store.latestDecision(CHECKLIST, hit.row.id, OM_SIGNOFF_ROLE);
      // An inspector recalling their own submission is not a return for changes.
      if (back?.status === 'rejected' && back.decided_by !== hit.row.inspector_id) {
        const by = back.decided_by ? await store.getUser(back.decided_by) : null;
        out.returned = { note: back.notes ?? '', at: back.decided_at, by_name: by?.full_name ?? null };
      }
    }
    return out;
  }

  /** The form code for a registry key, when the form store knows it. */
  function codeFor(templateId) {
    try {
      return forms?.loadSchema?.(templateId)?.code ?? null;
    } catch {
      return null;
    }
  }

  async function withSignature(actor, user) {
    if (!user) return null;
    const self = user.id === actor.id;
    if (!self && !canSeeOthersSignatures(actor)) return user;
    const withSig = { ...user, ...(await store.getSignature(user.id)) };
    // Tour progress is the account's own business — even supervisors, who may
    // see a colleague's signature, never get it.
    return self ? { ...withSig, tours_seen: await store.getToursSeen(user.id) } : withSig;
  }

  /** Statements that acknowledge a submitted checklist (shared by acknowledge and approvals.decide). */
  async function acknowledgeStatements(actor, { id, name, position, signature_data_uri, sign_date, notes }) {
    assertCanAcknowledge(actor);
    const row = await store.getSubmissionRow(validId(id));
    if (!row) throw notFound('Checklist');
    if (row.status === 'draft') throw new HttpError(409, 'Drafts cannot be acknowledged');
    if (row.status === 'acknowledged') throw new HttpError(409, 'This checklist is already acknowledged');
    const signature = validateSignature(signature_data_uri);
    const signDate = validateSignDate(sign_date);
    const at = iso();
    const signerName = optionalText(name, 'Name', 200) ?? actor.full_name ?? 'Signed';
    const signerPosition = optionalText(position, 'Position', 200) ?? actor.position ?? null;
    const cleanNotes = optionalText(notes, 'Notes', 2000);
    const stmts = [
      store.upsertOmSignoffStmt(row.id, {
        name: signerName,
        position: signerPosition || null,
        signature_data_uri: signature,
        sign_date: signDate,
        signed_at: at,
        signed_by: actor.id,
      }),
      store.acknowledgeStmt(row.id, at),
    ];
    const pending = await store.pendingApproval(CHECKLIST, row.id, 'om_acknowledgment');
    if (pending) {
      stmts.push(
        store.decideApprovalStmt(pending.id, {
          status: 'approved',
          decided_by: actor.id,
          decided_at: at,
          notes: cleanNotes,
          signed: Boolean(signature),
        }),
      );
    }
    if (row.inspector_id !== actor.id) {
      stmts.push(
        store.insertNotificationStmt({
          id: newId(),
          recipient_id: row.inspector_id,
          event_type: 'checklist_acknowledged',
          title: 'Checklist acknowledged',
          body: `${templateTitle(row.template_id)} (${row.inspection_date ?? 'undated'}) was acknowledged by ${signerName}.`,
          href: `/checklists/${row.id}`,
          entity_type: CHECKLIST,
          entity_id: row.id,
          created_at: at,
        }),
      );
    }
    return { row, stmts };
  }

  async function hydrateApproval(row) {
    if (!row) return null;
    let entity = null;
    if (row.entity_type === CHECKLIST) {
      const sub = await store.getSubmissionRow(row.entity_id);
      const filer = sub ? await store.getUser(sub.inspector_id) : null;
      entity = sub
        ? {
            id: sub.id,
            template_id: sub.template_id,
            filed_by: filer?.full_name ?? null,
            date: sub.inspection_date,
            href: `/checklists/${sub.id}`,
            status: sub.status,
          }
        : null;
    }
    const assignee = row.assigned_to ? await store.getUser(row.assigned_to) : null;
    return {
      ...row,
      signed: Boolean(row.signed),
      signature_image_path: row.signed ? 'local-signature' : null,
      entity,
      assigned_to_name: assignee?.full_name ?? null,
    };
  }

  return {
    // ── users ──────────────────────────────────────────────────────────
    'users.list': async () => store.listUsers(),
    'users.listLogins': async () => (await store.listUsers()).filter((u) => u.is_active && u.can_login),
    'users.getById': async (actor, { id }) => withSignature(actor, await store.getUser(validId(id))),
    'users.getByEmail': async (actor, { email }) => withSignature(actor, await store.getUserByEmail(String(email ?? ''))),
    'users.update': async (actor, { id, patch }) => {
      assertSelf(actor, id);
      const { profile, signature } = validateProfilePatch(patch);
      const at = iso();
      if (signature.stored_signature_data_uri && signature.stored_signature_updated_at === undefined) {
        signature.stored_signature_updated_at = at;
      }
      const stmts = [];
      if (Object.keys(profile).length) stmts.push(store.updateProfileStmt(actor.id, profile, at));
      if (Object.keys(signature).length) stmts.push(store.upsertSignatureStmt(actor.id, signature));
      await store.batch(stmts);
      return withSignature(actor, await store.getUser(actor.id));
    },

    // ── checklists ─────────────────────────────────────────────────────
    'checklists.listMine': async (actor) => (await store.listSubmissions({ inspectorId: actor.id })).map(finish),
    'checklists.listAll': async (actor) =>
      (await store.listSubmissions()).filter((hit) => canSeeChecklist(actor, hit.row)).map(finish),
    'checklists.get': getChecklist,

    'checklists.persist': async (actor, { record }) => {
      const v = validateRecordPayload(record);
      const at = iso();
      const existing = await store.getSubmissionRow(v.id);
      let inspectorId = actor.id;
      if (existing) {
        if (existing.locked || existing.status !== 'draft') throw new HttpError(409, LOCKED_MESSAGE);
        assertCanEditDraft(actor, existing);
        if (v.template_id && v.template_id !== existing.template_id) {
          throw new HttpError(400, 'A draft cannot change to a different form');
        }
        inspectorId = existing.inspector_id;
      } else {
        assertKnownTemplate(v.template_id);
        if (v.supersedes_id) {
          const original = await store.getSubmissionRow(v.supersedes_id);
          if (!original) throw new HttpError(400, 'The checklist being corrected does not exist');
          if (!original.locked) throw new HttpError(400, 'Only a filed checklist can be corrected');
          assertCanCorrect(actor);
          if (original.status !== 'acknowledged') {
            throw new HttpError(409, 'Only a checklist the OM has signed off can be corrected. Return it for changes instead.');
          }
          if (v.template_id !== original.template_id) {
            throw new HttpError(400, 'A correction must use the same form as the checklist it corrects');
          }
        }
      }
      const submitting = v.status === 'submitted';
      if (submitting) assertCanSubmit(actor, existing ?? { inspector_id: inspectorId, status: 'draft', locked: 0 });

      const templateId = existing?.template_id ?? v.template_id;
      const row = { ...v, template_id: templateId, inspector_id: inspectorId, now: at };
      const stmts = [existing ? store.updateDraftStmt(row) : store.insertSubmissionStmt(row)];

      // Sign-offs: a block whose content is unchanged keeps who signed it;
      // anything new or changed is attributed to the session user.
      const previous = existing ? await store.signoffRows(v.id) : [];
      const byRole = new Map(previous.map((p) => [p.role, p]));
      // Times are the server's: a new or changed block is signed "now".
      // The OM's box is filled only by the approval, never from a draft or a submit.
      const code = codeFor(templateId);
      const blocks = v.signoffs.filter((b) => !isApproverSignoffRole(code, b.role)).map(({ has_signature, ...b }) => {
        const old = byRole.get(b.role);
        // A record read from a list carries `has_signature` instead of the
        // image; keep the stored image rather than wiping it.
        const signature = b.signature_data_uri ?? (has_signature ? old?.signature_data_uri ?? null : null);
        const same =
          old &&
          old.name === b.name &&
          (old.position ?? null) === (b.position ?? null) &&
          (old.signature_data_uri ?? null) === (signature ?? null) &&
          (old.sign_date ?? null) === (b.sign_date ?? null);
        return {
          ...b,
          signature_data_uri: signature,
          signed_at: same ? old.signed_at : at,
          signed_by: same ? old.signed_by : actor.id,
        };
      });
      stmts.push(...store.replaceSignoffsStmts(v.id, blocks));

      if (v.drawings && (v.drawings_changed || !existing)) {
        stmts.push(
          ...store.replaceDrawingsStmts(
            v.id,
            v.drawings.map((d) => ({ ...d, id: d.id ?? newId(), added_by: actor.id, added_at: d.added_at || at })),
          ),
        );
      }

      if (submitting) {
        stmts.push(store.lockSubmittedStmt(v.id, at));
        const pending = await store.pendingApproval(CHECKLIST, v.id, 'om_acknowledgment');
        const omId = await store.firstActiveOm();
        if (!pending) {
          stmts.push(
            store.insertApprovalStmt({
              id: newId(),
              entity_type: CHECKLIST,
              entity_id: v.id,
              approval_role: 'om_acknowledgment',
              assigned_to: omId,
              created_at: at,
            }),
          );
        }
        const open = await store.listUnlinkedInstances(templateId);
        const linked = linkSubmissionToInstance(open, {
          id: v.id,
          template_id: templateId,
          inspector_id: inspectorId,
          inspection_date: v.inspection_date,
        });
        linked.forEach((inst, i) => {
          if (inst.submission_id && !open[i].submission_id) {
            stmts.push(store.linkInstanceStmt(inst.id, v.id, inst.completed_at ?? v.inspection_date));
          }
        });
        if (omId && omId !== actor.id) {
          stmts.push(
            store.insertNotificationStmt({
              id: newId(),
              recipient_id: omId,
              event_type: 'approval_required',
              title: 'Approval required',
              body: `${templateTitle(templateId)} filed by ${actor.full_name} is waiting for your acknowledgment.`,
              href: `/checklists/${v.id}`,
              entity_type: CHECKLIST,
              entity_id: v.id,
              created_at: at,
            }),
          );
        }
      }

      let results;
      try {
        results = await store.batch(stmts);
      } catch (err) {
        const msg = String(err?.message ?? err);
        if (/UNIQUE constraint failed: (checklist_submissions|approvals)/.test(msg)) {
          throw new HttpError(409, 'This checklist was saved somewhere else at the same moment. Reload and try again.');
        }
        if (/cannot be overwritten|cannot change/.test(msg)) throw new HttpError(409, LOCKED_MESSAGE);
        throw err;
      }
      // The draft UPDATE only matches an unlocked draft. Zero rows means a
      // submit got there first: say so rather than reporting a save that
      // did not happen.
      if (existing && Number(results?.[0]?.meta?.changes ?? 1) === 0) throw new HttpError(409, LOCKED_MESSAGE);
      return getChecklist(actor, { id: v.id });
    },

    // The inspector pulls their own submission back to a draft before the OM
    // signs it — the same submitted -> draft move as Return for changes
    // (migration 0005), started by the inspector instead of the OM.
    'checklists.recall': async (actor, { id }) => {
      const row = await store.getSubmissionRow(validId(id));
      if (!row || !canSeeChecklist(actor, row)) throw notFound('Checklist');
      assertCanRecall(actor, row);
      const at = iso();
      const stmts = [store.returnForChangesStmt(row.id, at), store.unlinkInstancesStmt(row.id)];
      const pending = await store.pendingApproval(CHECKLIST, row.id, OM_SIGNOFF_ROLE);
      if (pending) {
        stmts.unshift(
          store.decideApprovalStmt(pending.id, {
            status: 'rejected',
            decided_by: actor.id,
            decided_at: at,
            notes: 'Recalled by the inspector to make changes',
          }),
        );
      }
      await store.batch(stmts);
      return getChecklist(actor, { id: row.id });
    },

    'checklists.deleteDraft': async (actor, { id }) => {
      const row = await store.getSubmissionRow(validId(id));
      if (!row) throw notFound('Checklist');
      assertCanDeleteDraft(actor, row);
      // Incidents raised from the draft (and their work orders) go with it,
      // as Supabase's delete_draft_submission did.
      try {
        await store.batch([...incidentOps.deleteIncidentsForSubmissionStmts(row.id), ...store.deleteSubmissionStmts(row.id)]);
      } catch (err) {
        if (/closed incident|Locked work orders/.test(String(err?.message))) {
          throw new HttpError(409, 'This draft has a closed incident or verified work order on file, so it cannot be deleted.');
        }
        throw err;
      }
      return { deleted: row.id };
    },

    'checklists.amendItemResult': async (actor, { id, code, result, amendment, reason }) => {
      assertCanAmend(actor);
      const tag = amendment?.reason ?? reason;
      if (!tag || typeof tag !== 'string' || tag.length > 64) throw new HttpError(400, 'amendItemResult needs a reason');
      if (amendment !== null && amendment !== undefined) {
        if (typeof amendment !== 'object' || Array.isArray(amendment)) throw new HttpError(400, 'Invalid amendment');
        if (JSON.stringify(amendment).length > 5000) throw new HttpError(400, 'Amendment is too large');
      }
      const row = await store.getSubmissionRow(validId(id));
      if (!row) throw notFound('Checklist');
      if (!row.locked) throw new HttpError(409, 'Only a filed checklist can be corrected this way. Edit the draft instead.');
      const items = JSON.parse(row.items_json || '{}');
      if (typeof code !== 'string' || !Object.hasOwn(items, code)) {
        throw new HttpError(400, `Item ${String(code)} is not on this checklist`);
      }
      items[code] = { ...items[code], result: validateResult(result) };
      let reopenedAt = iso();
      if (reopenedAt === row.reopened_at) reopenedAt = new Date(now() + 1).toISOString();
      await store.batch([
        store.amendItemsStmt(row.id, JSON.stringify(items), reopenedAt, actor.id),
        store.insertAuditStmt({
          id: newId(),
          entity_type: CHECKLIST,
          entity_id: row.id,
          action: 'amend_item',
          actor_id: actor.id,
          detail_json: JSON.stringify({ item_code: code, reason: tag, amendment: amendment ?? null }),
          created_at: reopenedAt,
        }),
      ]);
      return getChecklist(actor, { id: row.id });
    },

    'checklists.acknowledge': async (actor, args) => {
      const { row, stmts } = await acknowledgeStatements(actor, args ?? {});
      await store.batch(stmts);
      return getChecklist(actor, { id: row.id });
    },

    // ── approvals (checklists from 3a, work orders from 3b) ────────────
    // Checklist approvals are open to all staff (any checklist is); work-order
    // ones only to those who could act on them.
    'approvals.list': async (actor) =>
      (await store.listApprovals())
        .filter((a) => a.entity_type === CHECKLIST || incidentOps.canSeeWorkOrderApproval(actor, a))
        .map((a) => ({ ...a, signed: Boolean(a.signed) })),
    'approvals.listInbox': async (actor) => {
      const rows = await store.listApprovals({ status: 'pending' });
      const mine = rows.filter((r) =>
        r.entity_type === CHECKLIST
          ? isSupervisor(actor) || (r.assigned_to && r.assigned_to === actor.id)
          : incidentOps.canSeeWorkOrderApproval(actor, r),
      );
      return Promise.all(
        mine.map((r) => (r.entity_type === CHECKLIST ? hydrateApproval(r) : incidentOps.hydrateWorkOrderApproval(r))),
      );
    },
    'approvals.get': async (actor, { id }) => {
      const row = await store.getApproval(validId(id));
      if (!row) return null;
      if (row.entity_type !== CHECKLIST) {
        if (!incidentOps.canSeeWorkOrderApproval(actor, row)) throw new HttpError(403, 'This approval is not assigned to you');
        return incidentOps.hydrateWorkOrderApproval(row);
      }
      assertCanSeeApproval(actor, row);
      return hydrateApproval(row);
    },
    'approvals.decide': async (actor, { id, decision, notes, signature_data_uri, sign_date, name, position }) => {
      const row = await store.getApproval(validId(id));
      if (!row) throw notFound('Approval');
      if (row.entity_type !== CHECKLIST) {
        return incidentOps.decideWorkOrder(actor, row, { decision, notes, signature_data_uri, name });
      }
      assertCanDecide(actor, row, decision);
      if (decision === 'rejected') {
        // Return for changes: the checklist goes back to its inspector as a
        // draft. Allowed only before sign-off (migration 0005); a signed-off
        // record stays frozen.
        const note = validateReturnNote(notes);
        const sub = await store.getSubmissionRow(row.entity_id);
        if (!sub) throw notFound('Checklist');
        if (sub.status !== 'submitted') throw new HttpError(409, 'Only a submitted checklist can be returned for changes');
        const at = iso();
        const stmts = [
          store.decideApprovalStmt(row.id, { status: 'rejected', decided_by: actor.id, decided_at: at, notes: note }),
          store.returnForChangesStmt(sub.id, at),
          store.unlinkInstancesStmt(sub.id),
        ];
        if (sub.inspector_id !== actor.id) {
          stmts.push(
            store.insertNotificationStmt({
              id: newId(),
              recipient_id: sub.inspector_id,
              event_type: 'checklist_returned',
              title: 'Returned for changes',
              body: `${templateTitle(sub.template_id)} (${sub.inspection_date ?? 'undated'}): ${note}`,
              href: `/checklists/${sub.id}`,
              entity_type: CHECKLIST,
              entity_id: sub.id,
              created_at: at,
            }),
          );
        }
        await store.batch(stmts);
      } else {
        const cleanNotes = optionalText(notes, 'Notes', 2000);
        const { stmts } = await acknowledgeStatements(actor, {
          id: row.entity_id,
          name,
          position,
          signature_data_uri,
          sign_date,
          notes: cleanNotes,
        });
        await store.batch(stmts);
      }
      return hydrateApproval(await store.getApproval(row.id));
    },

    ...incidentOps.ops,

    // ── schedule ───────────────────────────────────────────────────────
    'instances.rules': async () => store.listRules(),
    'instances.list': async (actor) => {
      const rows = await store.listInstances();
      const visible = isSupervisor(actor)
        ? rows
        : rows.filter(
            (r) =>
              r.assigned_user === actor.id ||
              (actor.department && r.assigned_department && r.assigned_department === actor.department),
          );
      return refreshInstanceStatuses(visible, now());
    },
    'instances.generate': async (actor) => {
      assertCanGenerate(actor);
      const nowMs = now();
      const toYmd = airportYmd(nowMs);
      const rules = await store.listRules();
      const created = generatePendingInstances({
        rules,
        existing: await store.listInstanceKeys(),
        fromYmd: addAirportDays(toYmd, -BACKFILL_DAYS),
        toYmd,
        nowMs,
        idFactory: () => newId(),
      });
      let inserted = 0;
      for (let i = 0; i < created.length; i += 100) {
        const results = await store.batch(created.slice(i, i + 100).map((row) => store.insertInstanceStmt(row)));
        inserted += results.reduce((sum, r) => sum + Number(r?.meta?.changes ?? 0), 0);
      }
      return { created: inserted, total: await store.countInstances() };
    },
    'instances.getClock': async () => ({ demoNow: iso(), nowMs: now() }),

    // ── notifications (always the session user's own) ─────────────────
    'notifications.listForUser': async (actor) => store.listNotifications(actor.id),
    'notifications.unreadCount': async (actor) => store.unreadCount(actor.id),
    'notifications.markRead': async (actor, { id }) => {
      await store.batch([store.markReadStmt(validId(id), actor.id, iso())]);
      return { ok: true };
    },
    'notifications.markAllRead': async (actor) => {
      await store.batch([store.markAllReadStmt(actor.id, iso())]);
      return { ok: true };
    },

    // ── settings ───────────────────────────────────────────────────────
    'settings.get': async () => store.getSettings(),
    'settings.save': async (actor, { section, value }) => {
      assertCanWriteSettings(actor);
      const key = validateSettingsSection(section);
      const json = validateSettingsValue(value);
      const current = await store.getSettings();
      const at = iso();
      await store.batch([
        store.upsertSettingStmt(key, json, at, actor.id),
        store.insertSettingsAuditStmt({
          id: newId(),
          section: key,
          action: 'save',
          from_json: current[key] === undefined ? null : JSON.stringify(current[key]),
          to_json: json,
          by: actor.id,
          by_name: actor.full_name ?? null,
          at,
        }),
      ]);
      return store.getSettings();
    },
    'settings.resetSection': async (actor, { section }) => {
      assertCanWriteSettings(actor);
      const key = validateSettingsSection(section);
      const current = await store.getSettings();
      if (current[key] !== undefined) {
        await store.batch([
          store.deleteSettingStmt(key),
          store.insertSettingsAuditStmt({
            id: newId(),
            section: key,
            action: 'reset',
            from_json: JSON.stringify(current[key]),
            to_json: null,
            by: actor.id,
            by_name: actor.full_name ?? null,
            at: iso(),
          }),
        ]);
      }
      return store.getSettings();
    },
    'settings.audit': async (actor) => {
      assertCanWriteSettings(actor);
      return store.listSettingsAudit();
    },
  };
}
