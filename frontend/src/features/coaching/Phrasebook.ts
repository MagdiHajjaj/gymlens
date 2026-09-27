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

interface FaultPhrase extends FormFault {
  /**
   * Spoken variants cycled in order, so repeated corrections don't sound
   * looped. Every variant is allowlisted by the backend speech grammar.
   */
  variants: string[];
  /**
   * Setup/drill-oriented cue spoken once the same fault keeps recurring —
   * a different angle instead of another repetition.
   */
  drill: string;
}

export const FAULT_PHRASES: Partial<Record<ExerciseId, FaultPhrase[]>> = {
  squat: [
    {
      code: 'excessive_forward_lean',
      message: 'Keep your chest a little more upright.',
      variants: [
        'Keep your chest a little more upright.',
        'Chest up — stay tall through the rep.',
        'Eyes forward, chest proud as you stand.',
      ],
      drill: 'Pause at the bottom and feel your chest staying tall before you drive up.',
      severity: 'warning',
    },
    {
      code: 'insufficient_depth',
      message: 'Try a little more depth within your comfortable range.',
      variants: [
        'Try a little more depth within your comfortable range.',
        'Sink a little deeper on the next one.',
        'Chase depth you can own — a touch lower each rep.',
      ],
      drill: 'Bodyweight practice: sit to a chair and stand without your chest dropping.',
      severity: 'warning',
    },
  ],
  curl: [
    {
      code: 'upper_arm_movement',
      message: 'Keep your upper arm close to your side.',
      variants: [
        'Keep your upper arm close to your side.',
        'Pin your elbow to your side.',
        'Elbows pinned — only the forearm moves.',
      ],
      drill: 'Stand with your back against a wall and curl without your elbows leaving it.',
      severity: 'warning',
    },
    {
      code: 'excessive_torso_swing',
      message: "Keep your torso still — don't swing the weight up.",
      variants: [
        "Keep your torso still — don't swing the weight up.",
        'No swinging — strict curls only.',
        'Squeeze at the top instead of swinging through it.',
      ],
      drill: 'Drop the weight a little and do strict reps — no momentum.',
      severity: 'warning',
    },
    {
      code: 'limited_range',
      message: 'Try a fuller range of motion at a comfortable pace.',
      variants: [
        'Try a fuller range of motion at a comfortable pace.',
        'Use the full range — all the way down, all the way up.',
        'Own the full range — stretch at the bottom, squeeze at the top.',
      ],
      drill: 'Slow the rep down and pause one second at each end of the range.',
      severity: 'warning',
    },
  ],
  pushup: [
    {
      code: 'hip_alignment',
      message: 'Keep your shoulders, hips, and ankles in line.',
      variants: [
        'Keep your shoulders, hips, and ankles in line.',
        'Straight line — shoulders, hips, ankles.',
        'Glutes tight — your body is one straight board.',
      ],
      drill: 'Hold a 20-second plank between sets and lock in that straight line.',
      severity: 'warning',
    },
    {
      code: 'limited_range',
      message: 'Try a fuller range of motion at a comfortable pace.',
      variants: [
        'Try a fuller range of motion at a comfortable pace.',
        'Use the full range — all the way down, all the way up.',
        'Chest to the floor, arms straight at the top.',
      ],
      drill: 'Slow the rep down and pause one second at each end of the range.',
      severity: 'warning',
    },
  ],
  deadlift: [
    {
      code: 'excessive_back_rounding',
      message: 'Keep your back flat — hinge at the hips, chest proud.',
      variants: [
        'Keep your back flat — hinge at the hips, chest proud.',
        'Flat back — push your hips back.',
        'Chest proud, back flat — like a tabletop.',
      ],
      drill: 'Practice the hinge with light weight: hips back, spine long.',
      severity: 'warning',
    },
    {
      code: 'insufficient_hinge',
      message: 'Hinge deeper at the hips within your comfortable range.',
      variants: [
        'Hinge deeper at the hips within your comfortable range.',
        'Hinge further back on the next rep.',
        'Reach your hips further behind you.',
      ],
      drill: 'Stand a foot from a wall and touch it with your hips as you hinge.',
      severity: 'warning',
    },
  ],
  lunge: [
    {
      code: 'knee_over_toes',
      message: 'Keep your front knee behind your toes.',
      variants: [
        'Keep your front knee behind your toes.',
        'Knee back — track it over your ankle.',
        'Shin vertical — knee stacked over the ankle.',
      ],
      drill: 'Take a slightly longer stance so the knee stays back.',
      severity: 'warning',
    },
    {
      code: 'insufficient_depth',
      message: 'Try a little more depth within your comfortable range.',
      variants: [
        'Try a little more depth within your comfortable range.',
        'Sink a little deeper on the next one.',
        'Drop the back knee straighter down.',
      ],
      drill: 'Shorten your stance a touch and sink straight down.',
      severity: 'warning',
    },
  ],
  press: [
    {
      code: 'excessive_back_arch',
      message: "Keep your ribs down — don't arch your back.",
      variants: [
        "Keep your ribs down — don't arch your back.",
        'Ribs down — squeeze your glutes.',
        'Tuck your ribs — brace like someone will poke your stomach.',
      ],
      drill: 'Squeeze your glutes hard before each press to lock the ribs down.',
      severity: 'warning',
    },
    {
      code: 'limited_range',
      message: 'Try a fuller range of motion at a comfortable pace.',
      variants: [
        'Try a fuller range of motion at a comfortable pace.',
        'Use the full range — all the way down, all the way up.',
        'Full lockout overhead, control it back to your shoulders.',
      ],
      drill: 'Slow the rep down and pause one second at each end of the range.',
      severity: 'warning',
    },
  ],
  glute_bridge: [
    {
      code: 'excessive_back_arch',
      message: 'Keep your ribs down — squeeze your glutes, not your low back.',
      variants: [
        'Keep your ribs down — squeeze your glutes, not your low back.',
        'Ribs down — drive through your glutes.',
        'Posterior tilt — flatten your low back into the floor first.',
      ],
      drill: 'Reset each rep: ribs down, then bridge.',
      severity: 'warning',
    },
    {
      code: 'incomplete_extension',
      message: 'Lower your hips all the way down, then drive up to a full bridge.',
      variants: [
        'Lower your hips all the way down, then drive up to a full bridge.',
        'Full bridge — hips all the way up.',
        'Push your hips to the ceiling — full lockout.',
      ],
      drill: 'Hold the top for two seconds and squeeze before lowering.',
      severity: 'warning',
    },
  ],
  row: [
    {
      code: 'torso_rising',
      message: "Keep your torso still — don't stand up to pull the weight.",
      variants: [
        "Keep your torso still — don't stand up to pull the weight.",
        'Stay hinged — no standing up to pull.',
        "Chest stays over your knees — the hinge doesn't move.",
      ],
      drill: 'Lighten the weight until you can row without your torso lifting.',
      severity: 'warning',
    },
    {
      code: 'incomplete_pull',
      message: 'Pull your elbow all the way up toward your hip.',
      variants: [
        'Pull your elbow all the way up toward your hip.',
        'Elbow high — pull it all the way through.',
        'Squeeze your shoulder blade at the top of every pull.',
      ],
      drill: 'Pause one second with the elbow at your hip each rep.',
      severity: 'warning',
    },
  ],
  dips: [
    {
      code: 'excessive_forward_lean',
      message: "Keep your torso upright — don't pitch forward over your hands.",
      variants: [
        "Keep your torso upright — don't pitch forward over your hands.",
        'Stay upright over your hands.',
        'Chest up, shoulders stacked over your hands.',
      ],
      drill: 'Keep the reps shallow and upright until the lean stops.',
      severity: 'warning',
    },
    {
      code: 'insufficient_depth',
      message: 'Lower a little deeper within your comfortable range.',
      variants: [
        'Lower a little deeper within your comfortable range.',
        'A touch deeper on the next rep.',
        'Shoulders a touch lower than elbows at the bottom.',
      ],
      drill: 'Use a smaller range you can control, then build depth.',
      severity: 'warning',
    },
  ],
  pullup: [
    {
      code: 'excessive_swing',
      message: "Keep your body still — don't swing or kip.",
      variants: [
        "Keep your body still — don't swing or kip.",
        'Dead hang — no swinging.',
        'Tighten your core — no kipping.',
      ],
      drill: 'Start each rep from a dead-stop hang with no swing.',
      severity: 'warning',
    },
    {
      code: 'incomplete_pull',
      message: 'Pull all the way up — chin over the bar.',
      variants: [
        'Pull all the way up — chin over the bar.',
        'Chin over the bar on the next one.',
        'Get your chin clearly over the bar.',
      ],
      drill: 'Use a band or box to finish the top two inches of the pull.',
      severity: 'warning',
    },
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
    ...coachingPhrases(exercise),
    ...(FAULT_PHRASES[exercise] ?? []).map(({ message }) => message),
    ...WARM_COUNT_PHRASES,
  ];
}
