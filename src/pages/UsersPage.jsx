import { useUsers } from '../hooks/useRepos.js';

/**
 * Who uses the portal.
 *
 * Which posts on the approved forms nobody holds yet is still derived — see
 * lib/roleStaffing.js — but BACC has said they already know, so the portal no
 * longer says it back to them.
 */
export default function UsersPage() {
  const { rows } = useUsers();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink sm:text-2xl">Users</h1>
      <p className="text-sm text-muted">
        Everyone who can sign in. Accounts marked <em>Test account</em> are for walkthroughs and are not PGIA
        staff.
      </p>

      <div className="overflow-hidden rounded-lg border border-line/10 bg-surface shadow-card">
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
            {rows.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-surface'}>
                <td data-label="Name" className="px-4 py-3 font-medium text-ink">{row.full_name}</td>
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
