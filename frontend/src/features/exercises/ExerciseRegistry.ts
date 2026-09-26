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
    calibrate: 'Extend your legs',
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
    calibrate: 'Extend your arms',
  },
  pushup: {
    name: 'Push-up',
    category: 'FULL BODY',
    subtitle: 'Strength from the ground up',
    muscles: 'Chest · Triceps · Core',
    setup: 'Place your camera low and side-on. Begin in a plank with your full body visible.',
    checks: 'Range & hip alignment',
    color: 'lavender',
    calibrate: 'Hold your plank',
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
    calibrate: 'Stand tall',
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
    calibrate: 'Extend your legs',
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
    calibrate: 'Extend your arms overhead',
  },
  glute_bridge: {
    name: 'Glute bridge',
    category: 'LOWER BODY',
    subtitle: 'Drive your hips to the sky',
    muscles: 'Glutes · Hamstrings · Core',
    setup:
      'Lie on your back, knees bent and feet flat, camera side-on at hip height. Start by holding the top bridged position.',
    checks: 'Bridge height & back position',
    color: 'amber',
    calibrate: 'Hold the top of your bridge',
  },
  row: {
    name: 'Bent-over row',
    category: 'UPPER BODY',
    subtitle: 'Pull with your back',
    muscles: 'Back · Biceps · Rear delts',
    setup:
      'Stand side-on. Hinge at the hips to about 45 degrees with soft knees, and let your arms hang straight down.',
    checks: 'Pull range & torso stillness',
    color: 'teal',
    calibrate: 'Let your arms hang straight',
  },
  dips: {
    name: 'Tricep dips',
    category: 'UPPER BODY',
    subtitle: 'Own the press-up',
    muscles: 'Triceps · Chest · Shoulders',
    setup:
      'Place your camera side-on. Sit on a sturdy chair edge, hands beside your hips and feet flat, then lift your hips off.',
    checks: 'Depth & torso position',
    color: 'indigo',
    calibrate: 'Press up into support',
  },
  pullup: {
    name: 'Pull-up',
    category: 'UPPER BODY',
    subtitle: 'Chin over the bar',
    muscles: 'Back · Biceps · Core',
    setup:
      'Camera side-on, far enough to see your full hang. Begin from a dead hang with arms fully extended.',
    checks: 'Pull height & swing',
    color: 'coral',
    calibrate: 'Hang with arms extended',
  },
} as const;
export const createAnalyzer = (id: ExerciseId) =>
  id === 'curl' ? new CurlAnalyzer() : new MovementAnalyzer(id);
