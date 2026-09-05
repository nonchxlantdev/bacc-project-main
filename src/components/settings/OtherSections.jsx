import { Clock } from 'lucide-react';
import { NumberInput, Panel, Row, StringList, TextArea, TextInput, Toggle, Note } from './settingsUi.jsx';
import { EMAIL_INTEGRATION_READY } from '../../config/settingsDefaults.js';
import Select from '../ui/Select.jsx';
import SignaturePad from '../checklist/SignaturePad.jsx';

/**
 * Event names in BACC's own words, with a line saying when each one fires.
 * The names match how they are referred to in conversation, so a setting is
 * findable by the term someone already has in their head.
 */
const EVENTS = {
  incident_alerting_level: {
    label: 'Incident alert',
    when: 'A deficiency is raised at a level marked to notify management.',
  },
  incident_assigned: {
    label: 'Incident assigned',
    when: 'A deficiency is given to a named person or team.',
  },
  checklist_due: {
    label: 'Checklist due',
    when: 'A scheduled inspection reaches its due date.',
  },
  checklist_overdue: {
    label: 'Overdue checklist',
    when: 'A scheduled inspection passes its due date without being filed.',
  },
  approval_required: {
    label: 'Approval required',
    when: 'A submitted record lands in someone\u2019s approvals inbox.',
  },
};

const ROLE_LABELS = {
  assignee: 'The person it is assigned to',
  reporter: 'Whoever reported it',
  om: 'Operations Manager',
  coo: 'Chief Operations Officer',
  cec: 'Civil Engineering Consultant',
  duty_manager: 'Duty Manager',
  inspector: 'Maintenance Inspectors',
  electrical_tech: 'Electrical Technicians',
  sms: 'Safety Management System',
};

const ALL_RECIPIENTS = Object.keys(ROLE_LABELS);

/** My Profile — the only section every account can edit. */
export function ProfileSection({ draft, onChange, email, role, department }) {
  return (
    <>
    <Panel
      title="How you appear on records"
      description="Your name and position are copied onto the inspector sign-off when you submit a checklist, and onto the exported PDF. They are not changed on records you have already submitted."
    >
      <Row label="Full name" htmlFor="full-name" effect="Appears in the signature block of every checklist you submit from now on.">
        <TextInput id="full-name" value={draft.full_name} onChange={(v) => onChange({ ...draft, full_name: v })} />
      </Row>
      <Row label="Position" htmlFor="position" effect="Printed under your name on the approved form.">
        <TextInput id="position" value={draft.position} onChange={(v) => onChange({ ...draft, position: v })} />
      </Row>
      <Row label="Sign-in email" effect="Set by your administrator. Historical records point at this address.">
        <p className="min-h-11 text-sm text-muted desk:min-h-10">{email || '—'}</p>
      </Row>
      <Row label="Role and department" effect="Determines which approved forms you may open and what you can approve.">
        <p className="min-h-11 text-sm text-muted desk:min-h-10">
          {role || '—'}
          {department ? ` · ${department}` : ''}
        </p>
      </Row>
    </Panel>
    <Panel
      title="My signature"
      description="Used when you tap “Use my saved signature” on a checklist. Does not change records you have already submitted."
    >
      <Row
        label="Saved signature"
        effect="Draw once here, then apply it to the inspector sign-off on any draft checklist."
      >
        <SignaturePad
          label="Saved signature"
          value={draft.stored_signature_data_uri ?? null}
          onChange={(stored_signature_data_uri) =>
            onChange({
              ...draft,
              stored_signature_data_uri,
              stored_signature_updated_at: stored_signature_data_uri ? new Date().toISOString() : null,
            })
          }
        />
        {draft.stored_signature_data_uri && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...draft,
                stored_signature_data_uri: null,
                stored_signature_updated_at: null,
              })
            }
            className="mt-2 text-xs font-medium text-alert hover:underline"
          >
            Clear saved signature
          </button>
        )}
        {draft.stored_signature_updated_at && (
          <p className="mt-2 text-xs text-muted">
            Last saved {new Date(draft.stored_signature_updated_at).toLocaleString()}
          </p>
        )}
      </Row>
      <Row label="Signature prompt" effect="When you open a draft checklist, offer to apply your saved signature.">
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink desk:min-h-10">
          <input
            type="checkbox"
            checked={Boolean(draft.hide_signature_prompt)}
            onChange={(e) => onChange({ ...draft, hide_signature_prompt: e.target.checked })}
            className="h-4 w-4"
          />
          Don&apos;t show the signature prompt when opening a checklist
        </label>
      </Row>
    </Panel>
  </>
  );
}

/** Per-person notification preferences. */
export function PreferencesSection({ draft, onChange }) {
  return (
    <Panel
      title="What reaches you"
      description="These control your own alerts only. Who is notified about each event across the airport is set under Alerts & Escalation."
    >
      <Row label="In the portal" effect="The bell in the top bar, and the Notifications page.">
        <Toggle
          checked={draft.notifyInApp}
          onChange={(v) => onChange({ ...draft, notifyInApp: v })}
          label={draft.notifyInApp ? 'On' : 'Off'}
        />
      </Row>
      <Row label="By email" effect="Sent to your sign-in address when the portal is connected to a mail service.">
        <Toggle
          checked={draft.notifyEmail}
          onChange={(v) => onChange({ ...draft, notifyEmail: v })}
          label={draft.notifyEmail ? 'On' : 'Off'}
        />
      </Row>
      <Row label="Open the portal on" htmlFor="landing" effect="Where you land after signing in.">
        <Select
          label="Landing page"
          value={draft.landingPage}
          onChange={(v) => onChange({ ...draft, landingPage: v })}
          options={[
            { value: '/dashboard', label: 'Dashboard' },
            { value: '/checklists/mine', label: 'My Checklists' },
            { value: '/checklists/all', label: 'All Checklists' },
            { value: '/incidents', label: 'Incidents' },
            { value: '/approvals', label: 'Approvals' },
          ]}
        />
      </Row>
    </Panel>
  );
}

/** Alerts & Escalation — configuration questions B3 and C4. */
export function AlertsSection({ draft, onChange }) {
  const patchEvent = (key, patch) =>
    onChange({ ...draft, events: { ...draft.events, [key]: { ...draft.events[key], ...patch } } });

  return (
    <div className="space-y-4">
      <Panel
        title="Who hears about what"
        description="Each event below can reach people in the portal, by email, or both. Turning both off silences the event entirely."
      >
        {!EMAIL_INTEGRATION_READY && (
          <Note title="Email is not connected yet.">
            Everything marked for email is recorded and queued, and will send once a mail service is
            wired up. In-portal notifications work now.
          </Note>
        )}
        <div className="space-y-4">
          {Object.entries(draft.events).map(([key, event]) => (
            <article key={key} className="rounded-md border border-line/15 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-ink">{EVENTS[key]?.label ?? key}</p>
                {event.emailRequired && (
                  <span className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    Email required
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted">{EVENTS[key]?.when}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                <Toggle
                  checked={event.inApp}
                  onChange={(v) => patchEvent(key, { inApp: v })}
                  label="In the portal"
                />
                <Toggle
                  checked={event.email}
                  onChange={(v) => patchEvent(key, { email: v })}
                  label="By email"
                />
                {/* Queued, not sent. Stated per event rather than only once at
                    the top, so it is visible next to the switch it applies to. */}
                {event.email && !EMAIL_INTEGRATION_READY && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    Queued — email pending
                  </span>
                )}
              </div>
              {event.emailRequired && !event.email && (
                <p className="mt-2 text-xs font-medium text-alert">
                  BACC asked for an email on this event. It is currently switched off.
                </p>
              )}
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Goes to</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_RECIPIENTS.map((recipient) => {
                    const on = event.recipients?.includes(recipient);
                    return (
                      <button
                        key={recipient}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          patchEvent(key, {
                            recipients: on
                              ? event.recipients.filter((r) => r !== recipient)
                              : [...(event.recipients ?? []), recipient],
                          })
                        }
                        className={`min-h-11 rounded-full border px-3 text-xs font-medium transition desk:min-h-9 ${
                          on
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-line/20 text-muted hover:border-line/40'
                        }`}
                      >
                        {ROLE_LABELS[recipient]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3">
                <Row
                  label="Escalate if not actioned"
                  effect="Notifies the next person up when nobody has acted. Leave unset for no escalation."
                >
                  <NumberInput
                    value={event.escalateAfterHours}
                    onChange={(v) => patchEvent(key, { escalateAfterHours: v })}
                    suffix="hours"
                    unsetLabel="No escalation"
                  />
                </Row>
              </div>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="Sending address" description="Where email alerts come from. Your IT administrator must authorise this address before mail will deliver.">
        <Row label="From address" htmlFor="from-address" effect="The reply-to address inspectors see on every alert.">
          <TextInput
            id="from-address"
            type="email"
            value={draft.fromAddress}
            onChange={(v) => onChange({ ...draft, fromAddress: v })}
            placeholder="operations@bacc.bz"
          />
        </Row>
        <Row label="From name" htmlFor="from-name" effect="The sender name shown in an inbox.">
          <TextInput id="from-name" value={draft.fromName} onChange={(v) => onChange({ ...draft, fromName: v })} />
        </Row>
      </Panel>
    </div>
  );
}

/** Scheduling windows. */
export function SchedulingSection({ draft, onChange }) {
  return (
    <div className="space-y-4">
      <Panel
        title="When work counts as late"
        description="These windows drive the Overdue and Due Soon figures on All Checklists, the team status chips, and the Reports page."
      >
        <Row
          label="Due soon window"
          htmlFor="due-soon"
          effect="An inspection due within this many days is counted under Due Soon."
        >
          <NumberInput
            id="due-soon"
            value={draft.dueSoonDays}
            onChange={(v) => onChange({ ...draft, dueSoonDays: v })}
            min={1}
            suffix="days"
          />
        </Row>
        <Row
          label="Overdue becomes missed"
          htmlFor="missed-after"
          effect="Past due by more than this, an inspection stops being recoverable and is recorded as missed."
        >
          <NumberInput
            id="missed-after"
            value={draft.missedAfterDays}
            onChange={(v) => onChange({ ...draft, missedAfterDays: v })}
            min={1}
            suffix="days"
          />
        </Row>
      </Panel>

      <Panel
        title="Backlog on first run"
        description="How far back the scheduler reaches when it first generates work for a cadence. Without a limit, switching on a daily inspection would create months of occurrences nobody was ever asked to do."
      >
        <Row label="Daily inspections" htmlFor="backfill-daily" effect="Occurrences created behind today for daily forms.">
          <NumberInput
            id="backfill-daily"
            value={draft.backfillDays?.daily}
            onChange={(v) => onChange({ ...draft, backfillDays: { ...draft.backfillDays, daily: v } })}
            min={0}
            suffix="days"
          />
        </Row>
        <Row label="Weekly inspections" htmlFor="backfill-weekly" effect="Occurrences created behind today for weekly forms.">
          <NumberInput
            id="backfill-weekly"
            value={draft.backfillDays?.weekly}
            onChange={(v) => onChange({ ...draft, backfillDays: { ...draft.backfillDays, weekly: v } })}
            min={0}
            suffix="days"
          />
        </Row>
      </Panel>
    </div>
  );
}

/** Lookups — configuration questions B1 and B2. */
export function LookupsSection({ draft, onChange }) {
  const example = String(draft.nocNumberFormat ?? '')
    .replace('{year}', '2026')
    .replace('{seq}', '47'.padStart(draft.nocSeqPadding ?? 4, '0'));

  return (
    <div className="space-y-4">
      <Panel
        title="Deficiency categories"
        description="Used to filter and report on deficiencies. These never appear on an approved form, so your own terminology is what matters here."
      >
        <Note title="Placeholders.">
          Two categories ship by default. Replace them with the words your teams already use —
          Lighting, Pavement, Signage, Vegetation, and so on.
        </Note>
        <StringList
          values={draft.deficiencyCategories}
          onChange={(v) => onChange({ ...draft, deficiencyCategories: v })}
          placeholder="e.g. Lighting"
          addLabel="Add category"
        />
      </Panel>

      <Panel title="Incident types" description="The second lookup on the incident form, alongside category.">
        <StringList
          values={draft.incidentTypes}
          onChange={(v) => onChange({ ...draft, incidentTypes: v })}
          placeholder="e.g. Pavement"
          addLabel="Add type"
        />
      </Panel>

      <Panel
        title="NOC number"
        description="The reference in the “NOC No.” column of the Annex G register."
        footer={<p className="text-xs text-muted">Next number would read <strong className="font-semibold text-ink">{example || '—'}</strong></p>}
      >
        <Note title="No example on the approved register.">
          If a numbering series is already in use at PGIA, continue it here rather than starting a
          new one.
        </Note>
        <Row
          label="Format"
          htmlFor="noc-format"
          effect="Use {year} for the four-digit year and {seq} for the running number."
        >
          <TextInput
            id="noc-format"
            value={draft.nocNumberFormat}
            onChange={(v) => onChange({ ...draft, nocNumberFormat: v })}
            placeholder="{year}-{seq}"
          />
        </Row>
        <Row label="Number padding" htmlFor="noc-pad" effect="Leading zeros on the running number.">
          <NumberInput
            id="noc-pad"
            value={draft.nocSeqPadding}
            onChange={(v) => onChange({ ...draft, nocSeqPadding: v })}
            min={1}
            max={8}
            suffix="digits"
          />
        </Row>
      </Panel>
    </div>
  );
}

/** Organisation — configuration questions C1 and C6. */
export function OrganisationSection({ draft, onChange }) {
  return (
    <div className="space-y-4">
      <Panel title="Identity" description="Appears in the portal header and on exported documents.">
        <Row label="Airport" htmlFor="airport" effect="Shown in the top bar and on export footers.">
          <TextInput id="airport" value={draft.airportName} onChange={(v) => onChange({ ...draft, airportName: v })} />
        </Row>
        <Row label="Operator" htmlFor="operator" effect="The legal entity named on records.">
          <TextInput id="operator" value={draft.operatorName} onChange={(v) => onChange({ ...draft, operatorName: v })} />
        </Row>
        <Row label="Timezone" effect="Every due date, overdue calculation and timestamp is airport-local.">
          <p className="min-h-11 text-sm text-muted desk:min-h-10">{draft.timezone} · fixed</p>
        </Row>
      </Panel>

      <Panel title="Records retention" description="How long completed inspections, exported PDFs and audit logs are kept.">
        <Note title="No period set.">
          Nothing is archived or removed, which is safe but means storage grows without bound. Set a
          period once the BCAR-139 requirement is confirmed.
        </Note>
        <Row
          label="Keep records for"
          htmlFor="retention"
          effect="Records older than this become eligible for archive. Nothing is deleted automatically."
        >
          <NumberInput
            id="retention"
            value={draft.retentionYears}
            onChange={(v) => onChange({ ...draft, retentionYears: v })}
            min={1}
            suffix="years"
            unsetLabel="Keep indefinitely"
          />
        </Row>
      </Panel>

      <Panel title="Export footer" description="Optional line printed at the foot of exported PDFs, below the approved form.">
        <Row label="Footer text" htmlFor="footer" effect="Leave empty to print nothing." stacked>
          <TextArea
            id="footer"
            value={draft.pdfFooter}
            onChange={(v) => onChange({ ...draft, pdfFooter: v })}
            placeholder="e.g. Uncontrolled when printed. Refer to the portal for the current record."
          />
        </Row>
      </Panel>
    </div>
  );
}
