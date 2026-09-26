import type { ExerciseId, ExerciseResult } from '../../types/workout';
import { PRIORITY, repCountCue, type VoiceCue } from './Phrasebook';

interface CueContext {
  exercise: ExerciseId;
  totalReps: number;
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
    return result.repCompleted
      ? announce(
          'rep',
          { text: 'Rep complete. Keep your movement controlled.', kind: 'rep', priority: PRIORITY.rep },
          5000,
        )
      : announce(
          'ready',
          { text: 'Ready. Move at a comfortable, controlled pace.', kind: 'setup', priority: PRIORITY.setup },
          30000,
        );
  }
}
