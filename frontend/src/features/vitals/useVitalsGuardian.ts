import { useEffect, useRef, useState } from 'react';
import type { VitalsReading } from './vitalsClient';

export type GuardianState = 'idle' | 'watching' | 'elevated';

export interface GuardianThresholds {
  /** Sustained pulse at/above this → suggest a breather. Default 175. */
  highPulseBpm: number;
  /** Sustained pulse at/below this after elevation → all clear. Default 130. */
  recoveryPulseBpm: number;
  /** Rolling window for the pulse average, seconds. Default 10. */
  windowSeconds: number;
  /** Readings below this confidence are ignored. Default 50. */
  minConfidence: number;
}

export const DEFAULT_THRESHOLDS: GuardianThresholds = {
  highPulseBpm: 175,
  recoveryPulseBpm: 130,
  windowSeconds: 10,
  minConfidence: 50,
};

/**
 * Advisory copy. Deliberately soft: this is a wellness nudge based on a
 * camera estimate, never a medical directive or diagnosis.
 */
export const GUARDIAN_PHRASES = {
  elevated: 'Your pulse is running high. Consider taking a breather.',
  recovered: 'Your pulse is back down. You can continue when you are ready.',
} as const;

interface Sample {
  ts: number;
  pulse: number;
}

/**
 * Watches a stream of vitals readings during a workout and raises an
 * advisory alert when the confident pulse average stays above the high
 * threshold, clearing it when the average falls back below the recovery
 * threshold (hysteresis, so it can't flap).
 *
 * Only confident readings count — while the user is moving hard the
 * camera estimate degrades, and those samples are ignored rather than
 * acted on. Fires each callback at most once per excursion.
 */
export function useVitalsGuardian({
  active,
  reading,
  onElevated,
  onRecovered,
  thresholds = DEFAULT_THRESHOLDS,
}: {
  active: boolean;
  reading: VitalsReading | null;
  onElevated: () => void;
  onRecovered: () => void;
  thresholds?: GuardianThresholds;
}): { state: GuardianState; avgPulse: number | null } {
  const [state, setState] = useState<GuardianState>('idle');
  const [avgPulse, setAvgPulse] = useState<number | null>(null);
  const samples = useRef<Sample[]>([]);
  const stateRef = useRef<GuardianState>('idle');
  const callbacks = useRef({ onElevated, onRecovered });
  callbacks.current = { onElevated, onRecovered };

  // Inactive workout: reset.
  useEffect(() => {
    if (!active) {
      samples.current = [];
      stateRef.current = 'idle';
      setState('idle');
      setAvgPulse(null);
    } else if (stateRef.current === 'idle') {
      stateRef.current = 'watching';
      setState('watching');
    }
  }, [active]);

  useEffect(() => {
    if (!active || !reading) return;
    const { pulse_bpm, pulse_confidence } = reading;
    if (pulse_bpm == null || pulse_confidence < thresholds.minConfidence) return;

    const now = Date.now();
    const cutoff = now - thresholds.windowSeconds * 1000;
    samples.current = [
      ...samples.current.filter((s) => s.ts >= cutoff),
      { ts: now, pulse: pulse_bpm },
    ];
    const window = samples.current;
    if (!window.length) return;
    const avg = window.reduce((a, s) => a + s.pulse, 0) / window.length;
    setAvgPulse(Math.round(avg));

    // Require a reasonably full window before judging, so one spike
    // can't trip the alert.
    if (window.length < 3) return;

    if (stateRef.current === 'watching' && avg >= thresholds.highPulseBpm) {
      stateRef.current = 'elevated';
      setState('elevated');
      callbacks.current.onElevated();
    } else if (stateRef.current === 'elevated' && avg <= thresholds.recoveryPulseBpm) {
      stateRef.current = 'watching';
      setState('watching');
      callbacks.current.onRecovered();
    }
  }, [active, reading, thresholds]);

  return { state, avgPulse };
}
