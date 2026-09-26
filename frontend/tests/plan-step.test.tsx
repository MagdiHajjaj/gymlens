// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PlanStep } from '../src/features/workout/PlanStep';
import { usePlan } from '../src/features/workout/planStore';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  usePlan.setState({ plan: [], completedExerciseIds: [] });
  usePlan.getState().setPlan(['squat', 'pushup']);
});

const renderStep = (handlers: { onContinue?: () => void; onBack?: () => void } = {}) =>
  render(
    <PlanStep
      onContinue={handlers.onContinue ?? (() => {})}
      onBack={handlers.onBack ?? (() => {})}
    />,
  );

it('renders one row per exercise with defaults', () => {
  renderStep();
  const rows = screen.getAllByRole('listitem');
  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByText('Squat').textContent).toBe('Squat');
  expect(within(rows[1]).getByText('Push-up').textContent).toBe('Push-up');
  expect(within(rows[0]).getByLabelText('Weight: 20 kg')).toBeTruthy();
  expect(within(rows[1]).getByLabelText('Weight: Bodyweight')).toBeTruthy();
  expect(within(rows[0]).getByLabelText('Reps: 10 reps')).toBeTruthy();
});

it('weight, sets and reps steppers update the store', () => {
  renderStep();
  const [squatRow] = screen.getAllByRole('listitem');

  fireEvent.click(within(squatRow).getByLabelText('Increase Weight'));
  expect(usePlan.getState().plan[0]).toMatchObject({ exerciseId: 'squat', weightKg: 22.5 });

  fireEvent.click(within(squatRow).getByLabelText('Decrease Weight'));
  expect(usePlan.getState().plan[0]).toMatchObject({ exerciseId: 'squat', weightKg: 20 });

  fireEvent.click(within(squatRow).getByLabelText('Increase Sets'));
  fireEvent.click(within(squatRow).getByLabelText('Increase Sets'));
  expect(usePlan.getState().plan[0]).toMatchObject({ sets: 5 });

  fireEvent.click(within(squatRow).getByLabelText('Increase Reps'));
  fireEvent.click(within(squatRow).getByLabelText('Increase Reps'));
  expect(usePlan.getState().plan[0]).toMatchObject({ reps: 12 });
  expect(within(squatRow).getByLabelText('Reps: 12 reps')).toBeTruthy();
});

it('clamps steppers at their bounds', () => {
  renderStep();
  const [, pushupRow] = screen.getAllByRole('listitem');

  const decreaseWeight = within(pushupRow).getByLabelText('Decrease Weight') as HTMLButtonElement;
  expect(decreaseWeight.disabled).toBe(true);
  fireEvent.click(decreaseWeight);
  expect(usePlan.getState().plan[1].weightKg).toBe(0);

  const decreaseSets = within(pushupRow).getByLabelText('Decrease Sets') as HTMLButtonElement;
  fireEvent.click(decreaseSets);
  fireEvent.click(decreaseSets);
  fireEvent.click(decreaseSets);
  expect(usePlan.getState().plan[1].sets).toBe(1);
  expect(decreaseSets.disabled).toBe(true);

  const decreaseReps = within(pushupRow).getByLabelText('Decrease Reps') as HTMLButtonElement;
  for (let i = 0; i < 12; i++) fireEvent.click(decreaseReps);
  expect(usePlan.getState().plan[1].reps).toBe(1);
  expect(decreaseReps.disabled).toBe(true);

  const increaseReps = within(pushupRow).getByLabelText('Increase Reps') as HTMLButtonElement;
  for (let i = 0; i < 60; i++) fireEvent.click(increaseReps);
  expect(usePlan.getState().plan[1].reps).toBe(50);
  expect(increaseReps.disabled).toBe(true);
});

it('calls onContinue and onBack from its action buttons', () => {
  const onContinue = vi.fn();
  const onBack = vi.fn();
  renderStep({ onContinue, onBack });

  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(onContinue).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(onBack).toHaveBeenCalledTimes(1);
});

it('shows a completion checkmark only on finished rows', () => {
  usePlan.getState().completeExercise('squat');
  renderStep();

  const [squatRow, pushupRow] = screen.getAllByRole('listitem');
  expect(squatRow.className).toContain('is-complete');
  expect(within(squatRow).getByText('Completed')).toBeTruthy();
  expect(pushupRow.className).not.toContain('is-complete');
  expect(within(pushupRow).queryByText('Completed')).toBeNull();
});

it('reorders rows with the keyboard arrows on the drag handle', () => {
  renderStep();
  const [squatRow] = screen.getAllByRole('listitem');
  const handle = within(squatRow).getByRole('button', { name: 'Reorder Squat' });

  fireEvent.keyDown(handle, { key: 'ArrowDown' });
  expect(usePlan.getState().plan.map((item) => item.exerciseId)).toEqual(['pushup', 'squat']);

  const rows = screen.getAllByRole('listitem');
  expect(within(rows[0]).getByText('Push-up')).toBeTruthy();

  fireEvent.keyDown(within(rows[1]).getByRole('button', { name: 'Reorder Squat' }), {
    key: 'ArrowUp',
  });
  expect(usePlan.getState().plan.map((item) => item.exerciseId)).toEqual(['squat', 'pushup']);

  // ArrowUp on the first row is a no-op.
  const reordered = screen.getAllByRole('listitem');
  fireEvent.keyDown(within(reordered[0]).getByRole('button', { name: 'Reorder Squat' }), {
    key: 'ArrowUp',
  });
  expect(usePlan.getState().plan.map((item) => item.exerciseId)).toEqual(['squat', 'pushup']);
});

it('drags a row to a new position with pointer events', async () => {
  renderStep();
  const [squatRow, pushupRow] = screen.getAllByRole('listitem');
  const list = screen.getByRole('list');
  // Realistic layout: two 100px rows stacked at the top of the viewport.
  const rect = (top: number, height = 100) =>
    ({ top, height, bottom: top + height, left: 0, right: 300, width: 300, x: 0, y: top }) as DOMRect;
  vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(rect(0, 200));
  vi.spyOn(squatRow, 'getBoundingClientRect').mockReturnValue(rect(0));
  vi.spyOn(pushupRow, 'getBoundingClientRect').mockReturnValue(rect(100));
  Object.defineProperty(list, 'scrollHeight', { value: 200, configurable: true });

  const handle = within(squatRow).getByRole('button', { name: 'Reorder Squat' });
  fireEvent.pointerDown(handle, { clientY: 50, pointerId: 1 });

  // A small move that doesn't cross a slot yet: the row still follows the cursor.
  fireEvent.pointerMove(window, { clientY: 80, pointerId: 1 });
  expect(squatRow.className).toContain('is-dragging');
  expect(squatRow.style.transform).toContain('30px');
  expect(pushupRow.style.transform).toBe('');

  // Past the second row's midpoint: the sibling slides aside. The dragged row
  // is clamped inside the 200px list (max 100px of travel for a 100px row).
  fireEvent.pointerMove(window, { clientY: 170, pointerId: 1 });
  expect(squatRow.style.transform).toContain('100px');
  expect(pushupRow.style.transform).toContain('-100px');

  fireEvent.pointerUp(window, { pointerId: 1 });

  // After the settle animation the new order is committed to the store.
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(usePlan.getState().plan.map((item) => item.exerciseId)).toEqual(['pushup', 'squat']);
  const [firstRow] = screen.getAllByRole('listitem');
  expect(within(firstRow).getByText('Push-up')).toBeTruthy();
  // Inline drag styles are cleaned up.
  expect(firstRow.style.transform).toBe('');
});
