import type { HistorySummary, Insight, WorkoutSession, WorkoutHistoryEntry } from '../types/workout';
import type { ExerciseId } from '../types/workout';
import type { BackendGoalId } from '../features/goals/goals';
export interface AthleteProfile {
  id: string;
  display_name: string;
  fitness_goal: BackendGoalId | null;
  experience_level: 'beginner' | 'intermediate' | 'advanced' | null;
  preferred_units: 'metric' | 'imperial';
  height_cm: number | null;
  weight_kg: number | null;
  weekly_workout_target: number | null;
  profile_complete: boolean;
  created_at: string;
  updated_at: string | null;
}
export type AthleteProfileInput = Pick<
  AthleteProfile,
  | 'display_name'
  | 'fitness_goal'
  | 'experience_level'
  | 'preferred_units'
  | 'height_cm'
  | 'weight_kg'
  | 'weekly_workout_target'
>;

export interface ScheduledWorkout {
  id: string;
  /** Local calendar day, YYYY-MM-DD. */
  scheduled_date: string;
  name: string | null;
  exercises: ExerciseId[];
  created_at: string;
}

export interface ScheduledWorkoutInput {
  scheduled_date: string;
  name?: string;
  exercises: ExerciseId[];
}
let getToken: (() => Promise<string>) | undefined;
export function setTokenProvider(provider?: () => Promise<string>) {
  getToken = provider;
}
const base = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
async function request<T>(
  path: string,
  options: RequestInit = {},
  blob = false,
  authentication: 'required' | 'optional' = 'required',
  expectBody = true,
): Promise<T> {
  if (!getToken && authentication === 'required') throw new Error('Sign in to connect your workout history.');
  const token = getToken ? await getToken() : undefined;
  const response = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(30000),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      typeof body.detail === 'string'
        ? body.detail
        : `Request failed (${response.status}). Please try again.`,
      response.status,
    );
  }
  if (!expectBody) return undefined as T;
  return (blob ? response.blob() : response.json()) as Promise<T>;
}
export const api = {
  profile: () => request<AthleteProfile>('/api/me'),
  updateProfile: (profile: AthleteProfileInput) => {
    const {
      display_name,
      fitness_goal,
      experience_level,
      preferred_units,
      height_cm,
      weight_kg,
      weekly_workout_target,
    } = profile;
    return request<AthleteProfile>('/api/me', {
      method: 'PATCH',
      body: JSON.stringify({
        display_name,
        fitness_goal,
        experience_level,
        preferred_units,
        height_cm,
        weight_kg,
        weekly_workout_target,
      }),
    });
  },
  tigerStatus: () =>
    request<{ connected: boolean; database: string; timescale: boolean; continuous_aggregate: boolean }>(
      '/api/platform/tiger',
    ),
  history: (offset = 0) => request<WorkoutHistoryEntry[]>(`/api/workouts?offset=${offset}&limit=50`),
  scheduled: {
    list: () => request<ScheduledWorkout[]>('/api/scheduled'),
    create: (input: ScheduledWorkoutInput) =>
      request<ScheduledWorkout>('/api/scheduled', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      request<void>(`/api/scheduled/${id}`, { method: 'DELETE' }, false, 'required', false),
  },
  detail: (id: string) => request<WorkoutSession>(`/api/workouts/${id}`),
  insights: (id: string) => request<Insight>(`/api/workouts/${id}/insights`, { method: 'POST' }),
  historySummary: () => request<HistorySummary>('/api/history/summary', { method: 'POST' }),
  speech: (text: string) =>
    request<Blob>(
      '/api/coaching/speech',
      { method: 'POST', body: JSON.stringify({ text }) },
      true,
      'optional',
    ),
  async save(session: WorkoutSession) {
    const created = await request<WorkoutSession>('/api/workouts', {
      method: 'POST',
      body: JSON.stringify({
        id: session.id,
        workout_id: session.workout_id,
        workout_name: session.workout_name,
        exercise: session.exercise,
        source: session.source,
        started_at: session.started_at,
      }),
    });
    if (created.status === 'completed') return created;
    for (let i = 0; i < session.reps.length; i += 100)
      await request(`/api/workouts/${session.id}/reps/batch`, {
        method: 'POST',
        body: JSON.stringify({ reps: session.reps.slice(i, i + 100) }),
      });
    for (let i = 0; i < session.metrics.length; i += 500)
      await request(`/api/workouts/${session.id}/metrics/batch`, {
        method: 'POST',
        body: JSON.stringify({ metrics: session.metrics.slice(i, i + 500) }),
      });
    return request<WorkoutSession>(`/api/workouts/${session.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ended_at: session.ended_at }),
    });
  },
};
