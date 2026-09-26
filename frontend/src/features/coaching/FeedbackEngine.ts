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
    const announce = (key: string, message: string, cooldown: number) => {
      if (!message || time - this.lastAny < 5000 || time - (this.last.get(key) ?? -Infinity) < cooldown)
        return null;
      this.last.set(key, time);
      this.lastAny = time;
      return message;
    };
    if (!result.trackingValid || !result.calibrated) {
      this.current = '';
      return announce(result.guidance, result.guidance, 15000);
    }
    const fault = result.faults[0];
    if (!fault) {
      this.current = '';
      return result.repCompleted
        ? announce('rep', 'Rep complete. Keep your movement controlled.', 5000)
        : announce('ready', 'Ready. Move at a comfortable, controlled pace.', 30000);
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
