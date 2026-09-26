import type { WorkoutSession } from '../types/workout';
import { exercises } from '../features/exercises/ExerciseRegistry';
const prefix = 'gym-lens:v1:sessions:';
const knownExercises = new Set(Object.keys(exercises));
export function localSessions(owner: string): WorkoutSession[] {
  try {
    const value = JSON.parse(localStorage.getItem(prefix + owner) || '[]');
    const sessions = Array.isArray(value)
      ? value.filter(
          (s) =>
            s &&
            typeof s.id === 'string' &&
            s.source !== 'demo' &&
            knownExercises.has(s.exercise) &&
            Array.isArray(s.reps) &&
            Array.isArray(s.metrics),
        )
      : [];
    if (Array.isArray(value) && sessions.length !== value.length) {
      localStorage.setItem(prefix + owner, JSON.stringify(sessions));
    }
    return sessions.map((session) => ({ ...session, workout_id: session.workout_id ?? session.id }));
  } catch {
    return [];
  }
}
export function saveLocal(session: WorkoutSession, owner: string) {
  if (session.source === 'demo') return;
  const rows = [session, ...localSessions(owner).filter((s) => s.id !== session.id)].slice(0, 50);
  localStorage.setItem(prefix + owner, JSON.stringify(rows));
}
export function exportSession(session: WorkoutSession) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `gym-lens-${session.id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function duration(session: Pick<WorkoutSession, 'started_at' | 'ended_at'>) {
  return Math.max(
    0,
    Math.floor(
      (Date.parse(session.ended_at || new Date().toISOString()) - Date.parse(session.started_at)) / 1000,
    ),
  );
}
export function timeLabel(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
