// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { VitalsPanel } from '../src/features/vitals/VitalsPanel';

afterEach(() => {
  cleanup();
});

const reading = (overrides = {}) => ({
  type: 'vitals' as const,
  pulse_bpm: 72,
  pulse_confidence: 90,
  breathing_bpm: 14,
  breathing_confidence: 80,
  ts: Date.now(),
  ...overrides,
});

describe('VitalsPanel', () => {
  it('shows real numbers when confidence is high', () => {
    render(<VitalsPanel status="measuring" reading={reading()} />);
    expect(screen.getByTestId('vitals-panel').textContent).toContain('72');
    expect(screen.getByTestId('vitals-panel').textContent).toContain('14');
    expect(screen.queryByText('Measuring…')).toBeNull();
  });

  it('shows Measuring… instead of numbers at zero confidence', () => {
    render(
      <VitalsPanel
        status="measuring"
        reading={reading({ pulse_bpm: null, pulse_confidence: 0, breathing_bpm: null, breathing_confidence: 0 })}
      />,
    );
    const panel = screen.getByTestId('vitals-panel');
    expect(panel.textContent).toContain('Measuring…');
    // No fabricated numbers: the raw values must not appear.
    expect(panel.textContent).not.toMatch(/\b72\b/);
    expect(panel.textContent).not.toMatch(/\b14\b/);
  });

  it('shows Measuring… for a metric that has no value yet', () => {
    render(
      <VitalsPanel status="measuring" reading={reading({ breathing_bpm: null, breathing_confidence: 0 })} />,
    );
    const panel = screen.getByTestId('vitals-panel');
    expect(panel.textContent).toContain('72'); // pulse confident
    expect(panel.textContent).toContain('Measuring…'); // breathing not yet
  });

  it('renders status states without numbers', () => {
    const { rerender } = render(<VitalsPanel status="connecting" reading={null} />);
    expect(screen.getByTestId('vitals-panel').textContent).toContain('Connecting');

    rerender(<VitalsPanel status="busy" reading={null} />);
    expect(screen.getByTestId('vitals-panel').textContent).toContain('busy');

    rerender(<VitalsPanel status="unavailable" reading={null} />);
    expect(screen.getByTestId('vitals-panel').textContent).toContain('unavailable');

    rerender(<VitalsPanel status="idle" reading={null} />);
    expect(screen.getByTestId('vitals-panel').textContent).toContain('during rest');
  });
});
