import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, LoaderCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { createPoseEngine } from '../pose/PoseEngine';
import { PoseStabilizer } from '../pose/PoseStabilizer';
import { createAnalyzer } from '../exercises/ExerciseRegistry';
import { drawSkeleton } from './SkeletonOverlay';
import { DEMO_CLIPS, DEMO_VIDEO_EXTENSIONS } from './demoClips';
import { FeedbackEngine, predictNextRepCues } from '../coaching/FeedbackEngine';
import { selectedExerciseWarmPhrases } from '../coaching/Phrasebook';
import { VoiceCoach } from '../coaching/VoiceCoach';
import { useWorkout } from '../workout/workoutStore';
import { useIdentity } from '../auth/AuthProvider';
import { Button } from '../../components/ui/button';
import type { ExerciseResult, PoseFrame } from '../../types/workout';

const cameraErrors: Record<string, string> = {
  NotAllowedError:
    'Camera access was blocked. Allow camera access in your browser’s address bar, then try again.',
  NotFoundError: 'No camera was found. Connect a webcam or try the video demo.',
  NotReadableError: 'Your camera is busy or unavailable. Close other apps using it, then try again.',
  OverconstrainedError: 'Your camera does not support this configuration. Try another camera or the demo.',
};
export interface CameraReadiness {
  cameraReady: boolean;
  trackingValid: boolean;
  calibrated: boolean;
  guidance: string;
}

export function CameraView({
  onDemo,
  voiceCoach,
  videoFile,
  onFinish,
  preview = false,
  onReadiness,
  videoRef,
}: {
  onDemo: () => void;
  voiceCoach: VoiceCoach;
  /** An uploaded workout video to analyze instead of the live webcam. */
  videoFile?: File | null;
  onFinish?: () => void;
  preview?: boolean;
  onReadiness?: (readiness: CameraReadiness) => void;
  /** Optional external ref to the <video> element (used by vitals frame capture). */
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}) {
  const internalVideo = useRef<HTMLVideoElement>(null);
  const video = videoRef ?? internalVideo;
  const canvas = useRef<HTMLCanvasElement>(null);
  const storedSession = useWorkout((s) => s.session);
  const selected = useWorkout((s) => s.selected);
  const session = preview
    ? { id: 'preview', exercise: selected, source: 'camera' as const, preCalibrated: false }
    : storedSession!;
  const storedPaused = useWorkout((s) => s.paused);
  const paused = !preview && storedPaused;
  const { authenticated } = useIdentity();
  const [status, setStatus] = useState('Preparing your session…');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [videoEnded, setVideoEnded] = useState(false);
  useEffect(() => {
    let disposed = false,
      raf = 0,
      stream: MediaStream | undefined,
      fileUrl: string | undefined,
      engine: Awaited<ReturnType<typeof createPoseEngine>> | undefined;
    let lastTime = -1,
      lastInference = -1,
      lastUi = -1,
      wasPaused = false;
    const analyzer = createAnalyzer(session.exercise, session.preCalibrated ?? false),
      stabilizer = new PoseStabilizer(),
      feedback = new FeedbackEngine(),
      voice = voiceCoach;
    const demo = session.source === 'demo';
    const upload = session.source === 'upload';
    // ?synthetic=1 keeps the deterministic landmark replay for e2e tests.
    // Real users get the video demo: sample footage with live pose analysis.
    const syntheticDemo =
      demo && new URLSearchParams(window.location.search).get('synthetic') === '1';
    let displayResult: ExerciseResult | undefined;
    let demoLandmarks: PoseFrame['landmarks'] = [];
    let warmedVoice = false;
    async function start() {
      setError('');
      onReadiness?.({
        cameraReady: false,
        trackingValid: false,
        calibrated: false,
        guidance: 'Enable your camera to check your position.',
      });
      setVideoEnded(false);
      setStatus(
        syntheticDemo
          ? 'Loading landmark replay…'
          : demo
            ? 'Loading demo video…'
            : upload
              ? 'Loading your video…'
              : 'Requesting camera access…',
      );
      let frames: PoseFrame[] = [];
      try {
        if (syntheticDemo) {
          const response = await fetch(`/exercises/${session.exercise}.json`);
          if (!response.ok) throw new Error('Demo sequence could not load. Refresh and try again.');
          frames = await response.json();
        } else if (demo) {
          const player = video.current!;
          fileUrl = '';
          player.srcObject = null;
          const ext = DEMO_VIDEO_EXTENSIONS[session.exercise] ?? 'mp4';
          player.src = `/exercises/videos/${session.exercise}.${ext}`;
          player.loop = false;
          const clip = DEMO_CLIPS[session.exercise];
          await new Promise<void>((resolve, reject) => {
            player.onloadeddata = () => resolve();
            player.onerror = () =>
              reject(new Error('The demo video could not load. Check your connection and try again.'));
          });
          if (clip) {
            try {
              player.currentTime = clip.start;
            } catch {
              /* some browsers need a tick before seeking; the RAF loop corrects it */
            }
          }
          setStatus('Loading the local pose model…');
          try {
            engine = await createPoseEngine();
          } catch {
            throw new Error('The pose model or WASM could not initialize. Run npm run setup, then refresh.');
          }
          if (!disposed) await player.play();
        } else if (upload) {
          if (!videoFile) throw new Error('Choose a video file to analyze.');
          const player = video.current!;
          fileUrl = URL.createObjectURL(videoFile);
          player.srcObject = null;
          player.src = fileUrl;
          player.loop = false;
          player.onended = () => setVideoEnded(true);
          await new Promise<void>((resolve, reject) => {
            player.onloadeddata = () => resolve();
            player.onerror = () =>
              reject(
                new Error('This video format isn’t supported. Try an MP4 or MOV recorded on your phone.'),
              );
          });
          setStatus('Loading the local pose model…');
          try {
            engine = await createPoseEngine();
          } catch {
            throw new Error('The pose model or WASM could not initialize. Run npm run setup, then refresh.');
          }
          if (!disposed) await player.play();
        } else {
          if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
            throw new Error('Camera access needs HTTPS or localhost. You can still try the video demo.');
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
              'The pose model or WASM could not initialize. Run npm run setup, refresh, or try the video demo.',
            );
          }
        }
        if (disposed) {
          engine?.close();
          stream?.getTracks().forEach((t) => t.stop());
          return;
        }
        setStatus('ready');
        onReadiness?.({
          cameraReady: true,
          trackingValid: false,
          calibrated: false,
          guidance: 'Move into frame and hold your starting position.',
        });
        let demoTime = 0,
          previousTick = performance.now();
        function tick(now: number) {
          if (disposed) return;
          const state = useWorkout.getState();
          // The first RAF timestamp can predate setup within the same browser frame.
          const dt = Math.max(0, now - previousTick);
          previousTick = now;
          if ((upload || demo) && video.current) {
            if (state.paused && !video.current.paused) video.current.pause();
            else if (!state.paused && video.current.paused && !video.current.ended) {
              void video.current.play().catch((error: unknown) => {
                if (!disposed && !(error instanceof DOMException && error.name === 'AbortError'))
                  setError('Video playback could not resume. Retry the video demo.');
              });
            }
          }
          if (!preview && (state.paused || state.rest)) {
            if (!wasPaused) {
              analyzer.reset();
              stabilizer.reset();
              displayResult = undefined;
              feedback.reset();
              if (state.paused && state.session?.status === 'active') voice.stop();
            }
            wasPaused = true;
            raf = requestAnimationFrame(safeTick);
            return;
          }
          wasPaused = false;
          if (!state.voice) voice.stop();
          demoTime += dt;
          if (demo && !syntheticDemo && video.current && video.current.readyState >= 1) {
            // Loop the good segment of the stock clip (skip dead intros/outros).
            const clip = DEMO_CLIPS[session.exercise];
            const start = clip?.start ?? 0;
            const end = clip?.end ?? video.current.duration;
            if (!video.current.seeking && Number.isFinite(end) && end > start) {
              const t = video.current.currentTime;
              if (t >= end || t < start) video.current.currentTime = start;
            }
          }
          if (now - lastInference >= 50) {
            lastInference = now;
            let frame: PoseFrame | undefined;
            if (syntheticDemo) {
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
              const measured = syntheticDemo ? frame : stabilizer.update(frame);
              const result = analyzer.analyze(measured);
              displayResult = { ...result, trackedSide: result.trackedSide ?? displayResult?.trackedSide };
              if (syntheticDemo) demoLandmarks = frame.landmarks;
              if (result.repCompleted || now - lastUi >= 100) {
                if (preview) {
                  onReadiness?.({
                    cameraReady: true,
                    trackingValid: result.trackingValid,
                    calibrated: result.calibrated,
                    guidance: result.guidance,
                  });
                } else state.ingest(result, now);
                lastUi = now;
              }
              if (!preview && state.voice) {
                if (authenticated && !warmedVoice) {
                  warmedVoice = true;
                  void voice.warmPhrases(selectedExerciseWarmPhrases(session.exercise), true);
                }
                const totalReps = useWorkout.getState().session?.total_reps ?? state.session?.total_reps ?? 0;
                const setStart = useWorkout.getState().currentSetStartRep;
                const setReps = Math.max(0, totalReps - setStart + 1);
                const cue = feedback.nextCue(result, now, {
                  exercise: session.exercise,
                  totalReps,
                  setReps,
                });
                if (cue)
                  void voice.speak(cue.text, authenticated, {
                    priority: cue.priority,
                  });
                if (result.repCompleted) {
                  // Speculatively pre-generate the next rep's most likely cue
                  // audio while the user starts the next rep, so it plays
                  // instantly on completion instead of after a cloud round trip.
                  // A missed prediction only costs a silent cache entry.
                  predictNextRepCues(result, {
                    exercise: session.exercise,
                    nextSetReps: setReps + 1,
                  }).forEach((text) => voice.prefetch(text, authenticated));
                }
              } else {
                warmedVoice = false;
                feedback.reset();
              }
            }
          }
          drawSkeleton(
            canvas.current!,
            syntheticDemo ? demoLandmarks : stabilizer.render(now),
            syntheticDemo,
            displayResult?.trackingValid ?? false,
            session.exercise,
            displayResult,
            !demo && !upload,
          );
          raf = requestAnimationFrame(safeTick);
        }
        const safeTick = (now: number) => {
          try {
            tick(now);
          } catch {
            setError('Pose tracking stopped unexpectedly. Retry the camera or try the video demo.');
            onReadiness?.({
              cameraReady: false,
              trackingValid: false,
              calibrated: false,
              guidance: 'Tracking stopped. Try the camera again.',
            });
            stream?.getTracks().forEach((t) => t.stop());
          }
        };
        raf = requestAnimationFrame(safeTick);
      } catch (e) {
        stream?.getTracks().forEach((t) => t.stop());
        if (!disposed)
          onReadiness?.({
            cameraReady: false,
            trackingValid: false,
            calibrated: false,
            guidance: 'Camera unavailable. Follow the instructions in the preview.',
          });
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
      if (video.current) {
        video.current.onended = null;
        video.current.pause();
        video.current.removeAttribute('src');
      }
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [
    session.id,
    session.exercise,
    session.source,
    authenticated,
    attempt,
    voiceCoach,
    videoFile,
    preview,
    onReadiness,
  ]);
  return (
    <div
      className={`camera-stage ${session.source === 'demo' ? 'is-demo' : ''} ${session.source === 'upload' ? 'is-upload' : ''}`}
      data-status={error ? 'error' : status}
    >
      <video
        ref={video}
        muted
        playsInline
        aria-label={
          session.source === 'upload'
            ? 'Your uploaded workout video'
            : session.source === 'demo'
              ? 'Sample exercise video'
              : 'Your private webcam feed'
        }
      />
      <canvas ref={canvas} aria-label="Movement skeleton overlay" />
      <div className="camera-top">
        <span className="camera-badge">
          <span className="live-dot" />
          {preview
            ? 'CAMERA PREVIEW'
            : session.source === 'demo'
              ? 'VIDEO DEMO'
              : session.source === 'upload'
                ? 'VIDEO ANALYSIS'
                : 'LIVE CAMERA'}
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
              Try the video demo
            </Button>
          </div>
        </div>
      )}
      {videoEnded && !error && (
        <div className="camera-message">
          <CheckCircle2 size={32} />
          <h3>Video analyzed.</h3>
          <p>Every rep has been counted and checked.</p>
          <div className="button-row">{onFinish && <Button onClick={onFinish}>See my report</Button>}</div>
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
            ? 'Sample footage · analyzed on your device'
            : session.source === 'upload'
              ? 'Uploaded video · analyzed on your device'
              : session.exercise === 'curl'
                ? 'Keep shoulder, elbow, and wrist in view'
                : 'Side view · keep your full movement in frame'}
        </span>
        <span>GYMLENS</span>
      </div>
    </div>
  );
}
