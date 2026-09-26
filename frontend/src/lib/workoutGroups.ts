import type { WorkoutHistoryEntry } from '../types/workout';

export interface WorkoutGroup {
  id: string;
  sessions: WorkoutHistoryEntry[];
  startedAt: string;
  endedAt?: string;
  totalReps: number;
  durationSeconds: number;
}

export function groupWorkouts(sessions: WorkoutHistoryEntry[]): WorkoutGroup[] {
  const groups = new Map<string, WorkoutHistoryEntry[]>();
  sessions.forEach((session) => {
    const id = session.workout_id || session.id;
    groups.set(id, [...(groups.get(id) ?? []), session]);
  });
  return [...groups.entries()]
    .map(([id, rows]) => {
      const ordered = [...rows].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
      const ended = ordered.map((row) => row.ended_at).filter(Boolean) as string[];
      const startedAt = ordered[0].started_at;
      const endedAt = ended.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
      return {
        id,
        sessions: ordered,
        startedAt,
        endedAt,
        totalReps: ordered.reduce((sum, row) => sum + row.total_reps, 0),
        durationSeconds: endedAt
          ? Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 1000))
          : 0,
      };
    })
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}
