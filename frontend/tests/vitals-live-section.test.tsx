// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { VitalsLiveSection } from '../src/features/vitals/VitalsLiveSection';
import { GUARDIAN_PHRASES } from '../src/features/vitals/useVitalsGuardian';

afterEach(() => {
  cleanup();
});

const confidentReading = {
  type: 'vitals' as const,
  pulse_bpm: 142,
  pulse_confidence: 90,
  breathing_bpm: 18,
  breathing_confidence: 85,
  ts: Date.now(),
};

const lowConfidenceReading = {
  ...confidentReading,
  pulse_confidence: 10,
  breathing_confidence: 10,
};

describe('VitalsLiveSection', () => {
  it('renders nothing when the service is idle', () => {
    const { container } = render(
      <VitalsLiveSection status="idle" reading={null} guardian="idle" />,
    );
    expect(container.textContent).toBe('');
  });

  it('renders nothing when the service is unavailable', () => {
    const { container } = render(
      <VitalsLiveSection status="unavailable" reading={null} guardian="watching" />,
    );
    expect(container.textContent).toBe('');
  });

  it('shows live pulse and breathing while monitoring', () => {
    render(<VitalsLiveSection status="measuring" reading={confidentReading} guardian="watching" />);
    expect(screen.getByTestId('vitals-live-section')).toBeTruthy();
    expect(screen.getByTestId('vitals-live-pulse').textContent).toBe('142 bpm');
    expect(screen.getByTestId('vitals-live-breathing').textContent).toBe('18 /min');
    expect(screen.queryByTestId('vitals-live-alert')).toBeNull();
  });

  it('hides low-confidence values and shows a hint instead', () => {
    render(
      <VitalsLiveSection status="measuring" reading={lowConfidenceReading} guardian="watching" />,
    );
    expect(screen.getByTestId('vitals-live-pulse').textContent).toBe('—');
    expect(screen.getByText(/Keep your face in frame/i)).toBeTruthy();
  });

  it('shows the advisory message when the guardian is elevated', () => {
    render(<VitalsLiveSection status="measuring" reading={confidentReading} guardian="elevated" />);
    const alert = screen.getByTestId('vitals-live-alert');
    expect(alert.textContent).toContain(GUARDIAN_PHRASES.elevated);
    expect(alert.textContent).toContain('not medical advice');
  });

  it('shows a starting state while connecting', () => {
    render(<VitalsLiveSection status="connecting" reading={null} guardian="watching" />);
    expect(screen.getByTestId('vitals-live-section').textContent).toContain('Starting');
  });
});
