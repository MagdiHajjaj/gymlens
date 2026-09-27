import type { ExerciseId } from '../../types/workout';

export interface RangeGuidance {
  label: string;
  target: string;
  explanation: string;
  inTarget: (angle: number) => boolean;
}

const guidance: Partial<Record<ExerciseId, RangeGuidance>> = {
  curl: {
    label: 'Elbow bend at the top',
    target: '45–70°',
    explanation:
      'A smaller angle means more elbow bend. Use this comfortable tracker range as a camera reference, not a requirement to force the movement.',
    inTarget: (angle) => angle >= 45 && angle <= 70,
  },
};

export const rangeGuidance = (exercise: ExerciseId) => guidance[exercise];

