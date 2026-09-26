import { describe, expect, it } from 'vitest';
import {
  formatMetricName,
  formatMetricValue,
  trackingStatusText,
} from '../src/features/camera/measurementDisplay';

describe('measurement display', () => {
  it('formats finite metric values as degrees', () => {
    expect(formatMetricValue(92)).toBe('92°');
    expect(formatMetricValue(0)).toBe('0°');
  });

  it('shows a clean not-measured state for non-finite values, never NaN°', () => {
    expect(formatMetricValue(NaN)).toBe('Not measured');
    expect(formatMetricValue(Infinity)).toBe('Not measured');
    expect(formatMetricValue(NaN)).not.toContain('NaN');
  });

  it('humanizes metric keys', () => {
    expect(formatMetricName('torso_lean')).toBe('torso lean');
    expect(formatMetricName('min_angle')).toBe('min angle');
  });

  it('uses tracking status wording that cannot be mistaken for a metric value', () => {
    expect(trackingStatusText(true)).toBe('Tracking landmarks');
    expect(trackingStatusText(false)).toBe('Acquiring landmarks');
    expect(trackingStatusText(true)).not.toContain('Required landmarks');
    expect(trackingStatusText(false)).not.toContain('Required landmarks');
  });
});
