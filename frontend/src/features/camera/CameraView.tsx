import { useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { createPoseEngine } from '../pose/PoseEngine';
import { PoseStabilizer } from '../pose/PoseStabilizer';
import { createAnalyzer } from '../exercises/ExerciseRegistry';
import { drawSkeleton } from './SkeletonOverlay';
import { FeedbackEngine } from '../coaching/FeedbackEngine';
import { VoiceCoach } from '../coaching/VoiceCoach';
import { useWorkout } from '../workout/workoutStore';
import { useIdentity } from '../auth/AuthProvider';
import { Button } from '../../components/ui/button';
import type { ExerciseResult, PoseFrame } from '../../types/workout';

const cameraErrors: Record<string, string> = {
  NotAllowedError:
    'Camera access was blocked. Allow camera access in your browser’s address bar, then try again.',
  NotFoundError: 'No camera was found. Connect a webcam or try the landmark demo.',
  NotReadableError: 'Your camera is busy or unavailable. Close other apps using it, then try again.',
  OverconstrainedError: 'Your camera does not support this configuration. Try another camera or the demo.',
};
export function CameraView({ onDemo, voiceCoach }: { onDemo: () => void; voiceCoach: VoiceCoach }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const session = useWorkout((s) => s.session)!;
  const paused = useWorkout((s) => s.paused);
  const { authenticated } = useIdentity();
  const [status, setStatus] = useState('Preparing your session…');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false,
      raf = 0,
      stream: MediaStream | undefined,
      engine: Awaited<ReturnType<typeof createPoseEngine>> | undefined;
    let lastTime = -1,
      lastInference = -1,
      lastUi = -1,
      wasPaused = false;
    const analyzer = createAnalyzer(session.exercise),
      stabilizer = new PoseStabilizer(),
      feedback = new FeedbackEngine(),
      voice = voiceCoach;
    const demo = session.source === 'demo';
    let displayResult: ExerciseResult | undefined;
    let demoLandmarks: PoseFrame['landmarks'] = [];
    async function start() {
      setError('');
      setStatus(demo ? 'Loading landmark replay…' : 'Requesting camera access…');
      let frames: PoseFrame[] = [];
      try {
        if (demo) {
          const response = await fetch(`/exercises/${session.exercise}.json`);
          if (!response.ok) throw new Error('Demo sequence could not load. Refresh and try again.');
          frames = await response.json();
        } else {
          if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
            throw new Error('Camera access needs HTTPS or localhost. You can still use the landmark demo.');
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: false,
          });
          if (disposed) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          video.current!.srcObject = stream;
          await video.current!.play();
          setStatus('Loading the local pose model…');
          try {
            engine = await createPoseEngine();
          } catch {
            throw new Error(
              'The pose model or WASM could not initialize. Run npm run setup, refresh, or use the landmark demo.',
            );
          }
        }
        if (disposed) {
          engine?.close();
          stream?.getTracks().forEach((t) => t.stop());
          return;
        }
        setStatus('ready');
        let demoTime = 0,
          previousTick = performance.now();
        function tick(now: number) {
          if (disposed) return;
          const state = useWorkout.getState();
          // The first RAF timestamp can predate setup within the same browser frame.
          const dt = Math.max(0, now - previousTick);
          previousTick = now;
          if (state.paused) {
            if (!wasPaused) {
              analyzer.reset();
              stabilizer.reset();
              displayResult = undefined;
              feedback.reset();
              voice.stop();
            }
            wasPaused = true;
            raf = requestAnimationFrame(safeTick);
            return;
          }
          wasPaused = false;
          if (!state.voice) voice.stop();
          demoTime += dt;
          if (now - lastInference >= 50) {
            lastInference = now;
            let frame: PoseFrame | undefined;
            if (demo) {
              const sequenceTime = demoTime % (frames[frames.length - 1].timestampMs + 50);
              const index = Math.min(frames.length - 1, Math.floor(sequenceTime / 50));
              frame = { ...frames[index], timestampMs: now };
              if (canvas.current!.width !== 720) canvas.current!.width = 720;
              if (canvas.current!.height !== 720) canvas.current!.height = 720;
            } else if (
              video.current &&
              video.current.readyState >= 2 &&
              video.current.currentTime !== lastTime
            ) {
              lastTime = video.current.currentTime;
              const detected = engine!.detectForVideo(video.current, now);
              frame = {
                timestampMs: now,
                landmarks: detected.landmarks[0] || [],
                worldLandmarks: detected.worldLandmarks[0] || [],
                aspectRatio: video.current.videoWidth / video.current.videoHeight,
              };
              if (canvas.current!.width !== video.current.videoWidth)
                canvas.current!.width = video.current.videoWidth;
              if (canvas.current!.height !== video.current.videoHeight)
                canvas.current!.height = video.current.videoHeight;
            }
            if (frame) {
              const measured = demo ? frame : stabilizer.update(frame);
              const result = analyzer.analyze(measured);
              displayResult = { ...result, trackedSide: result.trackedSide ?? displayResult?.trackedSide };
              if (demo) demoLandmarks = frame.landmarks;
              if (result.repCompleted || now - lastUi >= 100) {
                state.ingest(result, now);
                lastUi = now;
              }
              if (state.voice) {
                const message = feedback.next(result, now);
                if (message)
                  void voice.speak(message, authenticated && result.trackingValid && result.calibrated);
              } else feedback.reset();
            }
          }
          drawSkeleton(
            canvas.current!,
            demo ? demoLandmarks : stabilizer.render(now),
            demo,
            displayResult?.trackingValid ?? false,
            session.exercise,
            displayResult,
          );
          raf = requestAnimationFrame(safeTick);
        }
        const safeTick = (now: number) => {
          try {
            tick(now);
          } catch {
            setError('Pose tracking stopped unexpectedly. Retry the camera or use the landmark demo.');
            stream?.getTracks().forEach((t) => t.stop());
          }
        };
        raf = requestAnimationFrame(safeTick);
      } catch (e) {
        stream?.getTracks().forEach((t) => t.stop());
        if (!disposed)
          setError(
            e instanceof Error ? cameraErrors[e.name] || e.message : 'Camera could not start. Try the demo.',
          );
      }
    }
    void start();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      engine?.close();
      voice.stop();
    };
  }, [session.id, session.exercise, session.source, authenticated, attempt, voiceCoach]);
  return (
    <div
      className={`camera-stage ${session.source === 'demo' ? 'is-demo' : ''}`}
      data-status={error ? 'error' : status}
    >
      <video ref={video} muted playsInline aria-label="Your private webcam feed" />
      <canvas ref={canvas} aria-label="Movement skeleton overlay" />
      <div className="camera-top">
        <span className="camera-badge">
          <span className="live-dot" />
          {session.source === 'demo' ? 'LANDMARK REPLAY' : 'LIVE CAMERA'}
        </span>
        <span className="camera-badge">
          <ShieldCheck size={13} /> ON-DEVICE
        </span>
      </div>
      {status !== 'ready' && !error && (
        <div className="camera-message">
          <LoaderCircle className="spin" size={28} />
          <h3>{status}</h3>
          <p>Your video stays in your browser.</p>
        </div>
      )}
      {error && (
        <div className="camera-message">
          <Camera size={32} />
          <h3>Let’s get you in frame</h3>
          <p role="alert">{error}</p>
          <div className="button-row">
            <Button onClick={() => setAttempt((a) => a + 1)}>
              <RotateCcw size={16} /> Try again
            </Button>
            <Button variant="secondary" onClick={onDemo}>
              Try landmark demo
            </Button>
          </div>
        </div>
      )}
      {paused && !error && (
        <div className="camera-message paused-overlay">
          <h3>Take a breath.</h3>
          <p>Your session is paused. Resume when you’re ready.</p>
        </div>
      )}
      <div className="camera-bottom">
        <span>
          {session.source === 'demo'
            ? 'Synthetic movement · no camera required'
            : session.exercise === 'curl'
              ? 'Keep shoulder, elbow, and wrist in view'
              : 'Side view · keep your full movement in frame'}
        </span>
        <span>GYM LENS</span>
      </div>
    </div>
  );
}
