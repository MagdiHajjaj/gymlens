import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, GripVertical, Minus, Plus } from 'lucide-react';
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
import type { ExerciseId } from '../../types/workout';

const DRAG_THRESHOLD_PX = 6;
const SETTLE_MS = 240;
const AUTO_SCROLL_EDGE_PX = 72;

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

interface DragInfo {
  id: ExerciseId;
  fromIndex: number;
  toIndex: number;
  /** Pointer-follow offset while active; target slot offset while settling. */
  dy: number;
  /** Height of the dragged row, used to shift the other rows aside. */
  height: number;
  /** Past the movement threshold: the row is lifted and following the pointer. */
  active: boolean;
  /** Dropped: everything is gliding into its final place. */
  settling: boolean;
}

interface Gesture {
  id: ExerciseId;
  fromIndex: number;
  startClientY: number;
  lastClientY: number;
  /** Row tops relative to the list, in layout order. Measured at drag start. */
  tops: number[];
  heights: number[];
  toIndex: number;
  active: boolean;
  settling: boolean;
  scrollRaf: number;
}

function PlanRow({
  item,
  index,
  drag,
  onHandlePointerDown,
  onHandleKeyDown,
  registerRow,
}: {
  item: PlanItem;
  index: number;
  drag: DragInfo | null;
  onHandlePointerDown: (event: React.PointerEvent, index: number, id: ExerciseId) => void;
  onHandleKeyDown: (event: React.KeyboardEvent, index: number) => void;
  registerRow: (id: ExerciseId, element: HTMLLIElement | null) => void;
}) {
  const updatePlanItem = usePlan((state) => state.updatePlanItem);
  const complete = usePlan((state) => state.isExerciseComplete(item.exerciseId));
  const exercise = exercises[item.exerciseId];

  const isDragged = drag?.id === item.exerciseId;
  let className = `plan-row${complete ? ' is-complete' : ''}`;
  let transform: string | undefined;
  let transition: string | undefined;
  if (isDragged && drag) {
    if (drag.active) className += ' is-dragging';
    transform = `translate3d(0, ${drag.dy}px, 0)${drag.active ? ' scale(1.03)' : ''}`;
    // While the row follows the pointer it must not lag behind a transition;
    // when settling, the CSS transition glides it into its slot.
    if (drag.active) transition = 'none';
  } else if (drag && (drag.active || drag.settling)) {
    const { fromIndex, toIndex, height } = drag;
    if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
      transform = `translate3d(0, ${-height}px, 0)`;
    } else if (fromIndex > toIndex && index >= toIndex && index < fromIndex) {
      transform = `translate3d(0, ${height}px, 0)`;
    }
  }

  return (
    <li
      ref={(element) => registerRow(item.exerciseId, element)}
      className={className}
      style={transform ? { transform, transition } : undefined}
    >
      <button
        type="button"
        className="plan-row-handle"
        aria-label={`Reorder ${exercise.name}`}
        title="Drag to reorder (arrow keys work too)"
        onPointerDown={(event) => onHandlePointerDown(event, index, item.exerciseId)}
        onKeyDown={(event) => onHandleKeyDown(event, index)}
      >
        <GripVertical size={18} aria-hidden="true" />
      </button>
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
  const reorderPlan = usePlan((state) => state.reorderPlan);
  const listRef = useRef<HTMLUListElement>(null);
  const rowRefs = useRef(new Map<ExerciseId, HTMLLIElement>());
  const gesture = useRef<Gesture | null>(null);
  const scrollDirection = useRef(0);
  const [drag, setDrag] = useState<DragInfo | null>(null);

  const registerRow = (id: ExerciseId, element: HTMLLIElement | null) => {
    if (element) rowRefs.current.set(id, element);
    else rowRefs.current.delete(id);
  };

  const stopAutoScroll = () => {
    const current = gesture.current;
    if (current) cancelAnimationFrame(current.scrollRaf);
    scrollDirection.current = 0;
  };

  const updateTargetIndex = (clientY: number) => {
    const current = gesture.current;
    const list = listRef.current;
    if (!current || !current.active || current.settling || !list) return;
    const pointerY = clientY - list.getBoundingClientRect().top;
    let toIndex = current.fromIndex;
    for (let i = 0; i < current.tops.length; i++) {
      if (i === current.fromIndex) continue;
      const midpoint = current.tops[i] + current.heights[i] / 2;
      if (i < current.fromIndex && pointerY < midpoint) toIndex = Math.min(toIndex, i);
      if (i > current.fromIndex && pointerY > midpoint) toIndex = Math.max(toIndex, i);
    }
    if (toIndex === current.toIndex) return;
    current.toIndex = toIndex;
    setDrag({
      id: current.id,
      fromIndex: current.fromIndex,
      toIndex,
      dy: clientY - current.startClientY,
      height: current.heights[current.fromIndex],
      active: true,
      settling: false,
    });
  };

  const handlePointerMove = (event: PointerEvent) => {
    const current = gesture.current;
    if (!current || current.settling) return;
    const dy = event.clientY - current.startClientY;

    if (!current.active) {
      if (Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      current.active = true;
      document.body.classList.add('is-reordering');
      try {
        navigator.vibrate?.(12);
      } catch {
        /* haptics are a nice-to-have */
      }
      const tick = () => {
        const active = gesture.current;
        if (!active || !active.active || active.settling) return;
        if (scrollDirection.current !== 0) {
          window.scrollBy(0, scrollDirection.current * 14);
          // The list moved under a stationary pointer: re-evaluate the target.
          updateTargetIndex(active.lastClientY);
        }
        active.scrollRaf = requestAnimationFrame(tick);
      };
      current.scrollRaf = requestAnimationFrame(tick);
    }

    current.lastClientY = event.clientY;
    scrollDirection.current =
      event.clientY < AUTO_SCROLL_EDGE_PX
        ? -1
        : event.clientY > window.innerHeight - AUTO_SCROLL_EDGE_PX
          ? 1
          : 0;

    updateTargetIndex(event.clientY);
  };

  /** Glides every row into place, then commits the reorder to the store. */
  const finishGesture = (commit: boolean) => {
    const current = gesture.current;
    if (!current) return;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerCancel);
    stopAutoScroll();
    document.body.classList.remove('is-reordering');
    if (!current.active) {
      gesture.current = null;
      return;
    }
    current.settling = true;
    const { fromIndex, toIndex, id } = current;
    const finalIndex = commit ? toIndex : fromIndex;
    setDrag({
      id,
      fromIndex,
      toIndex: finalIndex,
      dy: current.tops[finalIndex] - current.tops[fromIndex],
      height: current.heights[fromIndex],
      active: false,
      settling: true,
    });
    window.setTimeout(() => {
      gesture.current = null;
      setDrag(null);
      if (commit && toIndex !== fromIndex) reorderPlan(fromIndex, toIndex);
    }, SETTLE_MS);
  };

  const handlePointerUp = () => finishGesture(true);
  const handlePointerCancel = () => finishGesture(false);

  const handleHandlePointerDown = (
    event: React.PointerEvent,
    index: number,
    id: ExerciseId,
  ) => {
    if (gesture.current) return;
    const list = listRef.current;
    if (!list) return;
    event.preventDefault();
    const listTop = list.getBoundingClientRect().top;
    const tops: number[] = [];
    const heights: number[] = [];
    plan.forEach((item) => {
      const row = rowRefs.current.get(item.exerciseId);
      if (!row) return;
      const rect = row.getBoundingClientRect();
      tops.push(rect.top - listTop);
      heights.push(rect.height);
    });
    if (tops.length !== plan.length) return;
    gesture.current = {
      id,
      fromIndex: index,
      startClientY: event.clientY,
      lastClientY: event.clientY,
      tops,
      heights,
      toIndex: index,
      active: false,
      settling: false,
      scrollRaf: 0,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    window.addEventListener('pointercancel', handlePointerCancel, { once: true });
  };

  const handleHandleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const toIndex = index + (event.key === 'ArrowUp' ? -1 : 1);
    if (toIndex >= 0 && toIndex < plan.length) reorderPlan(index, toIndex);
  };

  return (
    <div>
      <h2>Plan your session</h2>
      <p className="plan-step-intro">
        Set a target weight, sets and reps for each exercise. Drag the handle to reorder —
        exercises run top to bottom. You can adjust between sets.
      </p>
      <ul className="plan-rows" aria-label="Session plan" ref={listRef}>
        {plan.map((item, index) => (
          <PlanRow
            key={item.exerciseId}
            item={item}
            index={index}
            drag={drag}
            onHandlePointerDown={handleHandlePointerDown}
            onHandleKeyDown={handleHandleKeyDown}
            registerRow={registerRow}
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
