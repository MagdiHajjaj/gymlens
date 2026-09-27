import { useEffect, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { VitalsPanel } from './VitalsPanel';
import { useVitalsSession } from './useVitalsSession';
import { Button } from '../../components/ui/button';
import './vitals.css';

const MEASURE_SECONDS = 12; // pulse needs ~12s

/**
 * Mobile rest-period vitals flow: pulse-first, battery-friendly.
 *
 * iOS Safari allows a single camera, so there is no separate capture —
 * the user taps "Check vitals", faces the front camera, and holds still
 * for ~12s while pulse is measured at a reduced frame rate. Breathing
 * is hidden on mobile (it needs ~30s of stability).
 */
export function MobileVitalsFlow({
  videoRef,
  restActive,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  restActive: boolean;
}) {
  const [checking, setChecking] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(MEASURE_SECONDS);

  const vitals = useVitalsSession({
    videoRef,
    active: checking && restActive,
    frameWidth: 240, // smaller frames: less battery/thermal load
    frameIntervalMs: 200, // 5fps is plenty for pulse
  });

  // Auto-stop after the pulse window.
  useEffect(() => {
    if (!checking) return;
    setSecondsLeft(MEASURE_SECONDS);
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          setChecking(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [checking]);

  // Rest ended mid-measurement: stop.
  useEffect(() => {
    if (!restActive) setChecking(false);
  }, [restActive]);

  if (!restActive) return null;

  if (!checking) {
    return (
      <div className="mobile-vitals-cta" data-testid="mobile-vitals-cta">
        <Button onClick={() => setChecking(true)}>
          <HeartPulse size={16} /> Check vitals
        </Button>
        <p>Face the camera and hold still for {MEASURE_SECONDS}s.</p>
      </div>
    );
  }

  return (
    <div className="mobile-vitals-measuring" data-testid="mobile-vitals-measuring">
      <VitalsPanel status={vitals.status} reading={vitals.reading} compact pulseOnly />
      <p className="vitals-note" role="timer" aria-label={`${secondsLeft} seconds left`}>
        {secondsLeft > 0 ? `${secondsLeft}s — hold still…` : 'Done.'}
      </p>
      <Button variant="ghost" size="small" onClick={() => setChecking(false)}>
        Stop
      </Button>
    </div>
  );
}
