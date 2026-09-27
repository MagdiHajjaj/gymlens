// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  DEFAULT_THRESHOLDS,
  useVitalsGuardian,
} from '../src/features/vitals/useVitalsGuardian';

const reading = (pulse_bpm: number | null, pulse_confidence: number) => ({
  type: 'vitals' as const,
  pulse_bpm,
  pulse_confidence,
  breathing_bpm: null,
  breathing_confidence: 0,
  ts: Date.now(),
});

function setup(overrides = {}) {
  const onElevated = vi.fn();
  const onRecovered = vi.fn();
  const hook = renderHook(
    ({ active, reading }) =>
      useVitalsGuardian({ active, reading, onElevated, onRecovered, ...overrides }),
    { initialProps: { active: false, reading: null as ReturnType<typeof reading> | null } },
  );
  return { hook, onElevated, onRecovered };
}

function feed(hook: ReturnType<typeof setup>['hook'], pulses: [number, number][], startMs: number) {
  // pulses: [pulse_bpm, confidence][], one reading per second
  pulses.forEach(([pulse, conf], i) => {
    vi.setSystemTime(startMs + i * 1000);
    act(() => {
      hook.rerender({ active: true, reading: reading(pulse, conf) });
    });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useVitalsGuardian', () => {
  it('goes from idle to watching when the workout becomes active', () => {
    const { hook } = setup();
    expect(hook.result.current.state).toBe('idle');
    act(() => {
      hook.rerender({ active: true, reading: null });
    });
    expect(hook.result.current.state).toBe('watching');
  });

  it('fires onElevated after a sustained confident high pulse', () => {
    const { hook, onElevated } = setup();
    act(() => {
      hook.rerender({ active: true, reading: null });
    });
    feed(hook, Array(11).fill([180, 90]), 1_000_000);
    expect(hook.result.current.state).toBe('elevated');
    expect(onElevated).toHaveBeenCalledTimes(1);
  });

  it('ignores low-confidence readings (no alert on shaky data)', () => {
    const { hook, onElevated } = setup();
    act(() => {
      hook.rerender({ active: true, reading: null });
    });
    feed(hook, Array(11).fill([190, 20]), 1_000_000);
    expect(hook.result.current.state).toBe('watching');
    expect(onElevated).not.toHaveBeenCalled();
  });

  it('ignores a single spike (needs a sustained window)', () => {
    const { hook, onElevated } = setup();
    act(() => {
      hook.rerender({ active: true, reading: null });
    });
    feed(hook, [[72, 90], [200, 90]], 1_000_000);
    expect(onElevated).not.toHaveBeenCalled();
  });

  it('fires onRecovered when the average falls back below the recovery threshold', () => {
    const { hook, onElevated, onRecovered } = setup();
    act(() => {
      hook.rerender({ active: true, reading: null });
    });
    feed(hook, Array(11).fill([180, 90]), 1_000_000);
    expect(hook.result.current.state).toBe('elevated');
    feed(hook, Array(11).fill([110, 90]), 1_011_000);
    expect(hook.result.current.state).toBe('watching');
    expect(onElevated).toHaveBeenCalledTimes(1);
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });

  it('does not flap between elevated and watching near the threshold', () => {
    const { hook, onElevated, onRecovered } = setup();
    act(() => {
      hook.rerender({ active: true, reading: null });
    });
    feed(hook, Array(11).fill([180, 90]), 1_000_000);
    // Hover between high and recovery thresholds: stays elevated.
    feed(hook, Array(6).fill([150, 90]), 1_011_000);
    expect(hook.result.current.state).toBe('elevated');
    expect(onRecovered).not.toHaveBeenCalled();
    expect(onElevated).toHaveBeenCalledTimes(1);
  });

  it('resets to idle when the workout stops', () => {
    const { hook } = setup();
    act(() => {
      hook.rerender({ active: true, reading: null });
    });
    expect(hook.result.current.state).toBe('watching');
    act(() => {
      hook.rerender({ active: false, reading: null });
    });
    expect(hook.result.current.state).toBe('idle');
    expect(hook.result.current.avgPulse).toBeNull();
  });

  it('pill renders the live average while watching', async () => {
    const { VitalsPill } = await import('../src/features/vitals/VitalsPill');
    const { render, screen, cleanup } = await import('@testing-library/react');
    try {
      render(<VitalsPill guardian="watching" avgPulse={72} />);
      expect(screen.getByTestId('vitals-pill').textContent).toContain('72');
      cleanup();
      render(<VitalsPill guardian="elevated" avgPulse={182} />);
      expect(screen.getByTestId('vitals-pill').className).toContain('is-elevated');
      cleanup();
      const { container } = render(<VitalsPill guardian="idle" avgPulse={null} />);
      expect(container.textContent).toBe('');
    } finally {
      cleanup();
    }
  });

  it('uses the documented default thresholds', () => {
    expect(DEFAULT_THRESHOLDS.highPulseBpm).toBe(175);
    expect(DEFAULT_THRESHOLDS.recoveryPulseBpm).toBe(130);
  });
});
