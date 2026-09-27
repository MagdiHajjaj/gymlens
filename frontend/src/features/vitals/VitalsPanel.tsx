import { Activity, HeartPulse, Wind } from 'lucide-react';
import type { VitalsReading, VitalsStatus } from './vitalsClient';
import './vitals.css';

function MetricValue({ value, confidence, unit }: { value: number | null; confidence: number; unit: string }) {
  // Never fabricate: zero confidence means "still measuring", not a number.
  if (confidence <= 0 || value == null) {
    return (
      <span className="vitals-measuring" aria-live="polite">
        Measuring…
      </span>
    );
  }
  return (
    <span className="vitals-value">
      {Math.round(value)}
      <small>{unit}</small>
    </span>
  );
}

export function VitalsPanel({
  status,
  reading,
  compact = false,
}: {
  status: VitalsStatus;
  reading: VitalsReading | null;
  /** Compact layout for the mobile rest flow (PR3 reuses this). */
  compact?: boolean;
}) {
  let body: React.ReactNode;
  switch (status) {
    case 'measuring':
      body = (
        <div className="vitals-metrics">
          <div className="vitals-metric">
            <span className="vitals-metric-label">
              <HeartPulse size={15} /> Pulse
            </span>
            <MetricValue
              value={reading?.pulse_bpm ?? null}
              confidence={reading?.pulse_confidence ?? 0}
              unit="bpm"
            />
          </div>
          <div className="vitals-metric">
            <span className="vitals-metric-label">
              <Wind size={15} /> Breathing
            </span>
            <MetricValue
              value={reading?.breathing_bpm ?? null}
              confidence={reading?.breathing_confidence ?? 0}
              unit="/min"
            />
          </div>
        </div>
      );
      break;
    case 'connecting':
      body = <p className="vitals-note">Connecting to vitals…</p>;
      break;
    case 'busy':
      body = <p className="vitals-note">Vitals is busy in another tab.</p>;
      break;
    case 'unavailable':
    case 'error':
      body = <p className="vitals-note">Vitals unavailable right now.</p>;
      break;
    case 'idle':
    default:
      body = <p className="vitals-note">Vitals appear during rest.</p>;
      break;
  }

  return (
    <section
      className={`panel vitals-panel${compact ? ' vitals-compact' : ''}`}
      aria-label="Vitals"
      data-testid="vitals-panel"
    >
      <span className="eyebrow vitals-eyebrow">
        <Activity size={13} /> Vitals
      </span>
      {body}
      {status === 'measuring' && (
        <p className="vitals-footnote">Face the camera and hold still. For wellness info only.</p>
      )}
    </section>
  );
}
