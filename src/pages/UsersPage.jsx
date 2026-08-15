import { useUsers } from '../hooks/useRepos.js';

export default function UsersPage() {
  const { rows } = useUsers();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-navy">Users</h1>
      <p className="text-sm text-muted">
        Directory for the Annex D slice — inspectors, Duty Manager, OM, COO, and CEC. Other annex roles are not seeded.
      </p>
      <div className="overflow-hidden rounded-lg border border-navy/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy text-white">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Position</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Department</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-white'}>
                <td className="px-4 py-3 font-medium">{row.full_name}</td>
                <td className="px-4 py-3">{row.position}</td>
                <td className="px-4 py-3">{row.role}</td>
                <td className="px-4 py-3">{row.department}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
