import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetVitalsThrottleForTests, useWorkout } from '../src/features/workout/workoutStore';

const reading = (overrides = {}) => ({
  type: 'vitals' as const,
  pulse_bpm: 72,
  pulse_confidence: 90,
  breathing_bpm: 14,
  breathing_confidence: 80,
  ts: Date.now(),
  ...overrides,
});

function beginSession() {
  useWorkout.setState({
    selected: 'squat',
    selectedIds: ['squat'],
    session: null,
    result: null,
    paused: false,
    rest: null,
  });
  useWorkout.getState().begin('camera');
}

describe('recordVitals', () => {
  beforeEach(() => {
    vi.useRealTimers();
    __resetVitalsThrottleForTests();
    beginSession();
  });

  it('persists confident readings as vitals.* metric samples', () => {
    useWorkout.getState().recordVitals(reading());
    const metrics = useWorkout.getState().session!.metrics;
    const names = metrics.map((m) => m.metric_name);
    expect(names).toContain('vitals.pulse_bpm');
    expect(names).toContain('vitals.pulse_bpm_confidence');
    expect(names).toContain('vitals.breathing_bpm');
    expect(names).toContain('vitals.breathing_bpm_confidence');
    expect(metrics.find((m) => m.metric_name === 'vitals.pulse_bpm')!.metric_value).toBe(72);
  });

  it('drops zero-confidence readings (never persist guesses)', () => {
    useWorkout.getState().recordVitals(
      reading({ pulse_bpm: null, pulse_confidence: 0, breathing_bpm: null, breathing_confidence: 0 }),
    );
    expect(useWorkout.getState().session!.metrics).toHaveLength(0);
  });

  it('records only the confident metric when the other is still measuring', () => {
    useWorkout.getState().recordVitals(
      reading({ breathing_bpm: null, breathing_confidence: 0 }),
    );
    const names = useWorkout.getState().session!.metrics.map((m) => m.metric_name);
    expect(names).toContain('vitals.pulse_bpm');
    expect(names).not.toContain('vitals.breathing_bpm');
  });

  it('throttles to one batch per 5s', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    useWorkout.getState().recordVitals(reading());
    expect(useWorkout.getState().session!.metrics).toHaveLength(4);
    vi.setSystemTime(1_002_000); // +2s: throttled
    useWorkout.getState().recordVitals(reading({ pulse_bpm: 74 }));
    expect(useWorkout.getState().session!.metrics).toHaveLength(4);
    vi.setSystemTime(1_006_000); // +6s: allowed
    useWorkout.getState().recordVitals(reading({ pulse_bpm: 74 }));
    expect(useWorkout.getState().session!.metrics).toHaveLength(8);
  });

  it('is a no-op without an active session', () => {
    useWorkout.setState({ session: null });
    expect(() => useWorkout.getState().recordVitals(reading())).not.toThrow();
  });
});
