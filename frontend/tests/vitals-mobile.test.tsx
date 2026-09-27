// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MobileVitalsFlow } from '../src/features/vitals/MobileVitalsFlow';
import { VitalsPanel } from '../src/features/vitals/VitalsPanel';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const videoRef = { current: null };

describe('MobileVitalsFlow', () => {
  it('renders nothing when there is no rest', () => {
    const { container } = render(<MobileVitalsFlow videoRef={videoRef} restActive={false} />);
    expect(container.textContent).toBe('');
  });

  it('shows the Check vitals CTA during rest', () => {
    render(<MobileVitalsFlow videoRef={videoRef} restActive={true} />);
    expect(screen.getByTestId('mobile-vitals-cta')).toBeTruthy();
    expect(screen.getByText('Check vitals')).toBeTruthy();
  });

  it('tapping Check vitals starts the measuring view with a stop button', () => {
    render(<MobileVitalsFlow videoRef={videoRef} restActive={true} />);
    fireEvent.click(screen.getByText('Check vitals'));
    expect(screen.getByTestId('mobile-vitals-measuring')).toBeTruthy();
    expect(screen.getByText('Stop')).toBeTruthy();
    // The embedded panel is the compact pulse-first variant.
    expect(screen.getByTestId('vitals-panel').className).toContain('vitals-compact');
  });

  it('pulseOnly hides the breathing metric', () => {
    render(
      <VitalsPanel
        status="measuring"
        reading={{
          type: 'vitals',
          pulse_bpm: 72,
          pulse_confidence: 90,
          breathing_bpm: 14,
          breathing_confidence: 80,
          ts: Date.now(),
        }}
        pulseOnly
      />,
    );
    expect(screen.getByText('Pulse')).toBeTruthy();
    expect(screen.queryByText('Breathing')).toBeNull();
  });

  it('auto-stops after the 12s pulse window', () => {
    vi.useFakeTimers();
    render(<MobileVitalsFlow videoRef={videoRef} restActive={true} />);
    fireEvent.click(screen.getByText('Check vitals'));
    expect(screen.getByTestId('mobile-vitals-measuring')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(12_000);
    });
    expect(screen.getByTestId('mobile-vitals-cta')).toBeTruthy();
  });

  it('stops measuring when rest ends', () => {
    const { rerender } = render(<MobileVitalsFlow videoRef={videoRef} restActive={true} />);
    fireEvent.click(screen.getByText('Check vitals'));
    expect(screen.getByTestId('mobile-vitals-measuring')).toBeTruthy();
    rerender(<MobileVitalsFlow videoRef={videoRef} restActive={false} />);
    expect(screen.queryByTestId('mobile-vitals-measuring')).toBeNull();
  });
});
