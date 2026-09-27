// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { VitalsReportBlock } from '../src/components/VitalsReportBlock';

afterEach(() => {
  cleanup();
});

const sample = (metric_name: string, metric_value: number) => ({
  recorded_at: new Date().toISOString(),
  metric_name,
  metric_value,
});

describe('VitalsReportBlock', () => {
  it('renders nothing without vitals metrics', () => {
    const { container } = render(
      <VitalsReportBlock metrics={[sample('knee_angle', 90)]} />,
    );
    expect(container.textContent).toBe('');
  });

  it('shows average pulse and breathing', () => {
    render(
      <VitalsReportBlock
        metrics={[
          sample('vitals.pulse_bpm', 70),
          sample('vitals.pulse_bpm', 74),
          sample('vitals.breathing_bpm', 14),
          sample('vitals.breathing_bpm', 16),
        ]}
      />,
    );
    const block = screen.getByLabelText('Vitals');
    expect(block.textContent).toContain('72 bpm'); // avg of 70, 74
    expect(block.textContent).toContain('15 /min'); // avg of 14, 16
    expect(block.textContent).toContain('wellness info only');
  });

  it('shows pulse alone when breathing was never measured', () => {
    render(<VitalsReportBlock metrics={[sample('vitals.pulse_bpm', 68)]} />);
    const block = screen.getByLabelText('Vitals');
    expect(block.textContent).toContain('68 bpm');
    expect(block.textContent).not.toContain('breathing');
  });
});
