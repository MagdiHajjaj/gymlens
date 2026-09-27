import { describe, expect, it } from 'vitest';
import { FeedbackEngine } from '../src/features/coaching/FeedbackEngine';
import { FAULT_PHRASES } from '../src/features/coaching/Phrasebook';
import type { ExerciseResult } from '../src/types/workout';

const faultResult = (code: string, rawMessage: string): ExerciseResult => ({
  phase: 'eccentric',
  trackingValid: true,
  calibrated: true,
  repCompleted: true,
  jointAngles: {},
  faults: [{ code, message: rawMessage, severity: 'warning' }],
  guidance: '',
});

const context = { exercise: 'curl' as const, totalReps: 1 };

describe('live fault coaching', () => {
  it('cycles variants in order without immediate repeats', () => {
    const engine = new FeedbackEngine();
    const entry = FAULT_PHRASES.curl!.find((e) => e.code === 'upper_arm_movement')!;
    const texts: string[] = [];
    let time = 0;
    for (let i = 0; i < 3; i++) {
      time += 45000;
      const cue = engine.nextCue(faultResult('upper_arm_movement', 'RAW ANALYZER TEXT'), time, context);
      expect(cue).not.toBeNull();
      texts.push(cue!.text);
    }
    expect(texts).toEqual(entry.variants);
    expect(new Set(texts).size).toBe(3);
  });

  it('never speaks the raw analyzer message', () => {
    const engine = new FeedbackEngine();
    const cue = engine.nextCue(
      faultResult('upper_arm_movement', 'Some raw analyzer wording here.'),
      100000,
      context,
    );
    expect(cue?.text).not.toBe('Some raw analyzer wording here.');
  });

  it('switches to the drill cue after repeated occurrences', () => {
    const engine = new FeedbackEngine();
    const entry = FAULT_PHRASES.curl!.find((e) => e.code === 'upper_arm_movement')!;
    let time = 0;
    let cue = null;
    for (let i = 0; i < 4; i++) {
      time += 45000;
      cue = engine.nextCue(faultResult('upper_arm_movement', 'raw'), time, context);
    }
    expect(cue?.text).toBe(entry.drill);
  });

  it('backs off the cooldown between reminders of the same fault', () => {
    const engine = new FeedbackEngine();
    const result = faultResult('upper_arm_movement', 'raw');
    // First occurrence speaks immediately (past the 900ms new-fault delay via repCompleted).
    expect(engine.nextCue(result, 100000, context)).not.toBeNull();
    // 15s later: inside the 20s second-occurrence cooldown.
    expect(engine.nextCue(result, 115000, context)).toBeNull();
    // 21s after the first: second occurrence speaks.
    expect(engine.nextCue(result, 121000, context)).not.toBeNull();
    // 30s after the second: inside the 40s third-occurrence cooldown.
    expect(engine.nextCue(result, 151000, context)).toBeNull();
    // 41s after the second: third occurrence speaks.
    expect(engine.nextCue(result, 162000, context)).not.toBeNull();
  });

  it('retires a fault for the session after six occurrences', () => {
    const engine = new FeedbackEngine();
    const result = faultResult('upper_arm_movement', 'raw');
    let time = 100000;
    let spoken = 0;
    for (let i = 0; i < 8; i++) {
      time += 45000;
      if (engine.nextCue(result, time, context)) spoken += 1;
    }
    expect(spoken).toBe(6);
    // Well past every cooldown: still silent.
    expect(engine.nextCue(result, time + 3600000, context)).toBeNull();
  });

  it('keeps unknown fault codes visual-only', () => {
    const engine = new FeedbackEngine();
    const cue = engine.nextCue(faultResult('mystery_code', 'Raw analyzer message.'), 100000, context);
    expect(cue).toBeNull();
  });

  it('resets fault state between sessions', () => {
    const engine = new FeedbackEngine();
    const result = faultResult('upper_arm_movement', 'raw');
    let time = 100000;
    for (let i = 0; i < 8; i++) {
      time += 45000;
      engine.nextCue(result, time, context);
    }
    expect(engine.nextCue(result, time + 3600000, context)).toBeNull();
    engine.reset();
    expect(engine.nextCue(result, time + 3700000, context)).not.toBeNull();
  });
});
