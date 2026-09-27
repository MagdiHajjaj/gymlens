import type { ExerciseId, RepEvent, WorkoutSession } from '../../types/workout';

const cueNames: Record<string, string> = {
  insufficient_depth: 'Shallow depth',
  excessive_forward_lean: 'Forward lean',
  limited_range: 'Limited range of motion',
  upper_arm_movement: 'Upper arm moving',
  hip_alignment: 'Hips out of alignment',
  excessive_back_rounding: 'Back rounding',
  insufficient_hinge: 'Shallow hinge',
  knee_over_toes: 'Knees past toes',
  excessive_back_arch: 'Back arching',
  incomplete_extension: 'Incomplete extension',
  incomplete_pull: 'Incomplete pull',
  torso_rising: 'Torso lifting early',
  excessive_swing: 'Body swing',
};

const nextActions: Record<string, string> = {
  insufficient_depth:
    'Use a comfortable, repeatable depth in your next set. Keep the camera at the same angle so the depth readings are comparable.',
  excessive_forward_lean:
    'Pay attention to your torso position through the movement. Check the camera is side-on before comparing the next set.',
  limited_range:
    'Complete the movement and return to your starting position at a comfortable range. Watch whether the limited range repeats.',
  upper_arm_movement:
    'Keep your upper arm steady while you curl. Keep your shoulder, elbow, and wrist in view for the next set.',
  hip_alignment: 'Check your shoulder, hip, and ankle alignment in the camera preview before the next set.',
  excessive_back_rounding:
    'Review your side-on camera position and torso movement. This estimates torso angle; it cannot confirm spinal rounding.',
  insufficient_hinge:
    'Keep your camera side-on and use a comfortable, repeatable hinge. Compare the hinge depth in your next set.',
  knee_over_toes:
    'Check your camera angle and review the flagged reps. A knee-position estimate alone does not establish incorrect technique.',
  excessive_back_arch:
    'Review your torso position in the side-on preview. This camera estimate cannot confirm spinal arching.',
  incomplete_extension:
    'Return to your calibrated starting position within your comfortable range. Watch whether the incomplete extension repeats.',
  incomplete_pull:
    'Use a comfortable, repeatable pulling movement and return to your starting position. Compare the pull range next time.',
  torso_rising:
    'Watch for torso movement during the pull and keep your side view consistent for the next set.',
  excessive_swing: 'Check for body swing in your next set and keep your full movement visible to the camera.',
};

export const cueLabel = (code: string) => cueNames[code] ?? code.replaceAll('_', ' ');
export const primaryJoint = (exercise: ExerciseId) =>
  exercise === 'squat' || exercise === 'lunge'
    ? 'knee'
    : exercise === 'deadlift' || exercise === 'glute_bridge'
      ? 'hip'
      : 'elbow';

export function measuredAngle(rep: RepEvent): number | undefined {
  const value = rep.metrics_json.min_angle;
  return Number.isFinite(value) && value >= 0 && value <= 180 ? value : undefined;
}
export function measuredTime(rep: RepEvent): number | undefined {
  const value = rep.metrics_json.duration_ms;
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export interface ReportCue {
  code: string;
  label: string;
  reps: number[];
  count: number;
}
export interface ReportGroup {
  label: string;
  reps: RepEvent[];
  angles: number[];
  medianSeconds?: number;
  change?: { first: number; last: number; delta: number; firstReps: number[]; lastReps: number[] };
}

function summarizeGroup(label: string, reps: RepEvent[]): ReportGroup {
  const angles = reps.map(measuredAngle).filter((value): value is number => value !== undefined);
  const times = reps.map(measuredTime).filter((value): value is number => value !== undefined);
  // Compare two non-overlapping groups of three only when every rep has an
  // angle. A missing sample must not silently change which reps are compared.
  const change =
    reps.length >= 6 && angles.length === reps.length
      ? {
          first: Math.round(mean(angles.slice(0, 3))),
          last: Math.round(mean(angles.slice(-3))),
          delta: Math.round(mean(angles.slice(-3)) - mean(angles.slice(0, 3))),
          firstReps: reps.slice(0, 3).map((rep) => rep.rep_number),
          lastReps: reps.slice(-3).map((rep) => rep.rep_number),
        }
      : undefined;
  return {
    label,
    reps,
    angles,
    medianSeconds: times.length ? Math.round(median(times) / 100) / 10 : undefined,
    change,
  };
}

export function buildSessionReport(session: WorkoutSession) {
  const reps = [...session.reps].sort((a, b) => a.rep_number - b.rep_number);
  const total =
    Number.isInteger(session.total_reps) && session.total_reps >= 0 ? session.total_reps : reps.length;
  const measured = reps.filter((rep) => measuredAngle(rep) !== undefined).length;
  const timed = reps.filter((rep) => measuredTime(rep) !== undefined).length;
  const cueMap = new Map<string, number[]>();
  for (const rep of reps) {
    for (const code of new Set(rep.faults_json.map((fault) => fault.code))) {
      cueMap.set(code, [...(cueMap.get(code) ?? []), rep.rep_number]);
    }
  }
  const cues: ReportCue[] = [...cueMap]
    .map(([code, repNumbers]) => ({
      code,
      label: cueLabel(code),
      reps: repNumbers,
      count: repNumbers.length,
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  const cuedReps = reps.filter((rep) => rep.faults_json.length > 0).length;
  const completeDetails = reps.length === total;
  const arms =
    session.exercise === 'curl'
      ? {
          left: reps.filter((rep) => rep.metrics_json.arm_side === 0).length,
          right: reps.filter((rep) => rep.metrics_json.arm_side === 1).length,
          both: reps.filter((rep) => rep.metrics_json.arm_side === 2).length,
          unknown: reps.filter((rep) => ![0, 1, 2].includes(rep.metrics_json.arm_side)).length,
        }
      : undefined;

  // Only use recorded set boundaries; do not invent sets or silently assign
  // ungrouped reps. Overlapping/invalid ranges cannot support set comparisons.
  const ranges = session.set_ranges ?? [];
  const assigned = new Set<number>();
  const setNumbers = new Set<number>();
  const sets: { label: string; reps: RepEvent[]; restSeconds?: number }[] = [];
  let validSets = ranges.length > 0;
  for (const range of ranges) {
    const members = reps.filter(
      (rep) => rep.rep_number >= range.start_rep && rep.rep_number <= range.end_rep,
    );
    if (
      ![range.start_rep, range.end_rep, range.set_number].every(
        (value) => Number.isInteger(value) && value > 0,
      ) ||
      range.start_rep > range.end_rep ||
      !members.length ||
      members.length !== range.end_rep - range.start_rep + 1 ||
      members.some((rep) => assigned.has(rep.rep_number)) ||
      setNumbers.has(range.set_number)
    ) {
      validSets = false;
      break;
    }
    members.forEach((rep) => assigned.add(rep.rep_number));
    setNumbers.add(range.set_number);
    sets.push({ label: `Set ${range.set_number}`, reps: members, restSeconds: range.rest_seconds });
  }
  const hasCompleteSets = validSets && assigned.size === reps.length && completeDetails;
  const groups: ReportGroup[] = [];
  // Session-wide angle trends can mix separate sets. Require known boundaries.
  if (validSets)
    for (const set of sets) {
      if (arms) {
        for (const [side, label] of [
          [0, 'Left arm'],
          [1, 'Right arm'],
          [2, 'Both arms (average)'],
        ] as const) {
          const members = set.reps.filter((rep) => rep.metrics_json.arm_side === side);
          if (members.length) groups.push(summarizeGroup(`${set.label} · ${label}`, members));
        }
      } else groups.push(summarizeGroup(set.label, set.reps));
    }
  const strongestCue = cues[0];
  let focus: { title: string; action: string; evidence: string };
  if (!total || !reps.length) {
    focus = {
      title: 'Get a recorded baseline',
      action:
        'Check your position in the camera preview, wait for calibration, then complete a movement and return to the start.',
      evidence: total
        ? `${total} reps are listed in the session total, but their individual details are unavailable.`
        : 'No completed reps were recorded. There is no movement evidence to assess.',
    };
  } else if (strongestCue) {
    focus = {
      title: strongestCue.label,
      action:
        nextActions[strongestCue.code] ??
        'Review the flagged reps below and check your camera setup before the next session.',
      evidence: `${strongestCue.count} of ${reps.length} detailed reps triggered this cue: reps ${strongestCue.reps.join(', ')}.${cues.filter((cue) => cue.count === strongestCue.count).length > 1 ? ' Other cues occurred equally often; this is one focus to review.' : ''}`,
    };
  } else if (measured !== reps.length || !completeDetails) {
    focus = {
      title: 'Capture more complete measurements',
      action: 'Keep the required joints in view throughout your next set. Check calibration before moving.',
      evidence: `${reps.length} individual rep details are available for a session total of ${total}. Of those details, ${measured} include a valid joint-angle measurement.`,
    };
  } else {
    focus = {
      title: 'Use this session as your baseline',
      action:
        'Repeat the exercise with the same camera position. Compare recorded cues and rep measurements before deciding what to change.',
      evidence: `No supported technique cues were recorded on ${reps.length} detailed reps. All ${measured} include a joint-angle measurement. This does not establish perfect form or readiness to increase difficulty.`,
    };
  }
  return {
    total,
    reps,
    measured,
    timed,
    cues,
    cuedReps,
    completeDetails,
    arms,
    sets: validSets ? sets : [],
    hasCompleteSets,
    groups,
    focus,
  };
}
