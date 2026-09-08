import { useState } from 'react';
import { useUsers } from '../../hooks/useRepos.js';
import Select from '../ui/Select.jsx';
import { Panel, TextInput, Toggle } from './settingsUi.jsx';

const ROLE_OPTIONS = [
  { value: 'om', label: 'Operations Manager' },
  { value: 'coo', label: 'Chief Operations Officer' },
  { value: 'duty_manager', label: 'Duty Manager' },
  { value: 'apron_supervisor', label: 'Apron Supervisor' },
  { value: 'electrical_tech', label: 'Electrical Technician' },
  { value: 'sms', label: 'SMS' },
  { value: 'admin', label: 'Administrator' },
];

const DEPT_OPTIONS = [
  { value: 'Operations', label: 'Operations' },
  { value: 'Engineering', label: 'Engineering' },
  { value: 'Maintenance', label: 'Maintenance' },
];

const EMPTY = {
  full_name: '',
  email: '',
  position: '',
  department: 'Operations',
  role: 'duty_manager',
  is_approver: false,
};

/**
 * Admin CRUD for portal users. Soft-deactivate only — never hard-delete, so
 * historical submissions/sign-offs stay attributable.
 * The read-only `/users` page is unchanged.
 */
export default function UsersRolesSection() {
  const { rows, persist, setActive, reload } = useUsers();
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function startCreate() {
    setEditing('new');
    setDraft({ ...EMPTY });
    setError(null);
  }

  function startEdit(user) {
    setEditing(user.id);
    setDraft({
      full_name: user.full_name || '',
      email: user.email || '',
      position: user.position || '',
      department: user.department || 'Operations',
      role: user.role || 'duty_manager',
      is_approver: Boolean(user.is_approver),
    });
    setError(null);
  }

  function cancel() {
    setEditing(null);
    setDraft(EMPTY);
    setError(null);
  }

  async function save() {
    if (!draft.full_name.trim() || !draft.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await persist({
        ...(editing !== 'new' ? { id: editing } : {}),
        full_name: draft.full_name.trim(),
        email: draft.email.trim().toLowerCase(),
        position: draft.position.trim(),
        department: draft.department,
        role: draft.role,
        is_approver: Boolean(draft.is_approver),
        is_active: true,
        can_login: true,
      });
      await reload();
      cancel();
    } catch (err) {
      setError(err.message || 'Could not save that user.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user) {
    const next = user.is_active === false;
    const verb = next ? 'Reactivate' : 'Deactivate';
    if (
      !window.confirm(
        `${verb} ${user.full_name}? ${
          next
            ? 'They will be able to sign in again.'
            : 'They will be blocked from signing in and hidden from pickers. Past records stay attributed to them.'
        }`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await setActive(user.id, next);
      await reload();
    } catch (err) {
      setError(err.message || 'Could not update that account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Users & roles"
        description="Add and edit accounts, mark approvers, and deactivate people who should no longer sign in. Deactivate is a soft flag only — records already attributed to that person stay intact."
        footer={
          <button
            type="button"
            onClick={startCreate}
            className="min-h-11 rounded-md bg-navy px-3 text-sm font-semibold text-white hover:bg-navy-mid desk:min-h-10"
          >
            Add user
          </button>
        }
      >
        {error && <p className="mb-3 text-sm text-alert">{error}</p>}

        {editing && (
          <div className="mb-4 space-y-3 rounded-md border border-primary/25 bg-primary/5 p-4">
            <p className="text-sm font-semibold text-ink">
              {editing === 'new' ? 'New user' : 'Edit user'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name">
                <TextInput value={draft.full_name} onChange={(v) => setDraft({ ...draft, full_name: v })} />
              </Field>
              <Field label="Email">
                <TextInput
                  type="email"
                  value={draft.email}
                  onChange={(v) => setDraft({ ...draft, email: v })}
                  disabled={editing !== 'new'}
                />
              </Field>
              <Field label="Position">
                <TextInput value={draft.position} onChange={(v) => setDraft({ ...draft, position: v })} />
              </Field>
              <Field label="Department">
                <Select
                  label="Department"
                  value={draft.department}
                  onChange={(v) => setDraft({ ...draft, department: v })}
                  options={DEPT_OPTIONS}
                />
              </Field>
              <Field label="Role">
                <Select
                  label="Role"
                  value={draft.role}
                  onChange={(v) => setDraft({ ...draft, role: v })}
                  options={ROLE_OPTIONS}
                />
              </Field>
              <Field label="Approver">
                <Toggle
                  checked={draft.is_approver}
                  onChange={(v) => setDraft({ ...draft, is_approver: v })}
                  label={draft.is_approver ? 'Can approve' : 'Cannot approve'}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={save}
                className="min-h-11 rounded-md bg-navy px-3 text-sm font-semibold text-white disabled:opacity-50 desk:min-h-10"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={cancel}
                className="min-h-11 rounded-md border border-line/20 px-3 text-sm font-medium text-muted desk:min-h-10"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-md border border-line/10">
          <table className="table-stack w-full text-left text-sm">
            <thead className="bg-gradient-to-r from-navy to-navy-mid text-white">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user, i) => {
                const inactive = user.is_active === false;
                return (
                  <tr key={user.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-surface'}>
                    <td data-label="Name" className="px-3 py-2">
                      <span className="font-medium text-ink">{user.full_name}</span>
                      <span className="mt-0.5 block text-xs text-muted">{user.email}</span>
                    </td>
                    <td data-label="Role" className="px-3 py-2 text-muted">
                      {user.role}
                      {user.is_approver ? ' · approver' : ''}
                    </td>
                    <td data-label="Department" className="px-3 py-2 text-muted">
                      {user.department}
                    </td>
                    <td data-label="Status" className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          inactive ? 'bg-alert/10 text-alert' : 'bg-success/15 text-teal'
                        }`}
                      >
                        {inactive ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                    <td data-label="Actions" className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => startEdit(user)}
                          className="min-h-11 rounded border border-line/20 px-3 text-xs font-semibold text-ink hover:bg-surface-2 desk:min-h-9"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => toggleActive(user)}
                          className="min-h-11 rounded border border-line/20 px-3 text-xs font-semibold text-muted hover:border-alert hover:text-alert desk:min-h-9"
                        >
                          {inactive ? 'Reactivate' : 'Deactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-ink">{label}</span>
      {children}
    </label>
  );
}
