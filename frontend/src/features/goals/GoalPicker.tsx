import { GOALS, useFitnessGoal } from './goals';

/**
 * The full 4-option training-goal picker. All instances share one source of
 * truth (useFitnessGoal): picking here immediately reflects everywhere else.
 * Works for guests — no login required.
 */
export function GoalPicker() {
  const { goalId, setGoalId } = useFitnessGoal();
  return (
    <div className="goal-grid" role="group" aria-label="Training goal">
      {GOALS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`goal-option${goalId === option.id ? ' selected' : ''}`}
          onClick={() => setGoalId(goalId === option.id ? null : option.id)}
          aria-pressed={goalId === option.id}
        >
          <strong>{option.name}</strong>
          <span className="small-muted">{option.description}</span>
        </button>
      ))}
    </div>
  );
}
