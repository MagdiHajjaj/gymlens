import { exercisesForMovement, type ExerciseMovement } from '../features/exercises/ExerciseRegistry';
import { workoutSplits } from '../features/exercises/workoutSplits';

const MOVEMENTS: (ExerciseMovement | null)[] = [null, 'push', 'pull', 'legs'];

export function MovementChips({
  value,
  onChange,
  showCounts = true,
}: {
  value: ExerciseMovement | null;
  onChange: (movement: ExerciseMovement | null) => void;
  showCounts?: boolean;
}) {
  return (
    <div className="movement-chips" role="group" aria-label="Filter by movement">
      {MOVEMENTS.map((movement) => (
        <button
          key={movement ?? 'all'}
          type="button"
          className={`movement-chip${value === movement ? ' is-active' : ''}`}
          aria-pressed={value === movement}
          onClick={() => onChange(movement)}
        >
          {movement === null
            ? 'All'
            : showCounts
              ? `${workoutSplits[movement]} (${exercisesForMovement(movement).length})`
              : workoutSplits[movement]}
        </button>
      ))}
    </div>
  );
}
