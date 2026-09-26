import { Link } from 'react-router-dom';
import { ArrowRight, Target } from 'lucide-react';
import { useFitnessGoal } from './goals';

/**
 * Slim one-line "Training for" chip. Tapping it goes to /workout, where the
 * full goal picker lives.
 */
export function GoalChip() {
  const { goal } = useFitnessGoal();
  return (
    <Link to="/workout" className="goal-chip" aria-label={`Training for ${goal ? goal.name : 'no goal set'}. Change your training goal.`}>
      <Target size={15} aria-hidden />
      <span>
        Training for: <strong>{goal ? goal.name : 'Not set'}</strong>
      </span>
      <ArrowRight size={15} aria-hidden />
    </Link>
  );
}
