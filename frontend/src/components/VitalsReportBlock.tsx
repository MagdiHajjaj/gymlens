import { HeartPulse } from 'lucide-react';
import type { MetricSample } from '../types/workout';

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Session-report vitals block. Reads the persisted vitals.* metric
 * samples and shows rest-period averages. Only confident readings are
 * ever persisted, so anything shown here was a real measurement.
 * Renders nothing when the session has no vitals.
 */
export function VitalsReportBlock({ metrics }: { metrics: MetricSample[] }) {
  const pulse = metrics
    .filter((m) => m.metric_name === 'vitals.pulse_bpm')
    .map((m) => m.metric_value);
  const breathing = metrics
    .filter((m) => m.metric_name === 'vitals.breathing_bpm')
    .map((m) => m.metric_value);

  const avgPulse = average(pulse);
  const avgBreathing = average(breathing);
  if (avgPulse == null && avgBreathing == null) return null;

  return (
    <section className="panel report-vitals" aria-label="Vitals">
      <h2>
        <HeartPulse size={16} /> Vitals during rest
      </h2>
      <div className="report-vitals-grid">
        {avgPulse != null && (
          <div>
            <span>Avg pulse</span>
            <strong>{Math.round(avgPulse)} bpm</strong>
          </div>
        )}
        {avgBreathing != null && (
          <div>
            <span>Avg breathing</span>
            <strong>{Math.round(avgBreathing)} /min</strong>
          </div>
        )}
      </div>
      <p className="report-note">
        Contactless camera estimates from rest periods. For wellness info only, not medical data.
      </p>
    </section>
  );
}
