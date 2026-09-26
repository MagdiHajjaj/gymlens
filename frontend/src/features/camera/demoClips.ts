import type { ExerciseId } from '../../types/workout';

/**
 * The demo videos are stock footage; some clips have dead air (intros, the
 * athlete resting between sets, walking away) around the actual reps. This
 * maps each exercise to the [start, end] second range worth looping. Exercises
 * without an entry loop the whole file. Ranges were set by watching the clips.
 */
export const DEMO_CLIPS: Partial<Record<ExerciseId, { start: number; end: number }>> = {
  pullup: { start: 0.5, end: 10 },
  lunge: { start: 0, end: 6 },
  curl: { start: 0, end: 12 },
  glute_bridge: { start: 0, end: 6 },
};

/**
 * Container extensions for the demo videos. Most clips are MP4; row ships as
 * WebM (its Wikimedia Commons source has no H.264 transcode). The video
 * element plays WebM natively in all modern browsers.
 */
export const DEMO_VIDEO_EXTENSIONS: Partial<Record<ExerciseId, string>> = {
  row: 'webm',
};
