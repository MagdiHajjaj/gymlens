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

it('reorders rows with the up/down arrows and disables them at the edges', () => {
  renderStep();
  const [squatRow] = screen.getAllByRole('listitem');

  const squatDown = within(squatRow).getByLabelText('Move Squat down') as HTMLButtonElement;
  const squatUp = within(squatRow).getByLabelText('Move Squat up') as HTMLButtonElement;
  expect(squatUp.disabled).toBe(true);
  expect(squatDown.disabled).toBe(false);

  fireEvent.click(squatDown);
  expect(usePlan.getState().plan.map((item) => item.exerciseId)).toEqual(['pushup', 'squat']);

  // Rows re-render in the new plan order.
  const [firstRow, secondRow] = screen.getAllByRole('listitem');
  expect(within(firstRow).getByText('Push-up')).toBeTruthy();
  expect(within(secondRow).getByText('Squat')).toBeTruthy();

  const pushupDown = within(firstRow).getByLabelText('Move Push-up down') as HTMLButtonElement;
  expect(pushupDown.disabled).toBe(false);
  const squatDownNow = within(secondRow).getByLabelText('Move Squat down') as HTMLButtonElement;
  expect(squatDownNow.disabled).toBe(true);

  // Moving back up restores the original order.
  fireEvent.click(within(secondRow).getByLabelText('Move Squat up'));
  expect(usePlan.getState().plan.map((item) => item.exerciseId)).toEqual(['squat', 'pushup']);
});
