import { MovementAnalyzer } from './ExerciseAnalyzer';
import type { ExerciseId } from '../../types/workout';
export const exercises = {
  squat: {
    name: 'Squat',
    category: 'LOWER BODY',
    subtitle: 'Build a stronger foundation',
    muscles: 'Quads · Glutes · Core',
    setup: 'Stand side-on, 2–3 metres from your camera. Keep your head and feet in view.',
    checks: 'Depth & torso position',
    color: 'sage',
  },
  curl: {
    name: 'Bicep curl',
    category: 'UPPER BODY',
    subtitle: 'Make every curl count',
    muscles: 'Biceps · Forearms',
    setup: 'Stand side-on with your shoulder, elbow, and wrist visible. Begin with your arm extended.',
    checks: 'Range & upper-arm position',
    color: 'peach',
  },
  pushup: {
    name: 'Push-up',
    category: 'FULL BODY',
    subtitle: 'Strength from the ground up',
    muscles: 'Chest · Triceps · Core',
    setup: 'Place your camera low and side-on. Begin in a plank with your full body visible.',
    checks: 'Range & hip alignment',
    color: 'lavender',
  },
} as const;
export const createAnalyzer = (id: ExerciseId) => new MovementAnalyzer(id);
