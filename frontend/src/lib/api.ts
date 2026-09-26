import type { Insight, WorkoutSession } from '../types/workout';
export interface AthleteProfile {
  id: string;
  display_name: string;
  fitness_goal: 'strength' | 'muscle' | 'mobility' | 'general_fitness' | null;
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
let getToken: (() => Promise<string>) | undefined;
export function setTokenProvider(provider?: () => Promise<string>) {
  getToken = provider;
}
const base = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
async function request<T>(path: string, options: RequestInit = {}, blob = false): Promise<T> {
  if (!getToken) throw new Error('Sign in to connect your workout history.');
  const token = await getToken();
  const response = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === 'string'
        ? body.detail
        : `Request failed (${response.status}). Please try again.`,
    );
  }
  return (blob ? response.blob() : response.json()) as Promise<T>;
}
export const api = {
  profile: () => request<AthleteProfile>('/api/me'),
  updateProfile: (profile: AthleteProfileInput) =>
    request<AthleteProfile>('/api/me', { method: 'PATCH', body: JSON.stringify(profile) }),
  tigerStatus: () =>
    request<{ connected: boolean; database: string; timescale: boolean; continuous_aggregate: boolean }>(
      '/api/platform/tiger',
    ),
  history: (offset = 0) => request<WorkoutSession[]>(`/api/workouts?offset=${offset}&limit=50`),
  detail: (id: string) => request<WorkoutSession>(`/api/workouts/${id}`),
  insights: (id: string) => request<Insight>(`/api/workouts/${id}/insights`, { method: 'POST' }),
  speech: (text: string) =>
    request<Blob>('/api/coaching/speech', { method: 'POST', body: JSON.stringify({ text }) }, true),
  async save(session: WorkoutSession) {
    const created = await request<WorkoutSession>('/api/workouts', {
      method: 'POST',
      body: JSON.stringify({
        id: session.id,
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
