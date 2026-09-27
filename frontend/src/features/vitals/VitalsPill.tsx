import { HeartPulse } from 'lucide-react';
import type { GuardianState } from './useVitalsGuardian';
import './vitals.css';

/**
 * Tiny inline vitals status for the workout UI — not a section, just a
 * pill that lives in the status bar / rest overlay. Shows the live pulse
 * when a confident reading exists, a quiet "watching" dot otherwise, and
 * turns red while the guardian alert is active.
 */
export function VitalsPill({
  guardian,
  avgPulse,
}: {
  guardian: GuardianState;
  avgPulse: number | null;
}) {
  if (guardian === 'idle') return null;
  const elevated = guardian === 'elevated';
  return (
    <span
      className={`vitals-pill${elevated ? ' is-elevated' : ''}`}
      role="status"
      aria-label={elevated ? `Pulse high, averaging ${avgPulse ?? '—'} beats per minute` : 'Vitals guardian watching'}
      data-testid="vitals-pill"
    >
      <HeartPulse size={13} />
      {avgPulse != null ? `${avgPulse}` : '···'}
    </span>
  );
}
