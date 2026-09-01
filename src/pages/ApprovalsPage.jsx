import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApprovals } from '../hooks/useRepos.js';
import SignaturePad from '../components/checklist/SignaturePad.jsx';
import StatusPill from '../components/checklist/StatusPill.jsx';
import { GROUP_ORDER } from '../data/templates/registry.js';
import { teamStyle } from '../lib/checklistCatalogue.js';
import { fmtDate } from '../lib/airportFormat.js';
import Select from '../components/ui/Select.jsx';

const ROLE_LABEL = {
  om_acknowledgment: 'OM acknowledgment',
  om_coo_verification: 'OM/COO verification',
  cec_clearance: 'CEC clearance',
};

const UNGROUPED = 'Other';

/**
 * The approvals inbox.
 *
 * A reviewer signing a regulatory record needs three things before deciding:
 * which form it is, whose team it belongs to, and who filed it. Those are on
 * the row itself rather than one click away. Filtering matches the checklist
 * catalogue — same team vocabulary, same search box — so the two screens feel
 * like one system.
 *
 * Work orders (Annex H) are not listed: they are out of the incident UI, so an
 * approval pointing at one has nowhere to go. The repository filters them out.
 */
export default function ApprovalsPage() {
  const { user, profile, displayName, position } = useAuth();
  const { rows, loading, decide, reload } = useApprovals({
    ...user,
    ...profile,
    id: user?.id,
    role: profile?.role,
  });

  const [active, setActive] = useState(null);
  const [signature, setSignature] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [team, setTeam] = useState('');

  const teams = useMemo(() => {
    const present = new Set(rows.map((row) => row.entity?.group).filter(Boolean));
    const known = GROUP_ORDER.filter((g) => present.has(g));
    return present.has(UNGROUPED) ? [...known, UNGROUPED] : known;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (team && (row.entity?.group || UNGROUPED) !== team) return false;
      if (!q) return true;
      return [
        row.entity?.title,
        row.entity?.code,
        row.entity?.annex_label,
        row.entity?.group,
        row.entity?.department,
        row.entity?.filed_by,
        row.assigned_to_name,
        ROLE_LABEL[row.approval_role] ?? row.approval_role,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, query, team]);

  /**
   * Grouped by the team whose annex it is, not by approval role.
   *
   * Today every pending item is an OM acknowledgment, so grouping by role puts
   * everything in one heading and says nothing. The team is what varies, and
   * it is what a reviewer sorts by in their head. The role still travels with
   * each row as a badge, so when CEC clearance and OM/COO verification start
   * appearing the page does not need restructuring.
   */
  const grouped = useMemo(() => {
    const map = new Map();
    for (const row of filtered) {
      const key = row.entity?.group || UNGROUPED;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return [...GROUP_ORDER, UNGROUPED].filter((g) => map.has(g)).map((g) => [g, map.get(g)]);
  }, [filtered]);

  async function onDecide(decision) {
    setError(null);
    try {
      await decide({
        id: active.id,
        decision,
        notes,
        signature_data_uri: signature,
        actor: { id: user.id, full_name: displayName, position, role: profile?.role },
        name: displayName,
        position,
      });
      setActive(null);
      setSignature('');
      setNotes('');
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink sm:text-2xl">Approvals</h1>
        <p className="text-sm text-muted">
          Items waiting on {displayName}. Acknowledgment appends a signature; it does not edit the
          submitted record.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full min-w-0 sm:min-w-[16rem] sm:flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by form, team, department or person…"
            className="min-h-11 w-full rounded border border-line/20 bg-surface pl-9 pr-3 text-sm text-ink lg:min-h-10"
          />
        </div>
        <Select
          label="Filter by owning team"
          value={team}
          onChange={setTeam}
          className="min-w-0 flex-1 sm:w-56 sm:flex-none"
          options={[
            { value: '', label: 'All teams', hint: `${rows.length} waiting` },
            ...teams.map((g) => ({
              value: g,
              label: g,
              Icon: teamStyle(g).Icon,
              hint: `${rows.filter((r) => (r.entity?.group || UNGROUPED) === g).length} waiting`,
            })),
          ]}
        />
        {(query || team) && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setTeam('');
            }}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded border border-line/20 px-3 text-sm font-medium text-ink hover:bg-surface-2 lg:min-h-10"
          >
            <X className="h-4 w-4" />
            Clear filters
          </button>
        )}
      </div>

      {loading && <p className="text-muted">Loading…</p>}

      {!loading && rows.length === 0 && (
        <p className="rounded-md border border-line/10 bg-surface p-6 text-sm text-muted">
          Nothing in your inbox.
        </p>
      )}

      {!loading && rows.length > 0 && filtered.length === 0 && (
        <p className="rounded-md border border-line/10 bg-surface p-6 text-sm text-muted">
          No approvals match those filters.
        </p>
      )}

      {grouped.map(([groupName, list]) => {
        const { Icon, tile } = teamStyle(groupName);
        return (
        <section key={groupName} className="overflow-hidden rounded-lg border border-line/10 bg-surface shadow-card">
          <h2 className="flex items-center gap-2 border-b border-line/10 bg-stripe px-4 py-2.5">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${tile}`}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-sm font-bold text-ink">{groupName}</span>
            <span className="text-sm font-normal text-muted">· {list.length}</span>
          </h2>
          <ul>
            {list.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-3 border-b border-line/5 px-4 py-3 last:border-0 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    {row.entity?.annex_label ? `${row.entity.annex_label} — ` : ''}
                    {row.entity?.title || row.entity_id}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {row.entity?.code}
                    {row.entity?.date ? ` · inspected ${fmtDate(row.entity.date)}` : ''} · waiting{' '}
                    {ageDays(row.created_at)}d
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Tag tone="role">{ROLE_LABEL[row.approval_role] || row.approval_role}</Tag>
                    {row.entity?.department && <Tag>{row.entity.department}</Tag>}
                    {row.entity?.filed_by && <Tag>Filed by {row.entity.filed_by}</Tag>}
                    <Tag tone="assignee">
                      {row.assigned_to_name ? `With ${row.assigned_to_name}` : 'Unassigned'}
                    </Tag>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {row.entity?.href && (
                    <Link
                      to={row.entity.href}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-line/20 px-3 text-sm text-primary hover:bg-surface-2 lg:min-h-9 sm:flex-none"
                    >
                      Open
                    </Link>
                  )}
                  <button
                    type="button"
                    className="min-h-11 flex-1 rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-white lg:min-h-9 sm:flex-none"
                    onClick={() => {
                      setActive(row);
                      setError(null);
                    }}
                  >
                    Review
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
        );
      })}

      {active && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-navy/50 sm:items-start sm:p-4 sm:pt-10">
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-lg sm:pb-5">
            <h3 className="text-lg font-bold text-ink">Review approval</h3>
            <p className="mt-1 text-sm text-muted">{active.entity?.title}</p>

            <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
              <Detail label="Form" value={active.entity?.code} />
              <Detail label="Team" value={active.entity?.group} />
              <Detail label="Department" value={active.entity?.department} />
              <Detail label="Filed by" value={active.entity?.filed_by} />
              <Detail label="Inspected" value={active.entity?.date ? fmtDate(active.entity.date) : null} />
              <Detail label="With" value={active.assigned_to_name} />
            </dl>

            <p className="mt-3 text-sm">
              Status <StatusPill status={active.entity?.status} />
            </p>
            <p className="mt-3 text-xs text-muted">
              Rejection of a submitted regulatory record is pending BACC confirmation. Notes are
              stored either way.
            </p>
            <label className="mt-3 block text-sm">
              Notes
              <textarea
                className="mt-1 w-full rounded border border-line/20 bg-surface px-3 py-2 text-ink"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <p className="mt-3 text-xs font-semibold uppercase text-muted">Drawn signature</p>
            <SignaturePad value={signature} onChange={setSignature} />
            {error && <p className="mt-2 text-sm text-alert">{error}</p>}
            <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <button
                type="button"
                className="min-h-11 rounded-md border px-3 py-2 text-sm sm:order-1"
                onClick={() => setActive(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="min-h-11 rounded-md border border-alert px-3 py-2 text-sm text-alert sm:order-2"
                onClick={() => onDecide('rejected')}
              >
                Reject
              </button>
              <button
                type="button"
                className="min-h-11 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white sm:order-3"
                onClick={() => onDecide('approved')}
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TAG_TONES = {
  role: 'border-primary/30 bg-primary/5 text-primary',
  assignee: 'border-teal/40 bg-teal/10 text-ink',
  default: 'border-line/15 bg-stripe text-muted',
};

function Tag({ tone = 'default', children }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${TAG_TONES[tone]}`}>
      {children}
    </span>
  );
}

function Detail({ label, value }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </>
  );
}

function ageDays(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000));
}
