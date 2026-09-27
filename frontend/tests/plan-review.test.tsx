// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkoutSetup } from '../src/features/workout/WorkoutSetup';
import { VoiceCoach } from '../src/features/coaching/VoiceCoach';
import { usePlan } from '../src/features/workout/planStore';
import { useWorkout } from '../src/features/workout/workoutStore';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  usePlan.setState({ plan: [], completedExerciseIds: [] });
  useWorkout.setState({ selected: 'squat' });
  usePlan.getState().setPlan(['squat', 'pushup']);
});

const renderSetup = (entry = '/workout?plan=review') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <WorkoutSetup
        demo={false}
        voiceCoach={new VoiceCoach()}
        onVoice={() => {}}
        onStart={vi.fn()}
      />
    </MemoryRouter>,
  );

it('opens the plan overview with checkmarks when plan=review', () => {
  usePlan.getState().completeExercise('squat');
  renderSetup();

  expect(screen.getByRole('heading', { name: 'Your plan.' })).toBeTruthy();
  expect(screen.getByText('1 of 2 complete. Keep going when you’re ready.')).toBeTruthy();
  const planList = screen.getByRole('list', { name: 'Session plan' });
  const rows = within(planList).getAllByRole('listitem');
  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByText('Completed')).toBeTruthy();
  expect(within(rows[1]).queryByText('Completed')).toBeNull();
});

it('falls back to the exercise chooser when the plan is empty', () => {
  usePlan.getState().clearPlan();
  renderSetup();

  expect(screen.getByRole('heading', { name: 'What are we training today?' })).toBeTruthy();
});

it('continue in review mode starts the next incomplete exercise', () => {
  usePlan.getState().completeExercise('squat');
  renderSetup();

  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  expect(useWorkout.getState().selected).toBe('pushup');
  expect(screen.getByRole('heading', { name: 'Find your position.' })).toBeTruthy();
});

it('opens the next exercise camera setup directly when plan=next', () => {
  usePlan.getState().completeExercise('squat');
  useWorkout.getState().select('pushup');

  renderSetup('/workout?plan=next');

  expect(screen.getByRole('heading', { name: 'Find your position.' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: /^Push-up$/ })).toBeTruthy();
});

it('shows the plan-complete panel when every exercise is finished', () => {
  usePlan.getState().completeExercise('squat');
  usePlan.getState().completeExercise('pushup');
  renderSetup();

  expect(screen.getByRole('heading', { name: 'Plan complete' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
});
