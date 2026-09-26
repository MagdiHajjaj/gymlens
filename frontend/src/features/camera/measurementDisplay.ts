/**
 * Display helpers for the live measurement panel.
 *
 * A metric slot must show a real measurement or a clean "not measured" state —
 * never a raw placeholder string and never a non-finite value like "NaN°".
 */
export function formatMetricName(key: string): string {
  return key.replaceAll('_', ' ');
}

export function formatMetricValue(value: number): string {
  return Number.isFinite(value) ? `${value}°` : 'Not measured';
}

/**
 * Tracking status wording. Kept deliberately distinct from metric values so it
 * can never be misread as a measurement for a metric slot.
 */
export function trackingStatusText(trackingValid: boolean): string {
  return trackingValid ? 'Tracking landmarks' : 'Acquiring landmarks';
}
