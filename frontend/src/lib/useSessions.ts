import { useCallback, useEffect, useState } from 'react';
import { useIdentity } from '../features/auth/AuthProvider';
import { api } from './api';
import { localSessions } from './sessionBuffer';
import type { WorkoutHistoryEntry } from '../types/workout';
export function useSessions() {
  const { authenticated, owner } = useIdentity();
  const [sessions, setSessions] = useState<WorkoutHistoryEntry[]>(() => localSessions(owner));
  const [loading, setLoading] = useState(authenticated);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let cancelled = false;
    const local = localSessions(owner);
    setSessions(local);
    setError('');
    if (!authenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const remote: WorkoutHistoryEntry[] = [];
      let page: WorkoutHistoryEntry[];
      do {
        page = await api.history(remote.length);
        remote.push(...page);
      } while (page.length === 50 && remote.length < 1000);
      const merged = new Map<string, WorkoutHistoryEntry>(local.map((s) => [s.id, s]));
      remote
        .filter((s) => s.source !== 'demo')
        .forEach((s) => merged.set(s.id, { ...merged.get(s.id), ...s, local: false }));
      if (!cancelled)
        setSessions([...merged.values()].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)));
    })()
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, owner, version]);
  return { sessions, loading, error, retry };
}
