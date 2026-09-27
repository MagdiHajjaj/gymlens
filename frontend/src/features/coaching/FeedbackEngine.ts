import type { ExerciseId, ExerciseResult } from '../../types/workout';
import { FAULT_PHRASES, PRIORITY, repCountCue, type VoiceCue } from './Phrasebook';
import { movementCues } from '../exercises/MovementCues';

interface CueContext {
  exercise: ExerciseId;
  totalReps: number;
  setReps?: number;
}

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

// Live fault coaching: variants cycle in order, then a drill cue, then the
// fault retires for the session while visual cues stay on.
const FAULT_BASE_COOLDOWN_MS = 10000;
const FAULT_DRILL_AFTER = 3;
const FAULT_RETIRE_AFTER = 6;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Predict the exact cue texts the engine will speak for the next completed rep,
 * so the caller can pre-generate their cloud audio while the rep is in progress.
 * The rep number is sequential so it is known exactly; the rep's measured angle
 * is predicted from the just-completed rep (depth is consistent rep to rep, so
 * the prediction usually matches). A wrong prediction is harmless: the cache key
 * is the exact text, so a miss just falls back to the normal fetch path — audio
 * is never wrong, only occasionally not instant.
 */
export function predictNextRepCues(
  result: ExerciseResult,
  context: { exercise: ExerciseId; nextSetReps: number },
): string[] {
  const texts = new Set<string>();
  const countCue = repCountCue(context.nextSetReps, context.exercise);
  if (countCue?.text) texts.add(countCue.text);
  const completion = repCompleteCue(result, context.nextSetReps);
  if (completion) texts.add(completion);
  return [...texts];
}

/**
 * Rep-completion cue grounded in the rep's measured data: the rep number plus the
 * measured minimum joint angle when the analyzer recorded one. Never invents a
 * measurement — without rep data it stays a plain completion callout.
 */
export function repCompleteCue(result: ExerciseResult, repNumber: number): string {
  const label = repNumber > 0 ? `Rep ${repNumber} complete.` : 'Rep complete.';
  const minAngle = finiteNumber(result.repMetrics?.min_angle);
  return minAngle === undefined ? label : `${label} Bottom angle ${Math.round(minAngle)} degrees.`;
}

/**
 * Idle cue grounded in measured session state: the rep count recorded so far.
 * Replaces generic motivational filler with what the session actually measured.
 */
export function readyCue(completedReps: number): string {
  if (completedReps <= 0) return 'Ready.';
  return `Ready. ${completedReps} ${completedReps === 1 ? 'rep' : 'reps'} so far.`;
}

export class FeedbackEngine {
  private current = '';
  private since = 0;
  private last = new Map<string, number>();
  private faultSpoken = new Map<string, number>();
  private movementPhase = '';
  private movementPhaseSince = 0;
  private lastAny = -Infinity;
  private lastRepTotal = 0;
  private recordedTotal = 0;
  private repAngles: number[] = [];
  private repDurations: number[] = [];
  private idleCountCue = true;
  reset() {
    this.current = '';
    this.since = 0;
    this.last.clear();
    this.faultSpoken.clear();
    this.movementPhase = '';
    this.movementPhaseSince = 0;
    this.lastAny = -Infinity;
    this.lastRepTotal = 0;
    this.recordedTotal = 0;
    this.repAngles = [];
    this.repDurations = [];
    this.idleCountCue = true;
  }
  next(result: ExerciseResult, time: number, context?: CueContext): string | null {
    return this.nextCue(result, time, context)?.text ?? null;
  }
  nextCue(result: ExerciseResult, time: number, context?: CueContext): VoiceCue | null {
    const announce = (key: string, cue: VoiceCue, cooldown: number, globalCooldown = true) => {
      if (
        !cue.text ||
        (globalCooldown && time - this.lastAny < 5000) ||
        time - (this.last.get(key) ?? -Infinity) < cooldown
      )
        return null;
      this.last.set(key, time);
      if (globalCooldown) this.lastAny = time;
      return cue;
    };
    const completedCount = result.completedReps?.length ?? (result.repCompleted ? 1 : 0);
    const repCue =
      completedCount > 0 && context && context.totalReps > this.lastRepTotal
        ? repCountCue(context.setReps ?? context.totalReps, context.exercise, completedCount)
        : null;
    if (!result.trackingValid || !result.calibrated) {
      this.current = '';
      this.movementPhase = '';
      return announce(
        result.guidance,
        { text: result.guidance, kind: 'setup', priority: PRIORITY.setup },
        15000,
      );
    }
    if (!result.repCompleted && result.guidance.startsWith('Rep not counted:')) {
      return announce(
        result.guidance,
        { text: result.guidance, kind: 'fault', priority: PRIORITY.fault },
        5000,
      );
    }
    const fault = result.faults[0];
    if (fault && context) {
      // The voice path only speaks phrasebook copy: raw analyzer messages
      // never reach the speaker, and unknown codes stay visual-only.
      const entry = FAULT_PHRASES[context.exercise]?.find((e) => e.code === fault.code);
      if (!entry) return null;
      if (this.current !== fault.code) {
        this.current = fault.code;
        this.since = time;
      }
      const spoken = this.faultSpoken.get(fault.code) ?? 0;
      // Retire the cue for the rest of the session: the user has heard it
      // enough, and visual cues remain on.
      if (spoken >= FAULT_RETIRE_AFTER) return null;
      // Backoff: 10s, then 20s, then 40s between reminders of the same fault.
      const cooldownMs = FAULT_BASE_COOLDOWN_MS * 2 ** Math.min(spoken, 2);
      if (
        (!result.repCompleted && time - this.since < 900) ||
        time - (this.last.get(fault.code) ?? -Infinity) < cooldownMs ||
        time - this.lastAny < 5000
      )
        return null;
      this.last.set(fault.code, time);
      this.lastAny = time;
      this.faultSpoken.set(fault.code, spoken + 1);
      // Cycle the variants in order (no immediate repeats); after repeated
      // occurrences switch to the drill cue — a different angle, not another
      // repetition.
      const text =
        spoken >= FAULT_DRILL_AFTER ? entry.drill : entry.variants[spoken % entry.variants.length];
      return {
        text,
        kind: 'fault',
        priority: PRIORITY.fault,
        metadata: { code: fault.code, severity: fault.severity, occurrence: spoken + 1 },
      };
    }
    this.current = '';
    if (repCue) {
      this.lastRepTotal = context?.totalReps ?? this.lastRepTotal;
      if (context) this.recordRep(result, context.totalReps);
      return repCue;
    }
    if (!result.repCompleted && context && result.phase !== 'ready') {
      const movementPhase = `${context.exercise}:${result.phase}`;
      if (this.movementPhase !== movementPhase) {
        this.movementPhase = movementPhase;
        this.movementPhaseSince = time;
        return null;
      }
      if (time - this.movementPhaseSince >= 350) {
        const cue = announce(
          `movement:${movementPhase}`,
          { text: result.guidance, kind: 'setup', priority: PRIORITY.setup },
          7000,
        );
        if (cue) return cue;
      }
    } else this.movementPhase = '';
    const repNumber = context && context.totalReps > 0 ? (context.setReps ?? context.totalReps) : completedCount;
    if (result.repCompleted && context) {
      this.lastRepTotal = context.totalReps;
      if (context.totalReps > this.recordedTotal) {
        const insight = this.insightFromHistory(result, repNumber, time);
        this.recordRep(result, context.totalReps);
        if (insight) return insight;
      }
    }
    return result.repCompleted
      ? { text: repCompleteCue(result, repNumber), kind: 'rep', priority: PRIORITY.rep }
      : this.idleCue(announce, context, completedCount);
  }

  /**
   * Idle coaching alternates between the measured rep count and a pose
   * reminder for the current exercise, so a long pause between reps coaches
   * setup ("make sure your pose is right") instead of just restating readiness.
   * The 30s cooldown keeps it from nagging; the alternation only advances when
   * a cue actually speaks.
   */
  private idleCue(
    announce: (key: string, cue: VoiceCue, cooldown: number, globalCooldown?: boolean) => VoiceCue | null,
    context: CueContext | undefined,
    completedCount: number,
  ): VoiceCue | null {
    const total = context?.totalReps ?? completedCount;
    const text =
      this.idleCountCue || !context ? readyCue(total) : movementCues[context.exercise].ready;
    const cue = announce('ready', { text, kind: 'setup', priority: PRIORITY.setup }, 30000);
    if (cue) this.idleCountCue = !this.idleCountCue;
    return cue;
  }

  /**
   * Record one completed rep's measured data for future comparisons. Guarded by
   * the session rep total so a rep is never recorded twice.
   */
  private recordRep(result: ExerciseResult, totalReps: number) {
    if (totalReps <= this.recordedTotal) return;
    this.recordedTotal = totalReps;
    const angle = finiteNumber(result.repMetrics?.min_angle);
    const duration = finiteNumber(result.repMetrics?.duration_ms);
    if (angle !== undefined) this.repAngles.push(angle);
    if (duration !== undefined) this.repDurations.push(duration);
  }

  /**
   * Genuine coaching tips grounded in the user's own measured session data.
   * Compares this rep against the user's earlier reps (never against invented
   * ideals): a notably rushed rep, a rep short of their usual range, or a new
   * best range on a clean rep. Returns null when there is no baseline yet or
   * nothing notable happened, letting the standard rep cue through instead.
   * Each insight has its own cooldown so it coaches without nagging.
   */
  private insightFromHistory(
    result: ExerciseResult,
    repNumber: number,
    time: number,
  ): VoiceCue | null {
    const angle = finiteNumber(result.repMetrics?.min_angle);
    const duration = finiteNumber(result.repMetrics?.duration_ms);
    if (this.repAngles.length >= 3 && angle !== undefined) {
      const bestAngle = Math.min(...this.repAngles);
      if (angle < bestAngle - 5 && result.faults.length === 0) {
        const praise = this.takeInsight('insight:best-range', time, 120_000, {
          text: `Rep ${repNumber} — best range yet. Hold that standard.`,
          kind: 'rep',
          priority: PRIORITY.rep,
        });
        if (praise) return praise;
      }
      if (angle > median(this.repAngles) + 10) {
        const correction = this.takeInsight('insight:short-range', time, 75_000, {
          text: `Rep ${repNumber} — short of your usual range. Reach a little further.`,
          kind: 'rep',
          priority: PRIORITY.rep,
        });
        if (correction) return correction;
      }
    }
    if (this.repDurations.length >= 3 && duration !== undefined) {
      if (duration < median(this.repDurations) * 0.55) {
        const tempo = this.takeInsight('insight:tempo', time, 75_000, {
          text: `Rep ${repNumber} — slow it down. Control the movement.`,
          kind: 'rep',
          priority: PRIORITY.rep,
        });
        if (tempo) return tempo;
      }
    }
    const eccentric = finiteNumber(result.repMetrics?.eccentric_ms);
    const concentric = finiteNumber(result.repMetrics?.concentric_ms);
    if (eccentric !== undefined && concentric !== undefined && eccentric > 0) {
      // Lifting much faster than lowering means the weight is being dropped
      // on the way down instead of controlled — the classic rushed eccentric.
      if (concentric > eccentric * 2) {
        const lowering = this.takeInsight('insight:lowering', time, 90_000, {
          text: `Rep ${repNumber} — control the way down. Don't drop the weight.`,
          kind: 'rep',
          priority: PRIORITY.rep,
        });
        if (lowering) return lowering;
      }
    }
    return null;
  }

  private takeInsight(key: string, time: number, cooldown: number, cue: VoiceCue): VoiceCue | null {
    if (time - (this.last.get(key) ?? -Infinity) < cooldown) return null;
    this.last.set(key, time);
    this.lastAny = time;
    return cue;
  }
}
