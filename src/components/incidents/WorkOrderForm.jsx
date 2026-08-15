import SignoffBlock from '../checklist/SignoffBlock.jsx';
import { ASSIGNED_TEAMS } from '../../config/incidentLookups.js';
import { workOrderStatusLabel, workOrderVerifiedBlockers } from '../../lib/incidentLifecycle.js';

export default function WorkOrderForm({ workOrder, onChange, onSave, onVerify, onExport, readOnly }) {
  const wo = workOrder;
  const blockers = workOrderVerifiedBlockers(wo);
  const locked = wo.locked || readOnly;

  function patch(next) {
    onChange({ ...wo, ...next });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Annex H · PGIA-PMM-F08</p>
          <h3 className="text-lg font-bold text-navy">{wo.work_order_number}</h3>
          <p className="text-sm text-muted">{workOrderStatusLabel(wo.status)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onSave} className="rounded-md border border-navy/20 bg-white px-3 py-2 text-sm">
            Save
          </button>
          <button type="button" onClick={onExport} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white">
            Export Annex H
          </button>
        </div>
      </div>

      <section className="rounded-md border border-navy/15 bg-white p-4">
        <h4 className="mb-3 text-sm font-semibold text-navy">Issue block</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <Text label="Date Issued" type="date" value={wo.date_issued} disabled={locked} onChange={(v) => patch({ date_issued: v })} />
          <Text label="Issued by OM or COO (Name)" value={wo.issued_by_name} disabled={locked} onChange={(v) => patch({ issued_by_name: v })} />
          <label className="block md:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Assigned to</span>
            <select
              disabled={locked}
              value={wo.assigned_to_name}
              onChange={(e) =>
                patch({
                  assigned_to_name: e.target.value,
                  cec_clearance_required: /cec/i.test(e.target.value),
                })
              }
              className="min-h-10 w-full rounded border border-navy/20 px-3 py-2 text-sm"
            >
              <option value="">Select…</option>
              {ASSIGNED_TEAMS.map((opt) => (
                <option key={opt.value} value={opt.label}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <Text label="NOC Reference No." value={wo.noc_reference_no} disabled />
          <Text label="Deficiency Level" value={String(wo.deficiency_level ?? '')} disabled />
          <label className="md:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
              Description of Work Required
            </span>
            <textarea
              disabled={locked}
              rows={3}
              value={wo.description_of_work}
              onChange={(e) => patch({ description_of_work: e.target.value })}
              className="w-full rounded border border-navy/20 px-3 py-2 text-sm"
            />
          </label>
          <Text label="Location" value={wo.location_text} disabled={locked} onChange={(v) => patch({ location_text: v })} />
          <Text
            label="Target Completion Date"
            type="date"
            value={wo.target_completion_date || ''}
            disabled={locked}
            onChange={(v) => patch({ target_completion_date: v })}
          />
          <div className="md:col-span-2 grid gap-3 sm:grid-cols-3">
            <YesNo
              label="NOTAM Required"
              value={wo.notam_required}
              disabled={locked}
              onChange={(v) => patch({ notam_required: v })}
            />
            <Text label="NOTAM Ref." value={wo.notam_ref || ''} disabled={locked} onChange={(v) => patch({ notam_ref: v })} />
          </div>
        </div>
      </section>

      <section className="rounded-md border border-navy/15 bg-white p-4">
        <h4 className="mb-3 text-sm font-semibold text-navy">Work Completion Record</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <Text
            label="Date Works Completed"
            type="date"
            value={wo.date_works_completed || ''}
            disabled={locked}
            onChange={(v) => patch({ date_works_completed: v, status: v ? 'completed' : wo.status })}
          />
          <Text label="Completed by" value={wo.completed_by} disabled={locked} onChange={(v) => patch({ completed_by: v })} />
          <label className="md:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
              Description of Work Performed
            </span>
            <textarea
              disabled={locked}
              rows={3}
              value={wo.description_of_work_performed}
              onChange={(e) => patch({ description_of_work_performed: e.target.value })}
              className="w-full rounded border border-navy/20 px-3 py-2 text-sm"
            />
          </label>
          <label className="md:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
              Materials Used (type, quantity)
            </span>
            <textarea
              disabled={locked}
              rows={2}
              value={wo.materials_used}
              onChange={(e) => patch({ materials_used: e.target.value })}
              className="w-full rounded border border-navy/20 px-3 py-2 text-sm"
            />
          </label>
          <label className="md:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
              Test / Verification Results (if applicable)
            </span>
            <textarea
              disabled={locked}
              rows={2}
              value={wo.test_verification_results}
              onChange={(e) => patch({ test_verification_results: e.target.value })}
              className="w-full rounded border border-navy/20 px-3 py-2 text-sm"
            />
          </label>
          <YesNo
            label="Area Cleared for Operations"
            value={wo.area_cleared_for_operations}
            disabled={locked}
            onChange={(v) => patch({ area_cleared_for_operations: v })}
          />
          {wo.area_cleared_for_operations === false && (
            <Text
              label="Explain (area not cleared)"
              value={wo.area_not_cleared_explanation}
              disabled={locked}
              onChange={(v) => patch({ area_not_cleared_explanation: v })}
            />
          )}
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              disabled={locked}
              checked={Boolean(wo.cec_clearance_required)}
              onChange={(e) => patch({ cec_clearance_required: e.target.checked })}
            />
            CEC written clearance required
          </label>
          <YesNo
            label="CEC Written Clearance Issued"
            value={wo.cec_clearance_issued}
            disabled={locked}
            onChange={(v) => patch({ cec_clearance_issued: v })}
          />
          <Text
            label="CEC Clearance Date"
            type="date"
            value={wo.cec_clearance_date || ''}
            disabled={locked}
            onChange={(v) => patch({ cec_clearance_date: v })}
          />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <SignoffBlock
          label="OM or COO Verification (Name / Signature / Date)"
          name={wo.signoffs?.find((s) => s.role === 'om_coo_verification')?.name ?? ''}
          signedAt={wo.signoffs?.find((s) => s.role === 'om_coo_verification')?.signed_at}
          signatureDataUri={wo.signoffs?.find((s) => s.role === 'om_coo_verification')?.signature_data_uri}
          readOnly={locked}
          onChange={(patchSign) => upsertSign(wo, onChange, 'om_coo_verification', patchSign)}
        />
        <SignoffBlock
          label="CEC (Name / Signature / Date) where required"
          name={wo.signoffs?.find((s) => s.role === 'cec_clearance')?.name ?? ''}
          signedAt={wo.signoffs?.find((s) => s.role === 'cec_clearance')?.signed_at}
          signatureDataUri={wo.signoffs?.find((s) => s.role === 'cec_clearance')?.signature_data_uri}
          readOnly={locked}
          onChange={(patchSign) => upsertSign(wo, onChange, 'cec_clearance', patchSign)}
        />
      </div>

      {!locked && (
        <div className="rounded-md border border-navy/10 bg-stripe p-4">
          {blockers.length > 0 && (
            <ul className="mb-3 list-disc pl-5 text-sm text-alert">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={onVerify}
            disabled={blockers.length > 0}
            className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Mark verified and lock
          </button>
        </div>
      )}
    </div>
  );
}

function upsertSign(wo, onChange, role, patch) {
  const rest = (wo.signoffs ?? []).filter((s) => s.role !== role);
  const current = (wo.signoffs ?? []).find((s) => s.role === role) ?? { role };
  onChange({
    ...wo,
    signoffs: [...rest, { ...current, ...patch, role, signed_at: new Date().toISOString() }],
  });
}

function Text({ label, value, onChange, type = 'text', disabled }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <input
        type={type}
        disabled={disabled}
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        className="min-h-10 w-full rounded border border-navy/20 px-3 py-2 text-sm disabled:bg-stripe"
      />
    </label>
  );
}

function YesNo({ label, value, onChange, disabled }) {
  return (
    <fieldset>
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</legend>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" disabled={disabled} checked={value === true} onChange={() => onChange(true)} />
          Yes
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" disabled={disabled} checked={value === false} onChange={() => onChange(false)} />
          No
        </label>
      </div>
    </fieldset>
  );
}
