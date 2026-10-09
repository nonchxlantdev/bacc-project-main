import { useCallback, useEffect, useState } from 'react';
import { usersAdminClient } from '../lib/authClient.js';

/** Users & roles data in d1 mode — same shape as useUsers() where it overlaps. */
export function useD1Users() {
  const [rows, setRows] = useState([]);
  const reload = useCallback(async () => {
    setRows(await usersAdminClient.list());
  }, []);
  useEffect(() => {
    reload().catch(() => setRows([]));
  }, [reload]);
  return {
    rows,
    reload,
    persist: (patch) => usersAdminClient.update(patch),
    setActive: (id, active) => usersAdminClient.update({ id, is_active: active, can_login: active }),
  };
}
