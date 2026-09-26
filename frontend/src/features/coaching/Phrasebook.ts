import type { ExerciseId, FormFault } from '../../types/workout';
import { coachingPhrases } from '../exercises/MovementCues';

export const PRIORITY = {
  fault: 100,
  summary: 90,
  rep: 85,
  transition: 80,
  setup: 20,
} as const;

export type CueKind = keyof typeof PRIORITY;

export interface VoiceCue {
  text: string;
  kind: CueKind;
  priority: number;
  metadata?: Record<string, string | number | boolean>;
}

export const FAULT_PHRASES: Partial<Record<ExerciseId, FormFault[]>> = {
  squat: [
    {
      code: 'excessive_forward_lean',
      message: 'Keep your chest a little more upright.',
      severity: 'warning',
    },
    {
      code: 'insufficient_depth',
      message: 'Try a little more depth within your comfortable range.',
      severity: 'warning',
    },
  ],
  curl: [
    { code: 'upper_arm_movement', message: 'Keep your upper arm close to your side.', severity: 'warning' },
    {
      code: 'limited_range',
      message: 'Try a fuller range of motion at a comfortable pace.',
      severity: 'warning',
    },
  ],
  pushup: [
    { code: 'hip_alignment', message: 'Keep your shoulders, hips, and ankles in line.', severity: 'warning' },
    {
      code: 'limited_range',
      message: 'Try a fuller range of motion at a comfortable pace.',
      severity: 'warning',
    },
  ],
  deadlift: [
    { code: 'excessive_back_rounding', message: 'Keep your back flat — hinge at the hips, chest proud.', severity: 'warning' },
    { code: 'insufficient_hinge', message: 'Hinge deeper at the hips within your comfortable range.', severity: 'warning' },
  ],
  lunge: [
    { code: 'knee_over_toes', message: 'Keep your front knee behind your toes.', severity: 'warning' },
    { code: 'insufficient_depth', message: 'Try a little more depth within your comfortable range.', severity: 'warning' },
  ],
  press: [
    { code: 'excessive_back_arch', message: "Keep your ribs down — don't arch your back.", severity: 'warning' },
    { code: 'limited_range', message: 'Try a fuller range of motion at a comfortable pace.', severity: 'warning' },
  ],
  glute_bridge: [
    { code: 'excessive_back_arch', message: 'Keep your ribs down — squeeze your glutes, not your low back.', severity: 'warning' },
    { code: 'incomplete_extension', message: 'Lower your hips all the way down, then drive up to a full bridge.', severity: 'warning' },
  ],
  row: [
    { code: 'torso_rising', message: "Keep your torso still — don't stand up to pull the weight.", severity: 'warning' },
    { code: 'incomplete_pull', message: 'Pull your elbow all the way up toward your hip.', severity: 'warning' },
  ],
  dips: [
    { code: 'excessive_forward_lean', message: "Keep your torso upright — don't pitch forward over your hands.", severity: 'warning' },
    { code: 'insufficient_depth', message: 'Lower a little deeper within your comfortable range.', severity: 'warning' },
  ],
  pullup: [
    { code: 'excessive_swing', message: "Keep your body still — don't swing or kip.", severity: 'warning' },
    { code: 'incomplete_pull', message: 'Pull all the way up — chin over the bar.', severity: 'warning' },
  ],
};

const WARM_COUNT_PHRASES = [
  '1.',
  '2. Settle into your pace.',
  '3. Stay controlled.',
  '4. Keep the rhythm.',
  '5. Control the return.',
] as const;
const COUNT_PHRASES = new Map([
  ...WARM_COUNT_PHRASES.map((phrase, index) => [index + 1, phrase] as const),
  [10, '10. Keep the rhythm.'] as const,
]);

export function repCountCue(totalReps: number, exercise: ExerciseId, repsCompleted = 1): VoiceCue | null {
  if (totalReps < 1 || (totalReps > 5 && totalReps % 5 !== 0)) return null;
  return {
    text: COUNT_PHRASES.get(totalReps) ?? `${totalReps}.`,
    kind: 'rep',
    priority: PRIORITY.rep,
    metadata: { totalReps, repsCompleted, exercise },
  };
}

export function selectedExerciseWarmPhrases(exercise: ExerciseId): string[] {
  return [
    ...WARM_COUNT_PHRASES,
    ...coachingPhrases(exercise),
    ...(FAULT_PHRASES[exercise] ?? []).map(({ message }) => message),
  ];
}
