import { MovementAnalyzer } from './ExerciseAnalyzer';
import { CurlAnalyzer } from './CurlAnalyzer';
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
    setup:
      'Face the camera with both shoulders, elbows, and wrists in view. Begin with your arms comfortably straight. Curl together or alternate; each arm counts independently.',
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
  deadlift: {
    name: 'Romanian deadlift',
    category: 'LOWER BODY',
    subtitle: 'Hinge with control',
    muscles: 'Hamstrings · Glutes · Back',
    setup:
      'Stand side-on, 2–3 metres from your camera. Start tall, then hinge at the hips keeping your back flat.',
    checks: 'Hinge depth & back position',
    color: 'sky',
  },
  lunge: {
    name: 'Lunge',
    category: 'LOWER BODY',
    subtitle: 'Own every step down',
    muscles: 'Quads · Glutes · Core',
    setup:
      'Stand side-on, 2–3 metres from your camera. Step forward and lower until your front thigh is near parallel.',
    checks: 'Depth & knee position',
    color: 'mint',
  },
  press: {
    name: 'Overhead press',
    category: 'UPPER BODY',
    subtitle: 'Press with a braced core',
    muscles: 'Shoulders · Triceps · Core',
    setup:
      'Stand side-on with your full arm path visible. Begin with your arms extended overhead.',
    checks: 'Range & back position',
    color: 'rose',
  },
} as const;
export const createAnalyzer = (id: ExerciseId) =>
  id === 'curl' ? new CurlAnalyzer() : new MovementAnalyzer(id);
