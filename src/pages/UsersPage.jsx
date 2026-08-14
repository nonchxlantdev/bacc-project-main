import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

export default function UsersPage() {
  const { displayName, position, user } = useAuth();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    async function load() {
      if (!isSupabaseConfigured || !supabase) {
        setRows([{ id: user?.id, full_name: displayName, position, role: 'inspector' }]);
        return;
      }
      const { data } = await supabase.from('profiles').select('id, full_name, position, role').order('full_name');
      setRows(data ?? []);
    }
    load();
  }, [displayName, position, user]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-navy">Users</h1>
      <p className="text-sm text-muted">Basic directory from inspector profiles. Role management is out of scope for Phase 1.</p>
      <div className="overflow-hidden rounded-lg border border-navy/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy text-white">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Position</th>
              <th className="px-4 py-2">Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-white'}>
                <td className="px-4 py-3 font-medium">{row.full_name}</td>
                <td className="px-4 py-3">{row.position}</td>
                <td className="px-4 py-3">{row.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
