import { exercises } from '../exercises/ExerciseRegistry';
import type { GoalId } from '../goals/goals';
import type { ExerciseId, FormFault, Insight, RepEvent, WorkoutSession } from '../../types/workout';

export interface InsightEvidenceItem {
  text: string;
  why: string;
}

export interface FaultFrequency {
  code: string;
  label: string;
  message: string;
  count: number;
  percent: number;
  reps: number[];
  timing: 'early' | 'middle' | 'late' | 'throughout';
}

export interface DepthDecayStats {
  metric: 'min_angle';
  firstAverage: number;
  lastAverage: number;
  change: number;
  firstReps: number[];
  lastReps: number[];
}

export interface SetBreakdown {
  setNumber: number;
  reps: number[];
  cleanReps: number;
  averageMinAngle?: number;
  averageDurationMs?: number;
  faults: FaultFrequency[];
}

export interface InsightStats {
  totalReps: number;
  measuredReps: number;
  cleanReps: number;
  longestCleanStreak: number;
  bestRep?: number;
  bestRepMinAngle?: number;
  minAngleStdDev?: number;
  durationSpreadMs?: number;
  averageDurationMs?: number;
  faultFrequencies: FaultFrequency[];
  depthDecay?: DepthDecayStats;
  setBreakdown: SetBreakdown[];
}

export interface GroundedInsight extends Insight {
  source: 'statistics';
  goalId: GoalId | null;
  evidence: {
    strengths: InsightEvidenceItem[];
    improvements: InsightEvidenceItem[];
    next_focus: InsightEvidenceItem;
  };
  stats: InsightStats;
}

const timingLabels: Record<FaultFrequency['timing'], string> = {
  early: 'early',
  middle: 'mid-session',
  late: 'late',
  throughout: 'throughout',
};

const faultDrills: Record<ExerciseId, Record<string, string>> = {
  squat: {
    insufficient_depth: 'Use a slow 3-second descent to a repeatable depth target within your comfortable range.',
    excessive_forward_lean: 'Practice two light pause reps while keeping your chest more upright through the bottom.',
  },
  curl: {
    limited_range: 'Use a full comfortable curl path and pause briefly near the bottom before the next rep.',
    upper_arm_movement: 'Pin your upper arms close to your sides and slow the lifting phase for two sets.',
  },
  pushup: {
    limited_range: 'Use a controlled lower-and-return tempo through a consistent comfortable range.',
    hip_alignment: 'Start each rep from a straight plank line and reset if your hips drift.',
  },
};

const round = (value: number, places = 0) => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

const formatFaultCode = (code: string) => code.replaceAll('_', ' ');

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;

const standardDeviation = (values: number[]) => {
  const mean = average(values);
  if (mean === undefined || values.length < 2) return undefined;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
};

const repMinAngle = (rep: RepEvent) => finiteMetric(rep, 'min_angle');
const repDuration = (rep: RepEvent) => finiteMetric(rep, 'duration_ms');

function finiteMetric(rep: RepEvent, key: string) {
  const value = rep.metrics_json[key];
  return Number.isFinite(value) ? value : undefined;
}

function setNumber(rep: RepEvent) {
  const raw =
    finiteMetric(rep, 'set_number') ?? finiteMetric(rep, 'set') ?? finiteMetric(rep, 'set_index');
  return raw === undefined ? 1 : Math.max(1, Math.round(raw));
}

function cleanStreak(reps: RepEvent[]) {
  let longest = 0;
  let current = 0;
  for (const rep of reps) {
    if (rep.faults_json.length === 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else current = 0;
  }
  return longest;
}

function faultTiming(repNumbers: number[], totalReps: number): FaultFrequency['timing'] {
  const thirds = new Set(
    repNumbers.map((rep) => {
      const ratio = rep / Math.max(totalReps, 1);
      if (ratio <= 1 / 3) return 'early';
      if (ratio > 2 / 3) return 'late';
      return 'middle';
    }),
  );
  if (thirds.size > 1) return 'throughout';
  return [...thirds][0] ?? 'throughout';
}

function summarizeFaults(reps: RepEvent[]): FaultFrequency[] {
  const faults = new Map<string, { message: string; reps: number[] }>();
  for (const rep of reps) {
    const seenInRep = new Set<string>();
    for (const fault of rep.faults_json) {
      if (seenInRep.has(fault.code)) continue;
      seenInRep.add(fault.code);
      const existing = faults.get(fault.code) ?? { message: fault.message, reps: [] };
      existing.message = existing.message || fault.message;
      existing.reps.push(rep.rep_number);
      faults.set(fault.code, existing);
    }
  }
  return [...faults.entries()]
    .map(([code, value]) => ({
      code,
      label: formatFaultCode(code),
      message: value.message,
      count: value.reps.length,
      percent: reps.length ? round((value.reps.length / reps.length) * 100) : 0,
      reps: value.reps,
      timing: faultTiming(value.reps, reps.length),
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

function depthDecay(reps: RepEvent[]): DepthDecayStats | undefined {
  const measured = reps
    .map((rep) => ({ rep: rep.rep_number, value: repMinAngle(rep) }))
    .filter((row): row is { rep: number; value: number } => row.value !== undefined);
  if (measured.length < 3) return undefined;
  const groupSize = Math.max(1, Math.floor(measured.length / 3));
  const first = measured.slice(0, groupSize);
  const last = measured.slice(-groupSize);
  const firstAverage = average(first.map((row) => row.value));
  const lastAverage = average(last.map((row) => row.value));
  if (firstAverage === undefined || lastAverage === undefined) return undefined;
  return {
    metric: 'min_angle',
    firstAverage: round(firstAverage),
    lastAverage: round(lastAverage),
    change: round(lastAverage - firstAverage),
    firstReps: first.map((row) => row.rep),
    lastReps: last.map((row) => row.rep),
  };
}

function bestCleanRep(reps: RepEvent[]) {
  const clean = reps
    .map((rep) => ({ rep: rep.rep_number, value: repMinAngle(rep), clean: rep.faults_json.length === 0 }))
    .filter((row): row is { rep: number; value: number; clean: boolean } => row.value !== undefined && row.clean)
    .sort((a, b) => a.value - b.value);
  return clean[0];
}

function durationStats(reps: RepEvent[]) {
  const durations = reps.map(repDuration).filter((value): value is number => value !== undefined);
  if (!durations.length) return { spread: undefined, averageMs: undefined };
  return {
    spread: Math.max(...durations) - Math.min(...durations),
    averageMs: average(durations),
  };
}

function buildSetBreakdown(reps: RepEvent[]): SetBreakdown[] {
  const groups = new Map<number, RepEvent[]>();
  for (const rep of reps) {
    const key = setNumber(rep);
    groups.set(key, [...(groups.get(key) ?? []), rep]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([set, setReps]) => {
      const minAngles = setReps.map(repMinAngle).filter((value): value is number => value !== undefined);
      const durations = setReps.map(repDuration).filter((value): value is number => value !== undefined);
      const averageMinAngle = average(minAngles);
      const averageDurationMs = average(durations);
      return {
        setNumber: set,
        reps: setReps.map((rep) => rep.rep_number),
        cleanReps: setReps.filter((rep) => rep.faults_json.length === 0).length,
        averageMinAngle: averageMinAngle === undefined ? undefined : round(averageMinAngle),
        averageDurationMs: averageDurationMs === undefined ? undefined : round(averageDurationMs),
        faults: summarizeFaults(setReps),
      };
    });
}

function buildStats(session: WorkoutSession): InsightStats {
  const reps = [...session.reps].sort((a, b) => a.rep_number - b.rep_number);
  const minAngles = reps.map(repMinAngle).filter((value): value is number => value !== undefined);
  const duration = durationStats(reps);
  const best = bestCleanRep(reps);
  const minAngleStdDev = standardDeviation(minAngles);
  return {
    totalReps: session.total_reps || reps.length,
    measuredReps: minAngles.length,
    cleanReps: reps.filter((rep) => rep.faults_json.length === 0).length,
    longestCleanStreak: cleanStreak(reps),
    bestRep: best?.rep,
    bestRepMinAngle: best?.value,
    minAngleStdDev: minAngleStdDev === undefined ? undefined : round(minAngleStdDev, 1),
    durationSpreadMs: duration.spread === undefined ? undefined : Math.round(duration.spread),
    averageDurationMs: duration.averageMs === undefined ? undefined : Math.round(duration.averageMs),
    faultFrequencies: summarizeFaults(reps),
    depthDecay: depthDecay(reps),
    setBreakdown: buildSetBreakdown(reps),
  };
}

function evidenceText(text: string, why: string): InsightEvidenceItem {
  return { text, why };
}

// Exercises whose primary movement recruits multiple large muscle groups.
const COMPOUND_EXERCISES: Partial<Record<ExerciseId, boolean>> = {
  squat: true,
  pushup: true,
};

function isCleanAndConsistent(stats: InsightStats) {
  return (
    stats.totalReps > 0 &&
    stats.cleanReps === stats.totalReps &&
    (stats.minAngleStdDev ?? 99) <= 6
  );
}

function pauseFocus(decay: DepthDecayStats): InsightEvidenceItem {
  return evidenceText(
    `Hold a controlled pause at your deepest comfortable point for 2 sets; your late reps showed less range than early reps.`,
    `Depth/range faded ${decay.change}° (${decay.firstAverage}° first-third average → ${decay.lastAverage}° last-third average).`,
  );
}

function progressionFocus(stats: InsightStats): InsightEvidenceItem {
  return evidenceText(
    `Progress gently next time: add 1 rep or use a slower eccentric while keeping the same clean, consistent range.`,
    `${stats.cleanReps}/${stats.totalReps} reps had no supported cues and min_angle standard deviation was ${stats.minAngleStdDev ?? 0}°.`,
  );
}

function consistencyFocus(stats: InsightStats): InsightEvidenceItem {
  return evidenceText(
    `Your longest clean streak was ${stats.longestCleanStreak} of ${stats.totalReps} recorded reps. Book your next session soon — showing up again is the whole game.`,
    `Longest clean streak: ${stats.longestCleanStreak} reps; total recorded reps: ${stats.totalReps}.`,
  );
}

function weightLossFocus(session: WorkoutSession, stats: InsightStats): InsightEvidenceItem {
  const exerciseName = exercises[session.exercise].name.toLowerCase();
  const compound = COMPOUND_EXERCISES[session.exercise] ?? false;
  return evidenceText(
    `You logged ${stats.totalReps} ${exerciseName} reps. For weight loss, repeat sessions built on full-body compound movements regularly through the week — training frequency matters more than any single workout.`,
    `${stats.totalReps} measured reps this session; ${exerciseName} is a compound movement: ${compound ? 'yes' : 'no'}.`,
  );
}

interface FocusParts {
  topFault?: FaultFrequency;
  decay?: DepthDecayStats;
  dedupedImprovements: InsightEvidenceItem[];
  exercise: { name: string; setup: string };
}

/**
 * The goal reorders which grounded finding becomes the next-session focus.
 * 'form' (and no goal) keeps the original fault-first behavior exactly.
 */
function selectNextFocus(
  session: WorkoutSession,
  stats: InsightStats,
  goalId: GoalId | null | undefined,
  parts: FocusParts,
): InsightEvidenceItem {
  const { topFault, decay, dedupedImprovements, exercise } = parts;
  if (goalId === 'strength') {
    if (isCleanAndConsistent(stats)) return progressionFocus(stats);
    if (topFault) return faultImprovement(session.exercise, topFault, stats.totalReps);
    if (decay && decay.change >= 5) return pauseFocus(decay);
  } else if (goalId === 'consistency') {
    if (stats.totalReps > 0) return consistencyFocus(stats);
  } else if (goalId === 'weight_loss') {
    if (stats.totalReps > 0) return weightLossFocus(session, stats);
  } else {
    if (topFault) return faultImprovement(session.exercise, topFault, stats.totalReps);
    if (decay && decay.change >= 5) return pauseFocus(decay);
    if (isCleanAndConsistent(stats)) return progressionFocus(stats);
  }
  if (dedupedImprovements[0]) return dedupedImprovements[0];
  return evidenceText(
    `Set up a clear ${exercise.setup.toLowerCase()} Then move at a steady, comfortable pace.`,
    'No specific fault, depth-decay, or consistency measurement was available for a narrower focus.',
  );
}

function faultImprovement(exerciseId: ExerciseId, fault: FaultFrequency, totalReps: number) {
  // Optional chaining: exercises without drill entries fall back to the measured cue message.
  const drill = faultDrills[exerciseId]?.[fault.code] ?? fault.message;
  return evidenceText(
    `${drill} This was the most frequent cue: ${fault.label} on ${fault.count} of ${totalReps} reps (${fault.percent}%), appearing ${timingLabels[fault.timing]}.`,
    `${fault.label}: reps ${fault.reps.join(', ')}; ${fault.count}/${totalReps} reps (${fault.percent}%).`,
  );
}

function buildEvidence(session: WorkoutSession, stats: InsightStats, goalId?: GoalId | null) {
  const exercise = exercises[session.exercise];
  const strengths: InsightEvidenceItem[] = [];
  const improvements: InsightEvidenceItem[] = [];
  const topFault = stats.faultFrequencies[0];

  if (stats.totalReps === 0) {
    strengths.push(
      evidenceText(
        `You opened a ${exercise.name.toLowerCase()} session and reached the report view.`,
        '0 completed reps were recorded, so movement measurements are unavailable.',
      ),
    );
    improvements.push(
      evidenceText(
        `Set up a clear view before starting the next ${exercise.name.toLowerCase()} session.`,
        'No rep-level angle, duration, or cue measurements were recorded in this session.',
      ),
    );
  } else {
    strengths.push(
      evidenceText(
        `${stats.cleanReps} of ${stats.totalReps} reps had no supported technique cue, with a longest clean streak of ${stats.longestCleanStreak}.`,
        `Clean reps: ${stats.cleanReps}/${stats.totalReps}; longest clean streak: ${stats.longestCleanStreak} reps.`,
      ),
    );
    if (stats.bestRep && stats.bestRepMinAngle !== undefined) {
      strengths.push(
        evidenceText(
          `Rep ${stats.bestRep} was your deepest clean rep at ${stats.bestRepMinAngle}° minimum joint angle.`,
          `Deepest clean rep measured: rep ${stats.bestRep}, min_angle ${stats.bestRepMinAngle}°; lower angles indicate deeper range in the captured movement.`,
        ),
      );
    }
    if (stats.minAngleStdDev !== undefined && stats.minAngleStdDev <= 6 && stats.measuredReps >= 3) {
      strengths.push(
        evidenceText(
          `Your depth stayed consistent across measured reps (standard deviation ${stats.minAngleStdDev}°).`,
          `min_angle standard deviation across ${stats.measuredReps} measured reps: ${stats.minAngleStdDev}°.`,
        ),
      );
    }
  }

  if (topFault) improvements.push(faultImprovement(session.exercise, topFault, stats.totalReps));

  if (stats.depthDecay && stats.depthDecay.change >= 5) {
    improvements.push(
      evidenceText(
        `Depth/range faded ${stats.depthDecay.change}° across the session (${stats.depthDecay.firstAverage}° → ${stats.depthDecay.lastAverage}° average minimum joint angle). Add a 3-second pause at the bottom for 2 sets next session.`,
        `First-third reps ${stats.depthDecay.firstReps.join(', ')} averaged ${stats.depthDecay.firstAverage}°; last-third reps ${stats.depthDecay.lastReps.join(', ')} averaged ${stats.depthDecay.lastAverage}°; change +${stats.depthDecay.change}° (higher minimum angle means less range).`,
      ),
    );
  } else if (stats.depthDecay && stats.depthDecay.change <= -5) {
    strengths.push(
      evidenceText(
        `Your measured range improved by ${Math.abs(stats.depthDecay.change)}° from early to late reps (${stats.depthDecay.firstAverage}° → ${stats.depthDecay.lastAverage}°).`,
        `First-third average min_angle ${stats.depthDecay.firstAverage}°; last-third average min_angle ${stats.depthDecay.lastAverage}°; change ${stats.depthDecay.change}°.`,
      ),
    );
  }

  if (stats.minAngleStdDev !== undefined && stats.minAngleStdDev > 10) {
    improvements.push(
      evidenceText(
        `Make each rep more repeatable: your minimum joint angle varied by ${stats.minAngleStdDev}° standard deviation.`,
        `min_angle standard deviation across ${stats.measuredReps} measured reps: ${stats.minAngleStdDev}°.`,
      ),
    );
  }

  if (stats.durationSpreadMs !== undefined && stats.durationSpreadMs >= 1500) {
    improvements.push(
      evidenceText(
        `Use a steadier tempo: rep duration spread was ${(stats.durationSpreadMs / 1000).toFixed(1)}s from fastest to slowest.`,
        `duration_ms spread: ${stats.durationSpreadMs}ms across reps with duration measurements.`,
      ),
    );
  }

  if (!stats.measuredReps && stats.totalReps > 0) {
    improvements.push(
      evidenceText(
        'Keep your tracked joints clearly visible so the report can compare range and tempo next time.',
        `${stats.totalReps} reps were counted, but 0 reps included min_angle measurements.`,
      ),
    );
  }

  const dedupedImprovements = improvements
    .filter((item, index, rows) => rows.findIndex((row) => row.text === item.text) === index)
    .slice(0, 4);

  const nextFocus = selectNextFocus(session, stats, goalId, {
    topFault,
    decay: stats.depthDecay,
    dedupedImprovements,
    exercise,
  });

  return {
    strengths: strengths.slice(0, 5),
    improvements: dedupedImprovements.length ? dedupedImprovements : [nextFocus],
    next_focus: nextFocus,
  };
}

function recap(session: WorkoutSession, stats: InsightStats) {
  const exercise = exercises[session.exercise].name.toLowerCase();
  const simulated = session.source === 'demo' ? 'Simulated demo movement: ' : '';
  if (stats.totalReps === 0)
    return `${simulated}No completed ${exercise} reps were recorded, so rep-level range, tempo, and cue measurements are unavailable.`;

  const faultCount = stats.faultFrequencies.reduce((sum, fault) => sum + fault.count, 0);
  const angleText = stats.measuredReps
    ? `${stats.measuredReps} reps included minimum joint angle measurements`
    : 'minimum joint angle was unavailable';
  const topFault = stats.faultFrequencies[0];
  const cueText = topFault
    ? `The most common cue was ${topFault.label} on ${topFault.count} reps (${topFault.percent}%).`
    : 'No supported technique cues were detected; that is not proof of perfect form.';
  return `${simulated}${stats.totalReps} ${exercise} reps recorded; ${stats.cleanReps} were clean by supported cues and ${faultCount} cue events were observed. ${angleText}. ${cueText}`;
}

export function generateStatisticsInsight(
  session: WorkoutSession,
  goalId?: GoalId | null,
): GroundedInsight {
  const stats = buildStats(session);
  const evidence = buildEvidence(session, stats, goalId);
  return {
    recap: recap(session, stats),
    strengths: evidence.strengths.map((item) => item.text),
    improvements: evidence.improvements.map((item) => item.text),
    next_focus: evidence.next_focus.text,
    source: 'statistics',
    goalId: goalId ?? null,
    evidence,
    stats,
  };
}

export function faultsForTimeline(stats: InsightStats) {
  return stats.faultFrequencies.flatMap((fault) =>
    fault.reps.map((rep) => ({ rep, code: fault.code, label: fault.label, message: fault.message })),
  );
}

export function repFaultLabels(rep: RepEvent, knownFaults: FormFault[] = rep.faults_json) {
  return knownFaults.map((fault) => formatFaultCode(fault.code));
}
