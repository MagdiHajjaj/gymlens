import { GOALS, useFitnessGoal, type GoalId } from './goals';

/**
 * The "Primary goal" field on the athlete profile. Offers the same 4
 * canonical goals as the workout-setup picker and shares its state through
 * useFitnessGoal — one training goal everywhere, so a change in either place
 * is immediately visible in the other.
 */
export function ProfileGoalSelect() {
  const { goalId, setGoalId } = useFitnessGoal();
  return (
    <div className="profile-field">
      <label htmlFor="goal">Primary goal *</label>
      <select
        id="goal"
        required
        value={goalId || ''}
        onChange={(e) => setGoalId(e.target.value as GoalId)}
      >
        <option value="" disabled>
          Choose a goal
        </option>
        {GOALS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}
