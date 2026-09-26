import type { CSSProperties } from 'react';
import type { ExerciseId, ExerciseResult } from '../types/workout';
import { muscleIntensity } from '../features/camera/MuscleHeatmap';

const muscles: Record<ExerciseId, { primary: string[]; secondary: string[]; label: string }> = {
  curl: {
    primary: ['biceps', 'forearms', 'shoulders'],
    secondary: ['chest', 'core'],
    label: 'Biceps · Forearms · Shoulders',
  },
  squat: {
    primary: ['quads', 'glutes', 'core'],
    secondary: ['hamstrings', 'calves'],
    label: 'Quads · Glutes · Core',
  },
  pushup: {
    primary: ['chest', 'triceps', 'shoulders'],
    secondary: ['core'],
    label: 'Chest · Triceps · Shoulders',
  },
};

const activeMuscles = (exercise: ExerciseId, result: ExerciseResult | null) => {
  const base = muscles[exercise];
  if (!result?.jointAngles) return base;
  const primary = new Set(base.primary);
  const secondary = new Set(base.secondary);
  for (const [key, value] of Object.entries(result.jointAngles)) {
    if (!Number.isFinite(value)) continue;
    if (key === 'elbow_angle' || key === 'upper_arm_angle') {
      primary.add('biceps');
      primary.add('forearms');
      secondary.add('shoulders');
      secondary.add('chest');
    }
    if (key === 'knee_angle') {
      primary.add('quads');
      primary.add('glutes');
      secondary.add('hamstrings');
      secondary.add('calves');
    }
    if (key === 'torso_lean' || key === 'hip_alignment') {
      primary.add('core');
      secondary.add('glutes');
      secondary.add('hamstrings');
    }
  }
  if (primary.size === base.primary.length && secondary.size === base.secondary.length) return base;
  const label = [...primary, ...secondary].slice(0, 4).join(' · ');
  return { primary: [...primary], secondary: [...secondary], label: label || base.label };
};
const outline =
  'M -9 43 L -10 52 Q -22 54 -29 60 Q -37 67 -39 86 L -43 114 L -48 145 Q -53 152 -50 160 Q -46 166 -42 158 L -36 145 L -29 118 L -23 89 L -20 109 L -22 135 Q -25 154 -22 180 L -19 208 L -21 239 L -22 260 L -27 272 Q -28 277 -17 277 L -10 273 L -8 244 L -5 216 L -2 184 L 0 160 L 2 184 L 5 216 L 8 244 L 10 273 L 17 277 Q 28 277 27 272 L 22 260 L 21 239 L 19 208 L 22 180 Q 25 154 22 135 L 20 109 L 23 89 L 29 118 L 36 145 L 42 158 Q 46 166 50 160 Q 53 152 48 145 L 43 114 L 39 86 Q 37 67 29 60 Q 22 54 10 52 L 9 43';
const front: [string, string][] = [
  ['shoulders', 'M 24 60 Q 36 64 36 82 L 26 85 L 22 72 Z'],
  ['chest', 'M 2 62 Q 13 58 22 65 L 24 82 Q 12 91 2 83 Z'],
  ['biceps', 'M 28 87 Q 39 82 38 96 L 34 116 Q 25 116 26 104 Z'],
  ['forearms', 'M 33 120 L 40 118 L 45 141 L 39 146 Q 33 135 33 120 Z'],
  [
    'core',
    'M 3 89 L 13 89 L 14 100 L 3 100 Z M 3 104 L 14 104 L 13 115 L 3 115 Z M 3 119 L 12 119 L 10 133 L 3 138 Z',
  ],
  ['core', 'M 16 91 L 20 88 L 18 115 L 20 132 L 13 139 L 15 115 Z'],
  ['quads', 'M 5 146 Q 14 139 20 147 L 19 181 L 15 204 Q 8 208 7 194 Z'],
  ['calves', 'M 9 218 L 16 217 Q 20 234 15 253 L 11 259 Z'],
];
const back: [string, string][] = [
  ['back', 'M 2 51 L 9 53 L 23 61 L 12 78 L 2 87 Z'],
  ['shoulders', 'M 26 62 Q 36 64 36 82 L 26 85 L 23 73 Z'],
  ['back', 'M 3 90 L 23 79 L 18 109 L 9 126 L 3 119 Z'],
  ['triceps', 'M 28 88 Q 38 84 38 98 L 34 117 Q 26 115 26 103 Z'],
  ['forearms', 'M 33 122 L 40 119 L 45 142 L 39 146 Z'],
  ['core', 'M 3 123 L 10 128 L 18 124 L 20 137 L 3 137 Z'],
  ['glutes', 'M 3 141 Q 13 136 21 143 L 21 161 Q 12 170 3 162 Z'],
  ['hamstrings', 'M 4 167 Q 13 173 21 167 L 18 196 L 14 207 L 8 204 Z'],
  ['calves', 'M 9 217 L 17 216 Q 22 236 15 251 L 10 254 Q 6 234 9 217 Z'],
];

export function MuscleDiagram({
  exercise,
  result,
  paused,
}: {
  exercise: ExerciseId;
  result: ExerciseResult | null;
  paused: boolean;
}) {
  const selected = activeMuscles(exercise, result);
  const live = !paused && Boolean(result?.trackingValid);
  const intensity = muscleIntensity(exercise, live ? result : null);
  const style = {
    '--muscle-color': live ? `hsl(${42 * (1 - intensity)} 92% 55%)` : '#d59d67',
  } as CSSProperties;
  return (
    <section
      className="panel muscle-panel"
      style={style}
      data-exercise={exercise}
      data-intensity={intensity.toFixed(2)}
    >
      <span className="eyebrow">MUSCLE MAP</span>
      <h3>{selected.label}</h3>
      <svg
        className="muscle-diagram"
        viewBox="0 0 240 305"
        role="img"
        aria-label={`${selected.label} highlighted on front and back muscle diagrams`}
      >
        <title>{selected.label}. Color follows joint bend; it does not measure muscle activation.</title>
        {[front, back].map((regions, view) => (
          <g key={view} transform={`translate(${view === 0 ? 59 : 181} 0)`}>
            <ellipse className="body-outline" cx="0" cy="28" rx="13" ry="18" />
            <path className="body-outline" d={outline} />
            {[-1, 1].map((side) => (
              <g key={side} transform={`scale(${side} 1)`}>
                {regions.map(([name, path], i) => (
                  <path
                    key={i}
                    d={path}
                    data-muscle={name}
                    className={`muscle-region ${
                      selected.primary.includes(name)
                        ? 'primary-muscle'
                        : selected.secondary.includes(name)
                          ? 'secondary-muscle'
                          : ''
                    }`}
                  />
                ))}
              </g>
            ))}
            <path
              className="body-detail"
              d={
                view === 0 ? 'M 0 60 V 138 M -18 211 L -8 212 M 8 212 L 18 211' : 'M 0 54 V 137 M 0 143 V 163'
              }
            />
            <text x="0" y="298" textAnchor="middle">
              {view === 0 ? 'FRONT' : 'BACK'}
            </text>
          </g>
        ))}
      </svg>
      <div className="muscle-legend">
        <span>
          <i />
          Primary
        </span>
        <span>
          <i />
          Supporting
        </span>
      </div>
      <p className="muscle-status">
        {paused ? 'Paused' : live ? 'Color follows your movement' : 'Muscles for this exercise'}
      </p>
      <p className="small-muted">Angle-based visual · not measured activation</p>
    </section>
  );
}
