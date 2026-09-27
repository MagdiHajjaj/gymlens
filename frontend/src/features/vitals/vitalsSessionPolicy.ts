import type { WorkoutSession } from '../../types/workout';

/**
 * Vitals only run on the live camera. In demo/upload sessions the video
 * element plays sample footage, and measuring the footage subject's face
 * would present someone else's pulse as the user's. Never fabricate vitals.
 */
export function shouldRunVitals(session: WorkoutSession | null, workoutLive: boolean): boolean {
  return workoutLive && session?.source === 'camera';
}
