import { useUsers } from '../hooks/useRepos.js';

export default function UsersPage() {
  const { rows } = useUsers();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-navy">Users</h1>
      <p className="text-sm text-muted">
        Demo directory. Only two accounts can sign in; the rest exist because the seeded Annex D history is
        attributed to them and submitted records are never rewritten.
      </p>
      <div className="overflow-hidden rounded-lg border border-navy/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy text-white">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Position</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Department</th>
              <th className="px-4 py-2">Sign-in</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-white'}>
                <td className="px-4 py-3 font-medium">{row.full_name}</td>
                <td className="px-4 py-3">{row.position}</td>
                <td className="px-4 py-3">{row.role}</td>
                <td className="px-4 py-3">{row.department}</td>
                <td className="px-4 py-3">
                  {row.can_login ? (
                    <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-teal">
                      Enabled
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted">Record only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
