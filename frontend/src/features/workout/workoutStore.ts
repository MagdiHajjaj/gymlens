import { create } from 'zustand';
import type { ExerciseId, ExerciseResult, WorkoutSession } from '../../types/workout';
interface Store {
  selected: ExerciseId;
  session: WorkoutSession | null;
  result: ExerciseResult | null;
  paused: boolean;
  voice: boolean;
  select: (id: ExerciseId) => void;
  begin: (source: 'camera' | 'demo') => void;
  ingest: (result: ExerciseResult, timestamp: number) => void;
  pause: () => void;
  toggleVoice: () => void;
  finish: () => WorkoutSession;
}
let lastMetric = 0;
export const useWorkout = create<Store>((set, get) => ({
  selected: 'squat',
  session: null,
  result: null,
  paused: false,
  voice: false,
  select: (selected) => set({ selected }),
  begin: (source) => {
    lastMetric = 0;
    set({
      session: {
        id: crypto.randomUUID(),
        exercise: get().selected,
        source,
        started_at: new Date().toISOString(),
        total_reps: 0,
        status: 'active',
        reps: [],
        metrics: [],
        local: true,
      },
      result: null,
      paused: false,
    });
  },
  ingest: (result, timestamp) =>
    set((state) => {
      if (!state.session || state.paused || state.session.status !== 'active') return {};
      const session = state.session;
      const completed_at = new Date().toISOString();
      const reps = result.repCompleted
        ? [
            ...session.reps,
            {
              rep_number: session.reps.length + 1,
              completed_at,
              metrics_json: result.repMetrics || {},
              faults_json: result.faults,
            },
          ]
        : session.reps;
      let metrics = session.metrics;
      if (
        result.trackingValid &&
        result.calibrated &&
        timestamp - lastMetric >= 1000 &&
        metrics.length < 29000
      ) {
        lastMetric = timestamp;
        metrics = [
          ...metrics,
          ...Object.entries(result.jointAngles).map(([metric_name, metric_value]) => ({
            recorded_at: completed_at,
            metric_name,
            metric_value,
          })),
        ];
      }
      return { result, session: { ...session, reps, total_reps: reps.length, metrics } };
    }),
  pause: () => set((s) => ({ paused: !s.paused, result: null })),
  toggleVoice: () => set((s) => ({ voice: !s.voice })),
  finish: () => {
    const current = get().session;
    if (!current) throw new Error('No active workout');
    const session: WorkoutSession = { ...current, ended_at: new Date().toISOString(), status: 'completed' };
    set({ session, paused: true });
    return session;
  },
}));
