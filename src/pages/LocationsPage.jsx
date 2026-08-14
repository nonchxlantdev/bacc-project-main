const LOCATIONS = [
  {
    id: 'pgia',
    name: 'Philip S.W. Goldson International Airport',
    code: 'PGIA / BZE',
    note: 'Primary aerodrome. GPS/offline location capture expands in a later phase.',
  },
];

export default function LocationsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-navy">Locations</h1>
      <p className="text-sm text-muted">
        Phase 1 ships a static PGIA record so inspections have a home. Full location CRUD and GPS tagging come later.
      </p>
      <div className="overflow-hidden rounded-lg border border-navy/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy text-white">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {LOCATIONS.map((row) => (
              <tr key={row.id} className="bg-stripe">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3">{row.code}</td>
                <td className="px-4 py-3 text-muted">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
