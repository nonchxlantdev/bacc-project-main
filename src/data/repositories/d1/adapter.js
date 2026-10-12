/**
 * The D1 repository adapter (VITE_DATA_SOURCE=d1), as a factory so tests can
 * inject the transport and the template registry. index.js wires the real
 * ones.
 *
 * Thin by design: permissions and validation live in the Worker
 * (worker/data/rules.js). This layer only
 *   - maps repository calls onto /api/data/<op>,
 *   - adds the registry's template fields (schema, field map, codes) to
 *     records — the database stores only `template_id` (the registry key),
 *   - avoids re-uploading drawings that have not changed, and
 *   - answers for groups that arrive in 3b (incidents, work orders).
 */
import { isQualifyingReinspection } from '../../../lib/incidentLifecycle.js';
import { groupForCode } from '../../templates/templateMeta.js';
import { createReportAggregations } from '../reportAggregations.js';

export const IN_3B = 'Incidents and work orders arrive with the next part of the D1 move (3b).';
const DEMO_ONLY = 'Demo-only method is not available with the live database';
const REGISTRY_FIELDS = ['schema', 'content_schema', 'field_map'];

/** Order- and empty-section-insensitive fingerprint of a record's drawings. */
export function drawingsFingerprint(attachments) {
  const groups = attachments && typeof attachments === 'object' ? attachments : {};
  return JSON.stringify(
    Object.keys(groups)
      .filter((key) => Array.isArray(groups[key]) && groups[key].length)
      .sort()
      .map((key) => [key, groups[key].map((d) => [d.id, d.label ?? '', d.contentType ?? '', d.dataUri, d.addedAt ?? null])]),
  );
}

export function templateFromEntry(entry, rules = []) {
  return {
    id: entry.key,
    code: entry.code,
    version: entry.version,
    title: entry.title,
    annex_label: entry.annexLabel,
    document_family: entry.family,
    group: entry.group ?? groupForCode(entry.code),
    document_type: entry.documentType ?? 'checklist',
    manual: entry.manual,
    department: entry.department,
    default_frequency: entry.defaultFrequency,
    content_schema: entry.schema,
    schema: entry.schema,
    field_map: entry.fieldMap,
    base_pdf_path: entry.fieldMap?.basePdf ?? null,
    print_template_key: entry.fieldMap?.templateKey ?? entry.key,
    registry_key: entry.key,
    status: 'active',
    assignment_rules: rules.filter((r) => r.template_id === entry.key),
  };
}

export function createD1Adapter({ call, registry }) {
  const { entries, getEntry } = registry;
  const drawingsSeen = new Map();

  function enrich(record) {
    if (!record) return record;
    const entry = getEntry(record.template_id);
    if (record.attachments !== undefined) drawingsSeen.set(record.id, drawingsFingerprint(record.attachments));
    return {
      ...record,
      template_code: entry?.code ?? null,
      schema: entry?.schema ?? null,
      content_schema: entry?.schema ?? null,
      field_map: entry?.fieldMap ?? null,
      print_template_key: entry?.fieldMap?.templateKey ?? record.template_id,
    };
  }

  function enrichApproval(row) {
    if (!row?.entity) return row;
    const entry = getEntry(row.entity.template_id);
    const code = entry?.code ?? null;
    return {
      ...row,
      entity: {
        ...row.entity,
        title: entry?.schema?.title || entry?.title || code,
        annex_label: entry?.annexLabel ?? entry?.schema?.annexLabel ?? null,
        code,
        group: entry?.group ?? groupForCode(code),
        department: entry?.department ?? null,
      },
    };
  }

  /** What actually goes over the wire for a save. */
  function outgoing(record) {
    const body = { ...record };
    for (const key of REGISTRY_FIELDS) delete body[key];
    if (body.attachments !== undefined) {
      if (drawingsSeen.get(body.id) === drawingsFingerprint(body.attachments)) delete body.attachments;
      else body.drawings_changed = true;
    }
    return body;
  }

  async function listRules() {
    return (await call('instances.rules')) ?? [];
  }

  const notYet = async () => {
    throw new Error(IN_3B);
  };
  const demoOnly = (name) => async () => {
    throw new Error(`${DEMO_ONLY} (${name}).`);
  };

  const repos = {
    users: {
      list: () => call('users.list'),
      listLogins: () => call('users.listLogins'),
      getById: (id) => call('users.getById', { id }),
      getByEmail: (email) => call('users.getByEmail', { email }),
      update: (id, patch) => call('users.update', { id, patch }),
      async persist() {
        throw new Error('Manage accounts in Settings → Users & roles.');
      },
      async setActive() {
        throw new Error('Manage accounts in Settings → Users & roles.');
      },
    },

    templates: {
      async list() {
        const rules = await listRules();
        return entries.map((entry) => templateFromEntry(entry, rules));
      },
      async get(idOrCode) {
        if (!idOrCode) return null;
        const entry = getEntry(idOrCode) ?? entries.find((e) => e.code === idOrCode) ?? null;
        return entry ? templateFromEntry(entry, await listRules()) : null;
      },
    },

    checklists: {
      listMine: async () => ((await call('checklists.listMine')) ?? []).map(enrich),
      listAll: async () => ((await call('checklists.listAll')) ?? []).map(enrich),
      get: async (id) => enrich(await call('checklists.get', { id })),
      persist: async (record) => enrich(await call('checklists.persist', { record: outgoing(record) })),
      async deleteDraft(record) {
        await call('checklists.deleteDraft', { id: record?.id });
        drawingsSeen.delete(record?.id);
      },
      acknowledge: async ({ id, name, position, signature_data_uri }) =>
        enrich(await call('checklists.acknowledge', { id, name, position, signature_data_uri: signature_data_uri || null })),
      amendItemResult: async ({ id, code, result, amendment, reason }) =>
        enrich(await call('checklists.amendItemResult', { id, code, result, amendment: amendment ?? null, reason })),
      async listQualifyingReinspections(incident) {
        return (await repos.checklists.listAll()).filter((row) => isQualifyingReinspection(row, incident));
      },
    },

    // 3b: reads are empty so pages that glance at incidents still load;
    // anything that would write says plainly that it is not here yet.
    incidents: {
      list: async () => [],
      get: async () => null,
      persist: notYet,
      addUpdate: notYet,
    },
    workOrders: {
      listByIncident: async () => [],
      get: async () => null,
      persist: notYet,
    },

    approvals: {
      listInbox: async () => ((await call('approvals.listInbox')) ?? []).map(enrichApproval),
      get: async (id) => enrichApproval(await call('approvals.get', { id })),
      decide: async ({ id, decision, notes, signature_data_uri, name, position }) =>
        enrichApproval(
          await call('approvals.decide', {
            id,
            decision,
            notes: notes ?? null,
            signature_data_uri: signature_data_uri || null,
            name: name ?? null,
            position: position ?? null,
          }),
        ),
    },

    settings: {
      get: async () => (await call('settings.get')) ?? {},
      save: ({ section, value }) => call('settings.save', { section, value }),
      resetSection: ({ section }) => call('settings.resetSection', { section }),
      async audit() {
        try {
          return (await call('settings.audit')) ?? [];
        } catch (err) {
          // Only managers may read the change log; everyone else sees none.
          if (err.status === 403) return [];
          throw err;
        }
      },
    },

    instances: {
      list: async () => (await call('instances.list')) ?? [],
      generate: () => call('instances.generate'),
      getClock: async () => (await call('instances.getClock')) ?? { demoNow: new Date().toISOString(), nowMs: Date.now() },
      advanceClock: demoOnly('instances.advanceClock'),
      resetDemo: demoOnly('instances.resetDemo'),
      loadShowcase: demoOnly('instances.loadShowcase'),
      clearAll: demoOnly('instances.clearAll'),
    },

    notifications: {
      listForUser: async () => (await call('notifications.listForUser')) ?? [],
      unreadCount: async () => Number((await call('notifications.unreadCount')) ?? 0),
      markRead: (id) => call('notifications.markRead', { id }),
      markAllRead: () => call('notifications.markAllRead'),
    },
  };

  const reportCache = { at: 0, value: null };
  async function loadReportContext() {
    const t = Date.now();
    if (reportCache.value && t - reportCache.at < 5000) return reportCache.value;
    const [templates, users, submissions, instances, approvals] = await Promise.all([
      repos.templates.list(),
      repos.users.list().catch(() => []),
      repos.checklists.listAll().catch(() => []),
      repos.instances.list().catch(() => []),
      call('approvals.list').catch(() => []),
    ]);
    const value = { templates, users, submissions, incidents: [], instances, approvals: approvals ?? [], workOrders: [] };
    reportCache.at = t;
    reportCache.value = value;
    return value;
  }
  repos.reports = createReportAggregations(loadReportContext);

  return repos;
}
