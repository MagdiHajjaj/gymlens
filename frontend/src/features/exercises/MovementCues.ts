import type { ExerciseId, MovementPhase } from '../../types/workout';

export const movementCues: Record<ExerciseId, Record<MovementPhase, string>> = {
  squat: {
    ready: 'Stand tall and brace your core for the next squat.',
    eccentric: 'Sit your hips down. Keep your knees tracking over your toes and your chest tall.',
    concentric: 'Drive through your feet and stand tall with control.',
  },
  curl: {
    ready: 'Start with your arms comfortably straight and your wrists neutral.',
    eccentric: 'Curl toward your shoulders. Keep each elbow under its shoulder and your wrists straight.',
    concentric: 'Lower slowly until your arms are comfortably straight. Keep your elbows still.',
  },
  pushup: {
    ready: 'Hold a straight plank from shoulders through hips to ankles.',
    eccentric: 'Lower your chest with control. Keep your elbows angled back and your body in one line.',
    concentric: 'Press the floor away without letting your hips sag.',
  },
  deadlift: {
    ready: 'Stand tall, brace your core, and soften your knees.',
    eccentric: 'Push your hips back while keeping a long, flat spine.',
    concentric: 'Drive your hips forward and stand tall without leaning back.',
  },
  lunge: {
    ready: 'Stand tall and set your feet before the next lunge.',
    eccentric: 'Lower straight down and keep your front knee tracking over your foot.',
    concentric: 'Push through your front foot and return to a tall stance.',
  },
  press: {
    ready: 'Brace your core and stack your wrists over your elbows.',
    eccentric: 'Keep your wrists stacked over your elbows and move through a controlled path.',
    concentric: 'Control the return and keep your ribs down.',
  },
  glute_bridge: {
    ready: 'Keep your ribs down and prepare to move through your hips.',
    eccentric: 'Lower your hips slowly while keeping your feet planted.',
    concentric: 'Drive through your heels and squeeze your glutes at the top.',
  },
  row: {
    ready: 'Hold your hip hinge and let your arms hang straight.',
    eccentric: 'Pull your elbows toward your hips without lifting your torso.',
    concentric: 'Lower the weight slowly while holding the same hip hinge.',
  },
  dips: {
    ready: 'Press tall through your arms and keep your shoulders away from your ears.',
    eccentric: 'Bend your elbows back and lower with your torso close to the support.',
    concentric: 'Press through your hands until your arms are straight.',
  },
  pullup: {
    ready: 'Start from a controlled dead hang with your shoulders active.',
    eccentric: 'Pull your elbows down toward your ribs and keep your body still.',
    concentric: 'Lower under control until your arms return to a full hang.',
  },
};

export const coachingPhrases = (exercise: ExerciseId) => Object.values(movementCues[exercise]);
