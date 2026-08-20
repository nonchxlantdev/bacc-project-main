import { useCallback, useEffect, useState } from 'react';
import { getRepos, subscribeData } from '../data/repositories/index.js';

export function useRepos() {
  return getRepos();
}

function useQuery(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loader();
      setData(next);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    reload();
    return subscribeData(() => {
      reload();
    });
  }, [reload]);

  return { data, loading, error, reload };
}

export function useChecklists(userId, { all = false } = {}) {
  const repos = getRepos();
  const query = useQuery(
    () => (all ? repos.checklists.listAll() : repos.checklists.listMine(userId)),
    [userId, all],
  );
  return {
    ...query,
    rows: query.data ?? [],
    persist: (record) => repos.checklists.persist(record),
    removeDraft: (record) => repos.checklists.deleteDraft(record),
    acknowledge: (payload) => repos.checklists.acknowledge(payload),
    get: (id) => repos.checklists.get(id),
  };
}

export function useTemplates(profile) {
  const repos = getRepos();
  const query = useQuery(() => repos.templates.list(profile), [profile?.id, profile?.role, profile?.department]);
  return { ...query, rows: query.data ?? [], get: (id) => repos.templates.get(id) };
}

export function useIncidents() {
  const repos = getRepos();
  const query = useQuery(() => repos.incidents.list(), []);
  return {
    ...query,
    rows: query.data ?? [],
    get: (id) => repos.incidents.get(id),
    persist: (record) => repos.incidents.persist(record),
    addUpdate: (incident, update) => repos.incidents.addUpdate(incident, update),
  };
}

export function useNotifications(userId) {
  const repos = getRepos();
  const query = useQuery(async () => {
    if (!userId) return { rows: [], unread: 0 };
    const [rows, unread] = await Promise.all([
      repos.notifications.listForUser(userId),
      repos.notifications.unreadCount(userId),
    ]);
    return { rows, unread };
  }, [userId]);
  return {
    ...query,
    rows: query.data?.rows ?? [],
    unread: query.data?.unread ?? 0,
    markRead: (id) => repos.notifications.markRead(id),
    markAllRead: () => repos.notifications.markAllRead(userId),
  };
}

export function useApprovals(user) {
  const repos = getRepos();
  const query = useQuery(() => (user ? repos.approvals.listInbox(user) : Promise.resolve([])), [
    user?.id,
    user?.role,
  ]);
  return {
    ...query,
    rows: query.data ?? [],
    decide: (payload) => repos.approvals.decide(payload),
  };
}

export function useReports() {
  const repos = getRepos();
  return repos.reports;
}

export function useInstances() {
  const repos = getRepos();
  const query = useQuery(() => repos.instances.list(), []);
  return {
    ...query,
    rows: query.data ?? [],
    generate: () => repos.instances.generate(),
    advanceClock: (days) => repos.instances.advanceClock(days),
    getClock: () => repos.instances.getClock(),
  };
}

export function useUsers() {
  const repos = getRepos();
  const query = useQuery(() => repos.users.list(), []);
  return { ...query, rows: query.data ?? [] };
}
