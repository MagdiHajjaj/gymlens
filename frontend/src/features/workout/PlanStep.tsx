import { useRef } from 'react';
import { flushSync } from 'react-dom';
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

interface Gesture {
  id: ExerciseId;
  fromIndex: number;
  startClientY: number;
  lastClientY: number;
  listEl: HTMLUListElement;
  /** Row tops relative to the list, in layout order. Measured at drag start. */
  tops: number[];
  heights: number[];
  /** Row elements in layout order; React keys rows by exerciseId so these nodes survive the reorder. */
  rows: HTMLLIElement[];
  /**
   * Cumulative auto-scroll while this drag is active. Folded into the pointer
   * delta so the row stays glued under the finger in viewport space while the
   * page scrolls beneath it — which is what lets the drop target keep
   * advancing during auto-scroll.
   */
  scrollDeltaY: number;
  toIndex: number;
  active: boolean;
  settling: boolean;
  scrollRaf: number;
}

function PlanRow({
  item,
  index,
  onHandlePointerDown,
  onHandleKeyDown,
  registerRow,
}: {
  item: PlanItem;
  index: number;
  onHandlePointerDown: (event: React.PointerEvent, index: number, id: ExerciseId) => void;
  onHandleKeyDown: (event: React.KeyboardEvent, index: number) => void;
  registerRow: (id: ExerciseId, element: HTMLLIElement | null) => void;
}) {
  const updatePlanItem = usePlan((state) => state.updatePlanItem);
  const complete = usePlan((state) => state.isExerciseComplete(item.exerciseId));
  const exercise = exercises[item.exerciseId];

  const className = `plan-row${complete ? ' is-complete' : ''}`;

  return (
    <li
      ref={(element) => registerRow(item.exerciseId, element)}
      className={className}
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

  const registerRow = (id: ExerciseId, element: HTMLLIElement | null) => {
    if (element) rowRefs.current.set(id, element);
    else rowRefs.current.delete(id);
  };

  /** Slides the untouched rows aside to open the drop slot. Runs only when the slot changes; the CSS transition animates the shift. */
  const updateSiblings = (g: Gesture) => {
    const { fromIndex, toIndex } = g;
    const shift = g.heights[fromIndex];
    g.rows.forEach((row, index) => {
      if (index === fromIndex) return;
      let dy = 0;
      if (fromIndex < toIndex && index > fromIndex && index <= toIndex) dy = -shift;
      else if (fromIndex > toIndex && index >= toIndex && index < fromIndex) dy = shift;
      row.style.transform = dy === 0 ? '' : `translate3d(0, ${dy}px, 0)`;
    });
  };

  /**
   * One drag frame, written straight to the DOM with no React re-render so the
   * row tracks the cursor 1:1. The dragged row's transform transition is killed
   * while active (see startDrag); the siblings keep theirs and glide aside.
   */
  const renderFrame = (g: Gesture) => {
    // Keep the dragged row inside the list so it can't fly off the top/bottom.
    const minDy = -g.tops[g.fromIndex];
    const maxDy = g.listEl.scrollHeight - g.tops[g.fromIndex] - g.heights[g.fromIndex];
    const rawDy = g.lastClientY - g.startClientY + g.scrollDeltaY;
    const dy = maxDy >= minDy ? Math.min(Math.max(rawDy, minDy), maxDy) : rawDy;
    g.rows[g.fromIndex].style.transform = `translate3d(0, ${dy}px, 0) scale(1.03)`;

    // The drop slot follows the dragged row's own center — the slot it
    // visually covers is the slot it lands in. (The raw pointer can run ahead
    // of the row when the row is clamped at a list edge, so the pointer alone
    // would pick the wrong slot there.)
    const rowCenterY = g.tops[g.fromIndex] + dy + g.heights[g.fromIndex] / 2;
    let toIndex = g.fromIndex;
    for (let i = 0; i < g.tops.length; i++) {
      if (i === g.fromIndex) continue;
      const midpoint = g.tops[i] + g.heights[i] / 2;
      if (i < g.fromIndex && rowCenterY <= midpoint) toIndex = Math.min(toIndex, i);
      if (i > g.fromIndex && rowCenterY >= midpoint) toIndex = Math.max(toIndex, i);
    }
    if (toIndex !== g.toIndex) {
      g.toIndex = toIndex;
      updateSiblings(g);
    }
  };

  const startDrag = (g: Gesture) => {
    g.active = true;
    const dragged = g.rows[g.fromIndex];
    dragged.classList.add('is-dragging');
    // While the row follows the pointer it must not lag behind a transition.
    dragged.style.transition = 'none';
    document.body.classList.add('is-reordering');
    try {
      navigator.vibrate?.(12);
    } catch {
      /* haptics are a nice-to-have */
    }
    renderFrame(g);
    const tick = () => {
      const active = gesture.current;
      if (!active || !active.active || active.settling) return;
      if (scrollDirection.current !== 0) {
        const amount = scrollDirection.current * 14;
        window.scrollBy(0, amount);
        // The page moved under a stationary pointer: fold the scroll into the
        // drag delta so the row stays glued to the finger and the drop target
        // keeps advancing over the rows scrolling beneath it.
        active.scrollDeltaY += amount;
        renderFrame(active);
      }
      active.scrollRaf = requestAnimationFrame(tick);
    };
    g.scrollRaf = requestAnimationFrame(tick);
  };

  const handlePointerMove = (event: PointerEvent) => {
    const g = gesture.current;
    if (!g || g.settling) return;
    g.lastClientY = event.clientY;
    scrollDirection.current =
      event.clientY < AUTO_SCROLL_EDGE_PX
        ? -1
        : event.clientY > window.innerHeight - AUTO_SCROLL_EDGE_PX
          ? 1
          : 0;
    if (!g.active) {
      if (Math.abs(event.clientY - g.startClientY) < DRAG_THRESHOLD_PX) return;
      startDrag(g);
      return;
    }
    renderFrame(g);
  };

  /**
   * Ends the gesture. A real drop uses FLIP: capture where every row is, commit
   * the new order synchronously, then glide each row from its old visual spot
   * to its new natural one. A cancel just glides everything back home.
   */
  const finishGesture = (commit: boolean) => {
    const g = gesture.current;
    if (!g) return;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerCancel);
    cancelAnimationFrame(g.scrollRaf);
    scrollDirection.current = 0;
    if (!g.active) {
      gesture.current = null;
      return;
    }
    g.settling = true;
    const { fromIndex, toIndex, rows } = g;
    const moved = commit && toIndex !== fromIndex;

    if (!moved) {
      // Restoring the CSS transition animates every row home from where it is.
      rows.forEach((row) => {
        row.classList.remove('is-dragging');
        row.style.transition = '';
        row.style.transform = '';
      });
      window.setTimeout(() => {
        gesture.current = null;
        document.body.classList.remove('is-reordering');
      }, SETTLE_MS);
      return;
    }

    const oldTops = rows.map((row) => row.getBoundingClientRect().top);
    rows.forEach((row) => {
      row.classList.remove('is-dragging');
      row.style.transition = 'none';
      row.style.transform = '';
    });
    // Rows are keyed by exerciseId, so these are the same DOM nodes in a new order.
    flushSync(() => {
      reorderPlan(fromIndex, toIndex);
    });
    rows.forEach((row, i) => {
      const dy = oldTops[i] - row.getBoundingClientRect().top;
      if (dy !== 0) row.style.transform = `translate3d(0, ${dy}px, 0)`;
    });
    // Force reflow so the browser registers the starting positions…
    void g.listEl.offsetHeight;
    // …then release: the CSS transition glides every row into its slot.
    rows.forEach((row) => {
      row.style.transition = '';
      row.style.transform = '';
    });
    window.setTimeout(() => {
      gesture.current = null;
      document.body.classList.remove('is-reordering');
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
    const rows: HTMLLIElement[] = [];
    plan.forEach((item) => {
      const row = rowRefs.current.get(item.exerciseId);
      if (!row) return;
      const rect = row.getBoundingClientRect();
      tops.push(rect.top - listTop);
      heights.push(rect.height);
      rows.push(row);
    });
    if (rows.length !== plan.length) return;
    gesture.current = {
      id,
      fromIndex: index,
      startClientY: event.clientY,
      lastClientY: event.clientY,
      listEl: list,
      tops,
      heights,
      rows,
      scrollDeltaY: 0,
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
