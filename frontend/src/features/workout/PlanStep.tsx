import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { ExerciseArt } from '../../components/ExerciseArt';
import { exercises } from '../exercises/ExerciseRegistry';
import {
  MAX_REPS,
  MAX_SETS,
  MIN_REPS,
  MIN_SETS,
  MIN_WEIGHT_KG,
  WEIGHT_STEP_KG,
  usePlan,
  type PlanItem,
} from './planStore';

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

function PlanRow({ item, isFirst, isLast }: { item: PlanItem; isFirst: boolean; isLast: boolean }) {
  const updatePlanItem = usePlan((state) => state.updatePlanItem);
  const movePlanItem = usePlan((state) => state.movePlanItem);
  const complete = usePlan((state) => state.isExerciseComplete(item.exerciseId));
  const exercise = exercises[item.exerciseId];

  return (
    <li className={`plan-row${complete ? ' is-complete' : ''}`}>
      <div className="plan-row-reorder" role="group" aria-label={`Reorder ${exercise.name}`}>
        <button
          type="button"
          className="plan-row-reorder-button"
          aria-label={`Move ${exercise.name} up`}
          disabled={isFirst}
          onClick={() => movePlanItem(item.exerciseId, -1)}
        >
          <ChevronUp size={16} />
        </button>
        <button
          type="button"
          className="plan-row-reorder-button"
          aria-label={`Move ${exercise.name} down`}
          disabled={isLast}
          onClick={() => movePlanItem(item.exerciseId, 1)}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      <span className="plan-row-art" aria-hidden="true">
        <ExerciseArt exercise={item.exerciseId} />
      </span>
      <div className="plan-row-info">
        <strong>{exercise.name}</strong>
        <small>{exercise.muscles}</small>
        {complete && (
          <span className="plan-row-complete-badge">
            <Check size={14} aria-hidden="true" /> Completed
          </span>
        )}
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
        <Stepper
          label="Reps"
          value={`${item.reps} ${item.reps === 1 ? 'rep' : 'reps'}`}
          display={String(item.reps)}
          decrementDisabled={item.reps <= MIN_REPS}
          incrementDisabled={item.reps >= MAX_REPS}
          onDecrement={() => updatePlanItem(item.exerciseId, { reps: item.reps - 1 })}
          onIncrement={() => updatePlanItem(item.exerciseId, { reps: item.reps + 1 })}
        />
      </div>
    </li>
  );
}

export function PlanStep({
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
}) {
  const plan = usePlan((state) => state.plan);

  return (
    <div>
      <h2>Plan your session</h2>
      <p className="plan-step-intro">
        Set a target weight, sets and reps for each exercise. Use the arrows to change the
        order — exercises run top to bottom. You can adjust between sets.
      </p>
      <ul className="plan-rows" aria-label="Session plan">
        {plan.map((item, index) => (
          <PlanRow
            key={item.exerciseId}
            item={item}
            isFirst={index === 0}
            isLast={index === plan.length - 1}
          />
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
