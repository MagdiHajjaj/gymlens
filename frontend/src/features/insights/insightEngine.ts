import { exercises } from '../exercises/ExerciseRegistry';
import { cueLabel } from './sessionReport';
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
  deadlift: {
    excessive_back_rounding:
      'Hinge with a long spine and practice the hip-hinge pattern at light load, keeping your back flat through each rep.',
    insufficient_hinge:
      'Push your hips back further on each rep until you feel a comfortable hamstring stretch before standing.',
  },
  lunge: {
    knee_over_toes:
      'Take a slightly longer stance and lower straight down, keeping your front knee tracking over your ankle.',
    insufficient_depth:
      'Lower until both knees approach comfortable right angles while keeping your torso tall.',
  },
  press: {
    excessive_back_arch:
      'Brace your core and squeeze your glutes to keep your ribs down while pressing overhead.',
    limited_range:
      'Press through a full comfortable overhead path and control the lowering phase of each rep.',
  },
  glute_bridge: {
    incomplete_extension:
      'Drive your hips all the way up until your body forms a straight line from shoulders to knees, squeezing your glutes at the top.',
    excessive_back_arch:
      'Keep your upper back planted and ribs down; lift with your glutes, not by arching your lower back.',
  },
  row: {
    incomplete_pull:
      'Drive your elbow back until the weight reaches your torso, squeezing your shoulder blade at the top of each rep.',
    torso_rising:
      'Stay hinged at the hips with a flat back; choose a load you can lift without standing up to cheat the rep.',
  },
  dips: {
    insufficient_depth:
      'Lower until your upper arms approach parallel with the floor, keeping the motion controlled.',
    excessive_forward_lean:
      'Stay upright through the torso and keep your hips close to the bench to load the triceps.',
  },
  pullup: {
    incomplete_pull:
      'Pull until your chin clears the bar from a full dead hang, controlling the lowering phase.',
    excessive_swing:
      'Keep your body still and avoid kipping; engage your core and pull strictly with your back and arms.',
  },
};

const round = (value: number, places = 0) => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};



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

function setNumberRaw(rep: RepEvent) {
  return (
    finiteMetric(rep, 'set_number') ?? finiteMetric(rep, 'set') ?? finiteMetric(rep, 'set_index')
  );
}

function setNumber(rep: RepEvent) {
  const raw = setNumberRaw(rep);
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
      label: cueLabel(code),
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

/**
 * Whether the depth/ROM comparison carries a real signal. A 0° change is a
 * filler chart — the report suppresses the comparison strip and says so.
 */
export function hasDepthDecaySignal(decay: DepthDecayStats | undefined): decay is DepthDecayStats {
  return decay !== undefined && decay.change !== 0;
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
  // Don't fabricate a single-set breakdown when the session carries no set metadata.
  if (!reps.some((rep) => setNumberRaw(rep) !== undefined)) return [];
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
    `Your depth faded ${decay.change}°: early reps averaged ${decay.firstAverage}° at your deepest point, late reps only ${decay.lastAverage}°.`,
  );
}

function progressionFocus(stats: InsightStats): InsightEvidenceItem {
  return evidenceText(
    `Progress gently next time: add 1 rep or use a slower eccentric while keeping the same clean, consistent range.`,
    `${stats.cleanReps} of ${stats.totalReps} reps were clean with no technique cues, and your depth varied by only ${stats.minAngleStdDev ?? 0}°.`,
  );
}

function consistencyFocus(stats: InsightStats): InsightEvidenceItem {
  return evidenceText(
    `Your longest clean streak was ${stats.longestCleanStreak} of ${stats.totalReps} recorded reps. Book your next session soon — showing up again is the whole game.`,
    `You strung together ${stats.longestCleanStreak} clean rep${stats.longestCleanStreak === 1 ? '' : 's'} in a row out of ${stats.totalReps} recorded reps.`,
  );
}

function weightLossFocus(session: WorkoutSession, stats: InsightStats): InsightEvidenceItem {
  const exerciseName = exercises[session.exercise].name.toLowerCase();
  const compound = COMPOUND_EXERCISES[session.exercise] ?? false;
  return evidenceText(
    `You logged ${stats.totalReps} ${exerciseName} reps. For weight loss, repeat sessions built on full-body compound movements regularly through the week — training frequency matters more than any single workout.`,
    `${stats.totalReps} measured reps this session; ${exerciseName} ${compound ? 'is a full-body compound movement' : 'is not a full-body compound movement'}.`,
  );
}

function tempoFocus(stats: InsightStats): InsightEvidenceItem {
  return evidenceText(
    `Use a steadier tempo: rep duration spread was ${((stats.durationSpreadMs ?? 0) / 1000).toFixed(1)}s from fastest to slowest.`,
    `Your rep pace varied by ${((stats.durationSpreadMs ?? 0) / 1000).toFixed(1)}s between your fastest and slowest rep.`,
  );
}

function repeatabilityFocus(stats: InsightStats): InsightEvidenceItem {
  return evidenceText(
    `Make each rep more repeatable: your minimum joint angle varied by ${stats.minAngleStdDev}° standard deviation.`,
    `Your depth varied by ${stats.minAngleStdDev}° across ${stats.measuredReps} measured reps.`,
  );
}

interface FocusParts {
  topFault?: FaultFrequency;
  decay?: DepthDecayStats;
  faultFrequencies: FaultFrequency[];
  dedupedImprovements: InsightEvidenceItem[];
  exercise: { name: string; setup: string };
}

/**
 * The goal reorders which grounded finding becomes the next-session focus.
 * 'form' (and no goal) keeps the original fault-first behavior exactly.
 *
 * The focus must differ from every "room to grow" item: candidates are tried
 * in goal-priority order and the first one not already listed as an
 * improvement wins. When every candidate is already listed, the primary
 * candidate is reused rather than inventing a weaker fallback.
 */
function selectNextFocus(
  session: WorkoutSession,
  stats: InsightStats,
  goalId: GoalId | null | undefined,
  parts: FocusParts,
): InsightEvidenceItem {
  const { topFault, decay, faultFrequencies, dedupedImprovements, exercise } = parts;
  const candidates: InsightEvidenceItem[] = [];
  if (goalId === 'strength') {
    if (isCleanAndConsistent(stats)) candidates.push(progressionFocus(stats));
    if (topFault) candidates.push(faultImprovement(session.exercise, topFault, stats.totalReps));
    if (decay && decay.change >= 5) candidates.push(pauseFocus(decay));
  } else if (goalId === 'consistency') {
    if (stats.totalReps > 0) candidates.push(consistencyFocus(stats));
  } else if (goalId === 'weight_loss') {
    if (stats.totalReps > 0) candidates.push(weightLossFocus(session, stats));
  } else {
    if (topFault) candidates.push(faultImprovement(session.exercise, topFault, stats.totalReps));
    if (decay && decay.change >= 5) candidates.push(pauseFocus(decay));
    if (isCleanAndConsistent(stats)) candidates.push(progressionFocus(stats));
  }
  // Secondary grounded findings for when the primary pick duplicates a room-to-grow item.
  const secondFault = faultFrequencies[1];
  if (secondFault) candidates.push(faultImprovement(session.exercise, secondFault, stats.totalReps));
  if (stats.durationSpreadMs !== undefined && stats.durationSpreadMs >= 1500)
    candidates.push(tempoFocus(stats));
  if (stats.minAngleStdDev !== undefined && stats.minAngleStdDev > 10)
    candidates.push(repeatabilityFocus(stats));

  const used = new Set(dedupedImprovements.map((item) => item.text));
  const distinct = candidates.find((candidate) => !used.has(candidate.text));
  if (distinct) return distinct;
  if (candidates[0]) return candidates[0];
  if (dedupedImprovements[0]) return dedupedImprovements[0];
  return evidenceText(
    `Set up a clear ${exercise.setup.toLowerCase()} Then move at a steady, comfortable pace.`,
    'We did not record enough measurements this session for a more specific focus.',
  );
}

function faultImprovement(exerciseId: ExerciseId, fault: FaultFrequency, totalReps: number) {
  // Optional chaining: exercises without drill entries fall back to the measured cue message.
  const drill = faultDrills[exerciseId]?.[fault.code] ?? fault.message;
  return evidenceText(
    `${drill} This was the most frequent cue: ${fault.label} on ${fault.count} of ${totalReps} reps (${fault.percent}%), appearing ${timingLabels[fault.timing]}.`,
    `Most frequent technique cue: ${fault.label.toLowerCase()} on reps ${fault.reps.join(', ')} — ${fault.count} of ${totalReps} reps (${fault.percent}%).`,
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
        `Clean reps: ${stats.cleanReps}/${stats.totalReps}; longest clean streak: ${stats.longestCleanStreak} rep${stats.longestCleanStreak === 1 ? '' : 's'}.`,
      ),
    );
    if (stats.bestRep && stats.bestRepMinAngle !== undefined) {
      strengths.push(
        evidenceText(
          `Rep ${stats.bestRep} was your deepest clean rep at ${stats.bestRepMinAngle}° minimum joint angle.`,
          `Rep ${stats.bestRep} hit ${stats.bestRepMinAngle}° at your deepest point — the smallest angle we measured, meaning your deepest range.`,
        ),
      );
    }
    if (stats.minAngleStdDev !== undefined && stats.minAngleStdDev <= 6 && stats.measuredReps >= 3) {
      strengths.push(
        evidenceText(
          `Your depth stayed consistent across measured reps (standard deviation ${stats.minAngleStdDev}°).`,
          `Your depth varied by just ${stats.minAngleStdDev}° across ${stats.measuredReps} measured reps.`,
        ),
      );
    }
  }

  if (topFault) improvements.push(faultImprovement(session.exercise, topFault, stats.totalReps));

  if (stats.depthDecay && stats.depthDecay.change >= 5) {
    improvements.push(
      evidenceText(
        `Depth/range faded ${stats.depthDecay.change}° across the session (${stats.depthDecay.firstAverage}° → ${stats.depthDecay.lastAverage}° average minimum joint angle). Add a 3-second pause at the bottom for 2 sets next session.`,
        `Early reps (reps ${stats.depthDecay.firstReps.join(', ')}) averaged ${stats.depthDecay.firstAverage}° at your deepest point; late reps (reps ${stats.depthDecay.lastReps.join(', ')}) averaged ${stats.depthDecay.lastAverage}° — your range got ${stats.depthDecay.change}° shallower.`,
      ),
    );
  } else if (stats.depthDecay && stats.depthDecay.change <= -5) {
    strengths.push(
      evidenceText(
        `Your measured range improved by ${Math.abs(stats.depthDecay.change)}° from early to late reps (${stats.depthDecay.firstAverage}° → ${stats.depthDecay.lastAverage}°).`,
        `Early reps averaged ${stats.depthDecay.firstAverage}° at your deepest point, late reps averaged ${stats.depthDecay.lastAverage}° — your range got ${Math.abs(stats.depthDecay.change)}° deeper.`,
      ),
    );
  }

  if (stats.minAngleStdDev !== undefined && stats.minAngleStdDev > 10) {
    improvements.push(repeatabilityFocus(stats));
  }

  if (stats.durationSpreadMs !== undefined && stats.durationSpreadMs >= 1500) {
    improvements.push(tempoFocus(stats));
  }

  if (!stats.measuredReps && stats.totalReps > 0) {
    improvements.push(
      evidenceText(
        'Keep your tracked joints clearly visible so the report can compare range and tempo next time.',
        `${stats.totalReps} reps were counted, but we could not measure joint angles on any of them.`,
      ),
    );
  }

  const dedupedImprovements = improvements
    .filter((item, index, rows) => rows.findIndex((row) => row.text === item.text) === index)
    .slice(0, 4);

  const nextFocus = selectNextFocus(session, stats, goalId, {
    topFault,
    decay: stats.depthDecay,
    faultFrequencies: stats.faultFrequencies,
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
  const demoPrefix = session.source === 'demo' ? 'Demo video: ' : '';
  if (stats.totalReps === 0)
    return `${demoPrefix}No completed ${exercise} reps were recorded, so rep-level range, tempo, and cue measurements are unavailable.`;

  const faultCount = stats.faultFrequencies.reduce((sum, fault) => sum + fault.count, 0);
  const angleText = stats.measuredReps
    ? `${stats.measuredReps} reps included minimum joint angle measurements`
    : 'minimum joint angle was unavailable';
  const topFault = stats.faultFrequencies[0];
  const cueText = topFault
    ? `The most common cue was ${topFault.label} on ${topFault.count} rep${topFault.count === 1 ? '' : 's'} (${topFault.percent}%).`
    : 'No supported technique cues were detected; that is not proof of perfect form.';
  return `${demoPrefix}${stats.totalReps} ${exercise} reps recorded; ${stats.cleanReps} were clean by supported cues and ${faultCount} cue events were observed. ${angleText}. ${cueText}`;
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
  return knownFaults.map((fault) => cueLabel(fault.code));
}
