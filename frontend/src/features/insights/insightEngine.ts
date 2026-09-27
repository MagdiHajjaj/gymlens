import { exercises } from '../exercises/ExerciseRegistry';
import { cueLabel } from './sessionReport';
import { formatRepList } from './repList';
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
  /** Plain-language description of where in the session the cue appeared. */
  timing: string;
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

const faultDrills: Record<ExerciseId, Record<string, string>> = {
  squat: {
    insufficient_depth: 'Use a slow 3-second descent to a repeatable depth target within your comfortable range.',
    excessive_forward_lean: 'Practice two light pause reps while keeping your chest more upright through the bottom.',
  },
  curl: {
    limited_range: 'Use a full comfortable curl path and pause briefly near the bottom before the next rep.',
    upper_arm_movement: 'Pin your upper arms close to your sides and slow the lifting phase.',
    excessive_torso_swing: 'Pick a weight you can curl without rocking your torso, and keep your hips still through each rep.',
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

/**
 * Where in the session a cue appeared, described honestly. "Throughout" is
 * reserved for cues that genuinely span all three parts of the session;
 * anything narrower names the span it actually covered.
 */
function faultTiming(repNumbers: number[], totalReps: number): string {
  const thirdOf = (rep: number): 'early' | 'middle' | 'late' => {
    const ratio = rep / Math.max(totalReps, 1);
    if (ratio <= 1 / 3) return 'early';
    if (ratio > 2 / 3) return 'late';
    return 'middle';
  };
  const thirds = [...new Set(repNumbers.map(thirdOf))];
  if (thirds.length === 1) {
    if (thirds[0] === 'early') return 'early in the session';
    if (thirds[0] === 'late') return 'late in the session';
    return 'in the middle of the session';
  }
  const ordered = thirds.sort(
    (a, b) => ['early', 'middle', 'late'].indexOf(a) - ['early', 'middle', 'late'].indexOf(b),
  );
  const key = ordered.join(',');
  if (key === 'early,middle,late') return 'throughout the session';
  if (key === 'early,middle') return 'in the first two-thirds of the session';
  if (key === 'middle,late') return 'in the last two-thirds of the session';
  return 'early and late in the session';
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
  const measured = reps
    .map((rep) => ({ rep: rep.rep_number, ms: repDuration(rep) }))
    .filter((row): row is { rep: number; ms: number } => row.ms !== undefined);
  if (!measured.length) return { spread: undefined, averageMs: undefined };
  const durations = measured.map((row) => row.ms);
  const slowest = measured.reduce((a, b) => (b.ms > a.ms ? b : a));
  const fastest = measured.reduce((a, b) => (b.ms < a.ms ? b : a));
  return {
    spread: Math.max(...durations) - Math.min(...durations),
    averageMs: average(durations),
    slowest,
    fastest,
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

/**
 * A single grounded finding: an action to take, a one-sentence evidence note
 * for the improvements list, and raw data for the "Why" line. Findings are
 * built once and rendered in two places: an improvement reads
 * "<action> <note>", while the next-session focus always names the top
 * priority as "Make this your priority next session: <action>". Because the
 * focus framing is structurally different from any improvement text, the
 * focus can honestly repeat the top priority instead of being demoted to a
 * weaker finding just to avoid a duplicate sentence.
 */
interface Finding {
  action: string;
  note: string;
  why: string;
}

function findingItem(finding: Finding): InsightEvidenceItem {
  return evidenceText(`${finding.action} ${finding.note}`, finding.why);
}

function faultDrill(exerciseId: ExerciseId, fault: FaultFrequency): string {
  // Optional chaining: exercises without drill entries fall back to the measured cue message.
  return faultDrills[exerciseId]?.[fault.code] ?? fault.message;
}

function faultFinding(exerciseId: ExerciseId, fault: FaultFrequency, totalReps: number): Finding {
  return {
    action: faultDrill(exerciseId, fault),
    note: `This was the most frequent cue: ${fault.label} on ${fault.count} of ${totalReps} reps (${fault.percent}%), appearing ${fault.timing}.`,
    why: `${fault.label} on ${formatRepList(fault.reps)} — ${fault.count} of ${totalReps} reps (${fault.percent}%).`,
  };
}

function decayFinding(decay: DepthDecayStats): Finding {
  return {
    action: 'Pause briefly at the bottom of each rep next session.',
    note: `Your range faded ${decay.change}° across the session (${decay.firstAverage}° → ${decay.lastAverage}° average minimum joint angle).`,
    why: `Early reps (${formatRepList(decay.firstReps)}) averaged ${decay.firstAverage}° at your deepest point; late reps (${formatRepList(decay.lastReps)}) averaged ${decay.lastAverage}° — your range got ${decay.change}° shallower.`,
  };
}

function tempoFinding(
  stats: InsightStats,
  slowest?: { rep: number; ms: number },
  fastest?: { rep: number; ms: number },
): Finding | null {
  if (stats.durationSpreadMs === undefined || stats.durationSpreadMs < 1500) return null;
  const spread = (stats.durationSpreadMs / 1000).toFixed(1);
  const detail =
    slowest && fastest
      ? `Slowest was rep ${slowest.rep} (${(slowest.ms / 1000).toFixed(1)}s); fastest was rep ${fastest.rep} (${(fastest.ms / 1000).toFixed(1)}s).`
      : `Your rep pace varied by ${spread}s between your fastest and slowest rep.`;
  return {
    action: 'Use a steadier tempo next session.',
    note: `Rep duration spread was ${spread}s from fastest to slowest.`,
    why: detail,
  };
}

function repeatabilityFinding(
  stats: InsightStats,
  minAngle?: number,
  maxAngle?: number,
): Finding | null {
  if (stats.minAngleStdDev === undefined || stats.minAngleStdDev <= 10) return null;
  const detail =
    minAngle !== undefined && maxAngle !== undefined
      ? `Deepest points ranged from ${minAngle}° to ${maxAngle}° across ${stats.measuredReps} measured reps.`
      : `Your depth varied by ${stats.minAngleStdDev}° across ${stats.measuredReps} measured reps.`;
  return {
    action: 'Make every rep match your best rep shape.',
    note: `Your minimum joint angle varied by ${stats.minAngleStdDev}° (standard deviation).`,
    why: detail,
  };
}

interface FocusCandidate {
  action: string;
  why: string;
}

function progressionCandidate(stats: InsightStats): FocusCandidate | null {
  if (!isCleanAndConsistent(stats)) return null;
  return {
    action:
      'Progress gently next time: add 1 rep or use a slower eccentric while keeping the same clean, consistent range.',
    why: `${stats.cleanReps} of ${stats.totalReps} reps were clean with no technique cues, and your depth varied by only ${stats.minAngleStdDev ?? 0}°.`,
  };
}

function consistencyCandidate(stats: InsightStats, cleanRepNumbers: number[]): FocusCandidate | null {
  if (stats.totalReps === 0) return null;
  return {
    action: `Your longest clean streak was ${stats.longestCleanStreak} of ${stats.totalReps} recorded reps — extend it next session.`,
    why:
      cleanRepNumbers.length > 0
        ? `Clean on ${formatRepList(cleanRepNumbers)} — ${stats.cleanReps} of ${stats.totalReps} reps.`
        : `No clean reps this session out of ${stats.totalReps} recorded reps.`,
  };
}

function weightLossCandidate(session: WorkoutSession, stats: InsightStats): FocusCandidate | null {
  if (stats.totalReps === 0) return null;
  const exerciseName = exercises[session.exercise].name.toLowerCase();
  const compound = COMPOUND_EXERCISES[session.exercise] ?? false;
  return {
    action: `You logged ${stats.totalReps} ${exerciseName} reps. For weight loss, repeat sessions built on full-body compound movements regularly through the week — training frequency matters more than any single workout.`,
    why: `${stats.totalReps} measured reps this session; ${exerciseName} ${compound ? 'is a full-body compound movement' : 'is not a full-body compound movement'}.`,
  };
}

interface FocusParts {
  topFault?: FaultFrequency;
  decay?: DepthDecayStats;
  cleanRepNumbers: number[];
  slowestRep?: { rep: number; ms: number };
  fastestRep?: { rep: number; ms: number };
  minAngle?: number;
  maxAngle?: number;
  exercise: { name: string; setup: string };
}

/**
 * The next-session focus is always the single highest-priority grounded
 * finding — never a demoted runner-up. The goal reorders which finding wins:
 * 'form' (and no goal) keeps fault-first behavior. The focus text is framed
 * as the one priority ("Make this your priority next session: …"), which is
 * structurally different from the room-to-grow wording, so the top priority
 * stays the focus even when it also leads the improvements list.
 */
function selectNextFocus(
  session: WorkoutSession,
  stats: InsightStats,
  goalId: GoalId | null | undefined,
  parts: FocusParts,
): InsightEvidenceItem {
  const { topFault, decay, cleanRepNumbers, slowestRep, fastestRep, minAngle, maxAngle, exercise } =
    parts;
  const fault: FocusCandidate | null = topFault
    ? {
        action: faultDrill(session.exercise, topFault),
        why: `${topFault.label} was the most frequent cue: ${topFault.count} of ${stats.totalReps} reps (${topFault.percent}%), on ${formatRepList(topFault.reps)}.`,
      }
    : null;
  const decayed: FocusCandidate | null =
    decay && decay.change >= 5
      ? {
          action: 'Hold a controlled pause at your deepest comfortable point next session.',
          why: `Your depth faded ${decay.change}°: early reps averaged ${decay.firstAverage}° at your deepest point, late reps only ${decay.lastAverage}°.`,
        }
      : null;
  const tempo = tempoFinding(stats, slowestRep, fastestRep);
  const repeatable = repeatabilityFinding(stats, minAngle, maxAngle);

  const candidates: FocusCandidate[] = [];
  if (goalId === 'strength') {
    const progression = progressionCandidate(stats);
    if (progression) candidates.push(progression);
    if (fault) candidates.push(fault);
    if (decayed) candidates.push(decayed);
  } else if (goalId === 'consistency') {
    const consistency = consistencyCandidate(stats, cleanRepNumbers);
    if (consistency) candidates.push(consistency);
    if (fault) candidates.push(fault);
    if (decayed) candidates.push(decayed);
  } else if (goalId === 'weight_loss') {
    const weightLoss = weightLossCandidate(session, stats);
    if (weightLoss) candidates.push(weightLoss);
    if (fault) candidates.push(fault);
    if (decayed) candidates.push(decayed);
  } else {
    if (fault) candidates.push(fault);
    if (decayed) candidates.push(decayed);
    const progression = progressionCandidate(stats);
    if (progression) candidates.push(progression);
  }
  if (tempo) candidates.push(tempo);
  if (repeatable) candidates.push(repeatable);

  const winner = candidates[0];
  if (winner) {
    return evidenceText(`Make this your priority next session: ${winner.action}`, winner.why);
  }
  return evidenceText(
    `Set up a clear ${exercise.setup.toLowerCase()} Then move at a steady, comfortable pace.`,
    'We did not record enough measurements this session for a more specific focus.',
  );
}

function buildEvidence(session: WorkoutSession, stats: InsightStats, goalId?: GoalId | null) {
  const exercise = exercises[session.exercise];
  const strengths: InsightEvidenceItem[] = [];
  const improvements: InsightEvidenceItem[] = [];
  const topFault = stats.faultFrequencies[0];

  // Raw material for evidence lines: which reps were clean, the measured
  // angle range, and the fastest/slowest reps. Whys cite these instead of
  // paraphrasing the claim.
  const sortedReps = [...session.reps].sort((a, b) => a.rep_number - b.rep_number);
  const cleanRepNumbers = sortedReps
    .filter((rep) => rep.faults_json.length === 0)
    .map((rep) => rep.rep_number);
  const minAngles = sortedReps
    .map(repMinAngle)
    .filter((value): value is number => value !== undefined);
  const minAngle = minAngles.length ? Math.min(...minAngles) : undefined;
  const maxAngle = minAngles.length ? Math.max(...minAngles) : undefined;
  const durations = sortedReps
    .map((rep) => ({ rep: rep.rep_number, ms: repDuration(rep) }))
    .filter((row): row is { rep: number; ms: number } => row.ms !== undefined);
  const slowestRep = durations.length
    ? durations.reduce((a, b) => (b.ms > a.ms ? b : a))
    : undefined;
  const fastestRep = durations.length
    ? durations.reduce((a, b) => (b.ms < a.ms ? b : a))
    : undefined;

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
    if (stats.cleanReps > 0) {
      // A zero-clean session is already reported neutrally in the recap; it is
      // not something that "went well", so it stays out of the strengths list.
      strengths.push(
        evidenceText(
          `${stats.cleanReps} of ${stats.totalReps} reps had no supported technique cue, with a longest clean streak of ${stats.longestCleanStreak}.`,
          `Clean on ${formatRepList(cleanRepNumbers)} — no supported technique cues on those reps.`,
        ),
      );
    }
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
          minAngle !== undefined && maxAngle !== undefined
            ? `Deepest points ranged from ${minAngle}° to ${maxAngle}° across ${stats.measuredReps} measured reps.`
            : `Your depth varied by just ${stats.minAngleStdDev}° across ${stats.measuredReps} measured reps.`,
        ),
      );
    }
  }

  if (topFault) improvements.push(findingItem(faultFinding(session.exercise, topFault, stats.totalReps)));

  if (stats.depthDecay && stats.depthDecay.change >= 5) {
    improvements.push(findingItem(decayFinding(stats.depthDecay)));
  } else if (stats.depthDecay && stats.depthDecay.change <= -5) {
    strengths.push(
      evidenceText(
        `Your measured range improved by ${Math.abs(stats.depthDecay.change)}° from early to late reps (${stats.depthDecay.firstAverage}° → ${stats.depthDecay.lastAverage}°).`,
        `Early reps averaged ${stats.depthDecay.firstAverage}° at your deepest point, late reps averaged ${stats.depthDecay.lastAverage}° — your range got ${Math.abs(stats.depthDecay.change)}° deeper.`,
      ),
    );
  }

  const repeatable = repeatabilityFinding(stats, minAngle, maxAngle);
  if (repeatable) improvements.push(findingItem(repeatable));

  const tempo = tempoFinding(stats, slowestRep, fastestRep);
  if (tempo) improvements.push(findingItem(tempo));

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
    cleanRepNumbers,
    slowestRep,
    fastestRep,
    minAngle,
    maxAngle,
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
  const cleanText =
    stats.cleanReps === 0
      ? 'none were clean by supported cues'
      : `${stats.cleanReps} of ${stats.totalReps} were clean by supported cues`;
  const cueText = `${faultCount} technique cue${faultCount === 1 ? '' : 's'} observed`;
  const angleText =
    stats.measuredReps > 0 && stats.measuredReps >= stats.totalReps
      ? `Joint angles were measured on all ${stats.totalReps} reps`
      : stats.measuredReps > 0
        ? `Joint angles were measured on ${stats.measuredReps} of ${stats.totalReps} reps`
        : 'No joint angle measurements were recorded';
  const topFault = stats.faultFrequencies[0];
  const topCueText = topFault
    ? `The most common cue was ${topFault.label} on ${topFault.count} of ${stats.totalReps} reps (${topFault.percent}%).`
    : 'No supported technique cues were detected; that is not proof of perfect form.';
  return `${demoPrefix}${stats.totalReps} ${exercise} reps recorded; ${cleanText}, and ${cueText}. ${angleText}. ${topCueText}`;
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
