import type { ExerciseId, ExerciseResult } from '../../types/workout';
import { PRIORITY, repCountCue, type VoiceCue } from './Phrasebook';

interface CueContext {
  exercise: ExerciseId;
  totalReps: number;
}

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

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
  private lastAny = -Infinity;
  private lastRepTotal = 0;
  reset() {
    this.current = '';
    this.since = 0;
    this.last.clear();
    this.lastAny = -Infinity;
    this.lastRepTotal = 0;
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
        ? repCountCue(context.totalReps, context.exercise, completedCount)
        : null;
    if (!result.trackingValid || !result.calibrated) {
      this.current = '';
      return announce(
        result.guidance,
        { text: result.guidance, kind: 'setup', priority: PRIORITY.setup },
        15000,
      );
    }
    const fault = result.faults[0];
    if (fault) {
      if (this.current !== fault.code) {
        this.current = fault.code;
        this.since = time;
      }
      if (
        (!result.repCompleted && time - this.since < 900) ||
        time - (this.last.get(fault.code) ?? -Infinity) < 10000 ||
        time - this.lastAny < 5000
      )
        return null;
      this.last.set(fault.code, time);
      this.lastAny = time;
      return {
        text: fault.message,
        kind: 'fault',
        priority: PRIORITY.fault,
        metadata: { code: fault.code, severity: fault.severity },
      };
    }
    this.current = '';
    if (repCue) {
      this.lastRepTotal = Number(repCue.metadata?.totalReps ?? this.lastRepTotal);
      return repCue;
    }
    const repNumber = context && context.totalReps > 0 ? context.totalReps : completedCount;
    return result.repCompleted
      ? announce(
          'rep',
          { text: repCompleteCue(result, repNumber), kind: 'rep', priority: PRIORITY.rep },
          5000,
        )
      : announce(
          'ready',
          { text: readyCue(completedCount), kind: 'setup', priority: PRIORITY.setup },
          30000,
        );
  }
}
