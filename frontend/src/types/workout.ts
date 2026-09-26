export type ExerciseId = 'squat' | 'curl' | 'pushup';
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
export interface WorkoutSession {
  id: string;
  exercise: ExerciseId;
  started_at: string;
  ended_at?: string;
  total_reps: number;
  status: 'active' | 'completed';
  source: 'camera' | 'demo';
  reps: RepEvent[];
  metrics: MetricSample[];
  insight?: Insight | null;
  local?: boolean;
  synced_id?: string;
}
