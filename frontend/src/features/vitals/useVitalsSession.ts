import { useCallback, useEffect, useRef, useState } from 'react';
import { VitalsClient, type VitalsReading, type VitalsStatus, type VitalsValidation } from './vitalsClient';
import { FrameGrabber } from './frameGrabber';

export interface VitalsSessionState {
  status: VitalsStatus;
  reading: VitalsReading | null;
  validation: VitalsValidation | null;
  error: string | null;
}

export interface UseVitalsSessionOptions {
  /** Video element to grab frames from. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Whether the session should be actively measuring. */
  active: boolean;
  /** Frame width in px (default 320). */
  frameWidth?: number;
  /** ms between frames (default 100 ≈ 10fps). */
  frameIntervalMs?: number;
  /** Called with each new reading (for persistence, PR4). */
  onReading?: (reading: VitalsReading) => void;
}

/**
 * Owns the vitals WebSocket session and the frame-capture loop.
 * When `active` turns true it connects and starts sending frames;
 * when false (or unmounted) it stops and releases the session.
 * Failures are contained: status becomes 'unavailable' and the
 * workout is unaffected.
 */
export function useVitalsSession({
  videoRef,
  active,
  frameWidth = 320,
  frameIntervalMs = 100,
  onReading,
}: UseVitalsSessionOptions): VitalsSessionState {
  const [status, setStatus] = useState<VitalsStatus>('idle');
  const [reading, setReading] = useState<VitalsReading | null>(null);
  const [validation, setValidation] = useState<VitalsValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<VitalsClient | null>(null);
  const grabberRef = useRef<FrameGrabber | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onReadingRef = useRef(onReading);
  onReadingRef.current = onReading;

  const stopLoop = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    stopLoop();
    clientRef.current?.stop();
    clientRef.current = null;
    grabberRef.current?.dispose();
    grabberRef.current = null;
  }, [stopLoop]);

  useEffect(() => {
    if (!active) {
      teardown();
      setStatus('idle');
      return;
    }
    setError(null);
    const client = new VitalsClient(undefined, {
      onStatus: setStatus,
      onReading: (r) => {
        setReading(r);
        onReadingRef.current?.(r);
      },
      onValidation: setValidation,
      onError: (message) => setError(message),
    });
    clientRef.current = client;
    let cancelled = false;

    void client.start().then((result) => {
      if (cancelled) {
        client.stop();
        return;
      }
      if (result !== 'ready') return; // busy / unavailable: panel shows the state
      const grabber = new FrameGrabber({ width: frameWidth });
      grabberRef.current = grabber;
      timerRef.current = setInterval(() => {
        const video = videoRef.current;
        if (!video) return;
        const frame = grabber.grab(video);
        if (frame) client.sendFrame(frame);
      }, frameIntervalMs);
    });

    return () => {
      cancelled = true;
      teardown();
    };
  }, [active, frameWidth, frameIntervalMs, videoRef, teardown, stopLoop]);

  // Final cleanup on unmount.
  useEffect(() => teardown, [teardown]);

  return { status, reading, validation, error };
}
