import { User } from 'lucide-react';
import { useUsers } from '../hooks/useRepos.js';
import { useAvatarUrl } from '../lib/avatar.js';

/**
 * Who uses the portal.
 *
 * Which posts on the approved forms nobody holds yet is still derived — see
 * lib/roleStaffing.js — but BACC has said they already know, so the portal no
 * longer says it back to them.
 */
export default function UsersPage() {
  const { rows, loading, error } = useUsers();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink sm:text-2xl">Users</h1>
      <p className="text-sm text-muted">
        Everyone who can sign in. Accounts marked <em>Test account</em> are for walkthroughs and are not PGIA
        staff.
      </p>
      {error && (
        <p className="rounded-md border border-alert bg-alert-soft px-4 py-2 text-sm text-alert">
          {error.message || 'Could not load the staff directory.'}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-line/10 bg-surface shadow-card">
        <table className="table-stack w-full text-left text-sm">
          <thead className="bg-gradient-to-r from-navy to-navy-mid text-white">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Position</th>
              <th className="px-4 py-2">Department</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No sign-in accounts found.
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-surface'}>
                <td data-label="Name" className="px-4 py-3 font-medium text-ink">
                  <div className="flex items-center gap-2.5">
                    <UserAvatar path={row.avatar_url} />
                    {row.full_name}
                  </div>
                </td>
                <td data-label="Position" className="px-4 py-3">{row.position}</td>
                <td data-label="Department" className="px-4 py-3">{row.department}</td>
                <td data-label="Email" className="break-all px-4 py-3 text-muted">{row.email}</td>
                <td data-label="Notes" className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {row.is_approver && (
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-teal">
                        Approver
                      </span>
                    )}
                    {row.is_demo && (
                      <span className="rounded-full bg-line/12 px-2 py-0.5 text-[11px] font-semibold text-ink">
                        Test account
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserAvatar({ path }) {
  const url = useAvatarUrl(path);
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line/15 bg-stripe text-muted">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <User className="h-3.5 w-3.5" aria-hidden />}
    </span>
  );
}
