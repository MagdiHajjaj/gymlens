import type { ExerciseId, WorkoutHistoryEntry } from '../types/workout';

export interface WeightProgressPoint {
  sessionId: string;
  timestamp: number;
  date: string;
  weightKg: number;
}

export function weightProgress(
  sessions: WorkoutHistoryEntry[],
  exercise: ExerciseId,
): WeightProgressPoint[] {
  return sessions
    .filter(
      (session) =>
        session.exercise === exercise &&
        session.status === 'completed' &&
        typeof session.weight_kg === 'number' &&
        Number.isFinite(session.weight_kg) &&
        session.weight_kg > 0,
    )
    .map((session) => ({
      sessionId: session.id,
      timestamp: Date.parse(session.started_at),
      date: new Date(session.started_at).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      }),
      weightKg: session.weight_kg as number,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

