export type ExerciseId =
  'squat' | 'curl' | 'pushup' | 'deadlift' | 'lunge' | 'press' | 'glute_bridge' | 'row' | 'dips' | 'pullup';
export type MovementPhase = 'ready' | 'eccentric' | 'concentric';
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}
export interface PoseFrame {
  timestampMs: number;
  landmarks: Landmark[];
  aspectRatio?: number;
  worldLandmarks?: Landmark[];
}
export interface FormFault {
  code: string;
  message: string;
  severity: 'info' | 'warning';
}
export interface ExerciseResult {
  phase: MovementPhase;
  trackingValid: boolean;
  calibrated: boolean;
  repCompleted: boolean;
  jointAngles: Record<string, number>;
  faults: FormFault[];
  guidance: string;
  repMetrics?: Record<string, number>;
  trackedSide?: number;
  arms?: {
    side: number;
    angle?: number;
    trackingValid: boolean;
    calibrated: boolean;
    phase: MovementPhase;
  }[];
  completedReps?: { metrics: Record<string, number>; faults: FormFault[] }[];
}
export interface RepEvent {
  rep_number: number;
  completed_at: string;
  metrics_json: Record<string, number>;
  faults_json: FormFault[];
}
export interface MetricSample {
  recorded_at: string;
  metric_name: string;
  metric_value: number;
}
export interface Insight {
  recap: string;
  strengths: string[];
  improvements: string[];
  next_focus: string;
  source: 'gemini' | 'statistics';
}
export interface WorkoutSetRange {
  set_number: number;
  start_rep: number;
  end_rep: number;
  completed_at: string;
  rest_seconds?: number;
}
export interface WorkoutSession {
  id: string;
  /** Shared by every exercise performed as part of the same workout plan. */
  workout_id?: string;
  exercise: ExerciseId;
  started_at: string;
  ended_at?: string;
  total_reps: number;
  status: 'active' | 'completed';
  source: 'camera' | 'demo' | 'upload';
  reps: RepEvent[];
  metrics: MetricSample[];
  set_ranges?: WorkoutSetRange[];
  insight?: Insight | null;
  local?: boolean;
  synced_id?: string;
  /**
   * The session started from an already-calibrated camera preview, so its
   * analyzer skips the hold-still calibration. Never persisted: it only
   * describes how this live session began.
   */
  preCalibrated?: boolean;
}

// The account history endpoint omits rep/metric details; browser copies may
// include them. Fetch a session report before treating a summary as full data.
export type WorkoutHistoryEntry = Omit<WorkoutSession, 'reps' | 'metrics'> &
  Partial<Pick<WorkoutSession, 'reps' | 'metrics'>>;
