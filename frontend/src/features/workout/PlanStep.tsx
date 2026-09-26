import { ArrowLeft, ArrowRight, Minus, Plus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { ExerciseArt } from '../../components/ExerciseArt';
import { exercises } from '../exercises/ExerciseRegistry';
import {
  MAX_SETS,
  MIN_SETS,
  MIN_WEIGHT_KG,
  WEIGHT_STEP_KG,
  usePlan,
  type PlanItem,
} from './planStore';
import type { ExerciseId } from '../../types/workout';

const formatWeight = (weightKg: number) =>
  weightKg === 0 ? 'Bodyweight' : `${weightKg % 1 === 0 ? weightKg : weightKg.toFixed(1)} kg`;

function Stepper({
  label,
  value,
  display,
  onDecrement,
  onIncrement,
  decrementDisabled,
  incrementDisabled,
}: {
  label: string;
  value: string;
  display: string;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementDisabled: boolean;
  incrementDisabled: boolean;
}) {
  return (
    <div className="plan-stepper">
      <span className="plan-stepper-label">{label}</span>
      <div className="plan-stepper-controls" role="group" aria-label={label}>
        <button
          type="button"
          className="plan-stepper-button"
          aria-label={`Decrease ${label}`}
          disabled={decrementDisabled}
          onClick={onDecrement}
        >
          <Minus size={16} />
        </button>
        <span className="plan-stepper-value" aria-live="polite" aria-label={`${label}: ${value}`}>
          {display}
        </span>
        <button
          type="button"
          className="plan-stepper-button"
          aria-label={`Increase ${label}`}
          disabled={incrementDisabled}
          onClick={onIncrement}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function PlanRow({ item }: { item: PlanItem }) {
  const updatePlanItem = usePlan((state) => state.updatePlanItem);
  const exercise = exercises[item.exerciseId];

  return (
    <li className="plan-row">
      <span className="plan-row-art" aria-hidden="true">
        <ExerciseArt exercise={item.exerciseId} />
      </span>
      <div className="plan-row-info">
        <strong>{exercise.name}</strong>
        <small>{exercise.muscles}</small>
      </div>
      <div className="plan-row-steppers">
        <Stepper
          label="Weight"
          value={formatWeight(item.weightKg)}
          display={formatWeight(item.weightKg)}
          decrementDisabled={item.weightKg <= MIN_WEIGHT_KG}
          incrementDisabled={false}
          onDecrement={() =>
            updatePlanItem(item.exerciseId, { weightKg: item.weightKg - WEIGHT_STEP_KG })
          }
          onIncrement={() =>
            updatePlanItem(item.exerciseId, { weightKg: item.weightKg + WEIGHT_STEP_KG })
          }
        />
        <Stepper
          label="Sets"
          value={`${item.sets} ${item.sets === 1 ? 'set' : 'sets'}`}
          display={String(item.sets)}
          decrementDisabled={item.sets <= MIN_SETS}
          incrementDisabled={item.sets >= MAX_SETS}
          onDecrement={() => updatePlanItem(item.exerciseId, { sets: item.sets - 1 })}
          onIncrement={() => updatePlanItem(item.exerciseId, { sets: item.sets + 1 })}
        />
      </div>
    </li>
  );
}

export function PlanStep({
  exercises: exerciseIds,
  onContinue,
  onBack,
}: {
  exercises: ExerciseId[];
  onContinue: () => void;
  onBack: () => void;
}) {
  const plan = usePlan((state) => state.plan);
  const rows = exerciseIds
    .map((exerciseId) => plan.find((item) => item.exerciseId === exerciseId))
    .filter((item): item is PlanItem => item !== undefined);

  return (
    <div>
      <h2>Plan your session</h2>
      <p className="plan-step-intro">
        Set a target weight and number of sets for each exercise. You can adjust between sets.
      </p>
      <ul className="plan-rows" aria-label="Session plan">
        {rows.map((item) => (
          <PlanRow key={item.exerciseId} item={item} />
        ))}
      </ul>
      <div className="plan-step-actions">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </Button>
        <Button className="setup-primary" onClick={onContinue}>
          Continue <ArrowRight size={17} />
        </Button>
      </div>
    </div>
  );
}
