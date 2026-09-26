import { exercises } from '../features/exercises/ExerciseRegistry';
import {
  matchesSplit,
  workoutSplits,
  type SplitFilter,
  type ExerciseFilter,
} from '../features/exercises/workoutSplits';
import type { ExerciseId } from '../types/workout';

export function WorkoutFilters({
  split,
  exercise,
  onSplitChange,
  onExerciseChange,
}: {
  split: SplitFilter;
  exercise: ExerciseFilter;
  onSplitChange: (split: SplitFilter) => void;
  onExerciseChange: (exercise: ExerciseFilter) => void;
}) {
  return (
    <>
      <label>
        Workout split
        <select
          aria-label="Filter workout split"
          value={split}
          onChange={(event) => onSplitChange(event.target.value as SplitFilter)}
        >
          <option value="all">All splits</option>
          {Object.entries(workoutSplits).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Exercise
        <select
          aria-label="Filter exercise"
          value={exercise}
          onChange={(event) => onExerciseChange(event.target.value as ExerciseFilter)}
        >
          <option value="all">All exercises</option>
          {(Object.keys(exercises) as ExerciseId[])
            .filter((id) => matchesSplit(id, split))
            .map((id) => (
              <option key={id} value={id}>
                {exercises[id].name}
              </option>
            ))}
        </select>
      </label>
    </>
  );
}
