import type { ExerciseResult } from '../../types/workout';
export class FeedbackEngine {
  private current = '';
  private since = 0;
  private last = new Map<string, number>();
  private lastAny = -Infinity;
  reset() {
    this.current = '';
    this.since = 0;
    this.last.clear();
    this.lastAny = -Infinity;
  }
  next(result: ExerciseResult, time: number): string | null {
    if (!result.trackingValid || !result.calibrated) {
      this.current = '';
      return null;
    }
    const fault = result.faults[0];
    if (!fault) {
      this.current = '';
      return null;
    }
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
    return fault.message;
  }
}
