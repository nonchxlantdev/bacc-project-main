import { LANDING_OPTIONS } from '../../context/DisplayPrefsContext.jsx';
import Select from '../ui/Select.jsx';
import { Panel, Row } from './settingsUi.jsx';

/**
 * Per-device display preferences. Theme stays in the sidebar toggle — this
 * section is only landing page + clock format.
 */
export function AppearanceSection({ draft, onChange }) {
  return (
    <Panel
      title="Appearance"
      description="These stay on this device only — they are not synced airport-wide settings. Dark/light mode is toggled from the sidebar."
    >
      <Row
        label="Open the portal on"
        htmlFor="landing-page"
        effect="Where you land after signing in, instead of always opening the Dashboard."
      >
        <Select
          label="Landing page"
          value={draft.landingPage}
          onChange={(v) => onChange({ ...draft, landingPage: v })}
          options={LANDING_OPTIONS}
        />
      </Row>
      <Row
        label="Time format"
        htmlFor="time-format"
        effect="How times appear in the top bar clock and on dated records. Timezone stays America/Belize."
      >
        <Select
          label="Time format"
          value={draft.timeFormat}
          onChange={(v) => onChange({ ...draft, timeFormat: v })}
          options={[
            { value: '12h', label: '12-hour (3:05 PM)' },
            { value: '24h', label: '24-hour (15:05)' },
          ]}
        />
      </Row>
    </Panel>
  );
}

/**
 * Department / annex → who may sign as OM, COO, or CEC for that area.
 * Configuration only this round — no new enforcement on the Approvals page yet.
 */
export function ApproversSection({ draft, onChange }) {
  const mappings = draft.mappings ?? [];

  function patchRow(index, patch) {
    onChange({
      ...draft,
      mappings: mappings.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  }

  function addRow() {
    onChange({
      ...draft,
      mappings: [
        ...mappings,
        { department: '', annex: '', omRole: 'om', cooRole: 'coo', cecRole: '' },
      ],
    });
  }

  function removeRow(index) {
    onChange({ ...draft, mappings: mappings.filter((_, i) => i !== index) });
  }

  return (
    <Panel
      title="Approvers & signing authority"
      description="Maps each department (and optional annex) to the roles that may sign as Operations Manager, COO, or CEC. This stores the mapping only — approval gates are unchanged until enforcement is wired in a later pass."
    >
      <div className="space-y-3">
        {mappings.length === 0 && (
          <p className="text-sm text-muted">No mappings yet. Add a department row to begin.</p>
        )}
        {mappings.map((row, index) => (
          <article key={index} className="space-y-3 rounded-md border border-line/15 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-ink">Department</span>
                <input
                  type="text"
                  value={row.department}
                  onChange={(e) => patchRow(index, { department: e.target.value })}
                  className="min-h-11 w-full rounded border border-line/20 bg-surface px-3 text-sm desk:min-h-10"
                  placeholder="Operations"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-ink">Annex (optional)</span>
                <input
                  type="text"
                  value={row.annex ?? ''}
                  onChange={(e) => patchRow(index, { annex: e.target.value })}
                  className="min-h-11 w-full rounded border border-line/20 bg-surface px-3 text-sm desk:min-h-10"
                  placeholder="e.g. Annex A"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <RoleSelect
                label="Signs as OM"
                value={row.omRole}
                onChange={(v) => patchRow(index, { omRole: v })}
              />
              <RoleSelect
                label="Signs as COO"
                value={row.cooRole}
                onChange={(v) => patchRow(index, { cooRole: v })}
              />
              <RoleSelect
                label="Signs as CEC"
                value={row.cecRole}
                onChange={(v) => patchRow(index, { cecRole: v })}
              />
            </div>
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="min-h-11 rounded border border-line/20 px-3 text-sm font-medium text-muted hover:border-alert hover:text-alert desk:min-h-10"
            >
              Remove
            </button>
          </article>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-3 min-h-11 rounded border border-dashed border-line/30 px-3 text-sm font-medium text-primary hover:border-primary desk:min-h-10"
      >
        Add mapping
      </button>
    </Panel>
  );
}

const SIGNING_ROLE_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'om', label: 'Operations Manager' },
  { value: 'coo', label: 'Chief Operations Officer' },
  { value: 'cec', label: 'Civil Engineering Consultant' },
  { value: 'duty_manager', label: 'Duty Manager' },
  { value: 'apron_supervisor', label: 'Apron Supervisor' },
  { value: 'electrical_tech', label: 'Electrical Technician' },
  { value: 'sms', label: 'SMS' },
];

function RoleSelect({ label, value, onChange }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-ink">{label}</span>
      <Select label={label} value={value ?? ''} onChange={onChange} options={SIGNING_ROLE_OPTIONS} />
    </label>
  );
}
