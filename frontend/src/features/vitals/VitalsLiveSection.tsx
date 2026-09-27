import { Activity, HeartPulse } from 'lucide-react';
import { GUARDIAN_PHRASES, DEFAULT_THRESHOLDS, type GuardianState } from './useVitalsGuardian';
import type { VitalsReading, VitalsStatus } from './vitalsClient';
import './vitals.css';

interface VitalsLiveSectionProps {
  /** Session status from useVitalsSession. */
  status: VitalsStatus;
  /** Latest reading from the vitals service. */
  reading: VitalsReading | null;
  /** Rolling guardian state and average pulse. */
  guardian: GuardianState;
  /**
   * Rolling average pulse from the guardian. The section shows this instead
   * of the latest single reading so the displayed number can never disagree
   * with the alert state (no lone spike shown as fact while the guardian
   * says "Monitoring").
   */
  avgPulse: number | null;
}

/**
 * Small live vitals section shown under the camera during a workout.
 * Wellness-only, never diagnostic. Hides entirely when the vitals
 * service is idle or unavailable so a missing sidecar never clutters
 * the session.
 */
export function VitalsLiveSection({ status, reading, guardian, avgPulse }: VitalsLiveSectionProps) {
  if (status === 'idle' || status === 'unavailable' || status === 'busy') return null;

  const minConfidence = DEFAULT_THRESHOLDS.minConfidence;
  const elevated = guardian === 'elevated';
  const pulse = avgPulse;
  const breathing =
    reading && reading.breathing_confidence >= minConfidence ? reading.breathing_bpm : null;

  const stateLabel =
    elevated
      ? 'Running high'
      : status === 'connecting'
        ? 'Starting…'
        : pulse !== null
          ? 'Monitoring'
          : 'Reading — hold still';

  return (
    <section
      className={`panel vitals-live-section${elevated ? ' is-elevated' : ''}`}
      aria-label="Vitals"
      data-testid="vitals-live-section"
    >
      <div className="vitals-live-head">
        <span className="eyebrow">
          <HeartPulse size={13} /> Vitals
        </span>
        <span className={`vitals-live-state${elevated ? ' is-elevated' : ''}`}>{stateLabel}</span>
      </div>
      <div className="vitals-live-values">
        <div className="vitals-live-value">
          <small>PULSE</small>
          <strong data-testid="vitals-live-pulse">{pulse !== null ? `${pulse} bpm` : '—'}</strong>
        </div>
        <div className="vitals-live-value">
          <small>BREATHING</small>
          <strong data-testid="vitals-live-breathing">
            {breathing !== null ? `${breathing} /min` : '—'}
          </strong>
        </div>
      </div>
      {elevated ? (
        <p className="vitals-live-alert" data-testid="vitals-live-alert">
          <Activity size={14} />
          <span>
            {GUARDIAN_PHRASES.elevated} For wellness info only, not medical advice.
          </span>
        </p>
      ) : (
        pulse === null && (
          <p className="vitals-live-hint">Keep your face in frame to read your pulse.</p>
        )
      )}
    </section>
  );
}
