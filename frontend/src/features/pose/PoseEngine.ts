import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
export async function createPoseEngine() {
  const files = await FilesetResolver.forVisionTasks('/wasm');
  const base = {
    runningMode: 'VIDEO' as const,
    numPoses: 1,
    minPoseDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
    minPosePresenceConfidence: 0.6,
  };
  try {
    return await PoseLandmarker.createFromOptions(files, {
      ...base,
      baseOptions: { modelAssetPath: '/models/pose_landmarker_full.task', delegate: 'GPU' },
    });
  } catch {
    return PoseLandmarker.createFromOptions(files, {
      ...base,
      baseOptions: { modelAssetPath: '/models/pose_landmarker_full.task', delegate: 'CPU' },
    });
  }
}
