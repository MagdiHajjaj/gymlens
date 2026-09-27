// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkoutCalendar } from '../src/components/WorkoutCalendar';
import { usePlan } from '../src/features/workout/planStore';
import { dayKey } from '../src/lib/calendarDays';
import type { ScheduledWorkout } from '../src/lib/api';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockCreate = vi.fn();
const mockRemove = vi.fn();
vi.mock('../src/lib/api', () => ({
  api: {
    scheduled: {
      list: vi.fn(),
      create: (...args: unknown[]) => mockCreate(...args),
      remove: (...args: unknown[]) => mockRemove(...args),
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  usePlan.setState({ plan: [], workoutId: null, workoutName: '', completedExerciseIds: [] });
});

const todayKey = () => dayKey(new Date());

const scheduledItem = (overrides: Partial<ScheduledWorkout> = {}): ScheduledWorkout => ({
  id: 'sched-1',
  scheduled_date: todayKey(),
  name: 'Leg day',
  exercises: ['squat', 'lunge'],
  created_at: new Date().toISOString(),
  ...overrides,
});

const renderCalendar = (props: Partial<Parameters<typeof WorkoutCalendar>[0]> = {}) =>
  render(
    <MemoryRouter>
      <WorkoutCalendar
        workouts={[]}
        scheduled={[]}
        canSchedule
        onScheduledChange={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );

it('marks days that have scheduled sessions', () => {
  const { container } = renderCalendar({ scheduled: [scheduledItem()] });
  expect(container.querySelectorAll('.cal-sched')).toHaveLength(1);
  expect(container.querySelectorAll('.has-scheduled')).toHaveLength(1);
});

it('shows scheduled sessions for the selected day with a start button', () => {
  renderCalendar({ scheduled: [scheduledItem()] });
  expect(screen.getByText('Leg day')).toBeTruthy();
  expect(screen.getByText('Squat · Lunge')).toBeTruthy();
  expect(screen.getByRole('button', { name: /start/i })).toBeTruthy();
});

it('start loads the plan store and navigates to the workout page', () => {
  renderCalendar({ scheduled: [scheduledItem()] });
  fireEvent.click(screen.getByRole('button', { name: /start/i }));
  expect(usePlan.getState().plan.map((item) => item.exerciseId)).toEqual(['squat', 'lunge']);
  expect(usePlan.getState().workoutName).toBe('Leg day');
  expect(mockNavigate).toHaveBeenCalledWith('/workout');
});

it('schedules a session for the selected day through the form', async () => {
  const onScheduledChange = vi.fn();
  mockCreate.mockResolvedValue(scheduledItem());
  renderCalendar({ onScheduledChange });

  fireEvent.click(screen.getByRole('button', { name: /schedule a session/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Squat' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save session' }));

  await vi.waitFor(() => expect(mockCreate).toHaveBeenCalled());
  expect(mockCreate).toHaveBeenCalledWith({
    scheduled_date: todayKey(),
    name: undefined,
    exercises: ['squat'],
  });
  await vi.waitFor(() => expect(onScheduledChange).toHaveBeenCalled());
});

it('hides scheduling UI for guests', () => {
  const { container } = renderCalendar({ canSchedule: false, scheduled: [scheduledItem()] });
  expect(screen.queryByText('Leg day')).toBeNull();
  expect(screen.queryByRole('button', { name: /schedule a session/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /start/i })).toBeNull();
  // The day marker itself is harmless without the section.
  expect(container.querySelectorAll('.cal-sched')).toHaveLength(1);
});

// Session bars: one mini bar per recorded session on a day, capped at 3.
const groupsOn = (dateKey: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `g-${dateKey}-${i}`,
    name: '',
    sessions: [{ id: `s-${dateKey}-${i}`, exercise: 'squat' }],
    startedAt: `${dateKey}T10:00:00`,
    totalReps: 10,
    durationSeconds: 60,
  })) as never as Parameters<typeof WorkoutCalendar>[0]['workouts'];

it('shows one bar per session on the day cell', () => {
  const { container } = renderCalendar({ workouts: groupsOn(todayKey(), 2) });
  expect(container.querySelectorAll('.cal-day.has-workout .cal-bar')).toHaveLength(2);
  expect(container.querySelector('.cal-more')).toBeNull();
});

it('caps the bars at 3 with a +N overflow label', () => {
  const { container } = renderCalendar({ workouts: groupsOn(todayKey(), 5) });
  expect(container.querySelectorAll('.cal-day.has-workout .cal-bar')).toHaveLength(3);
  expect(container.querySelector('.cal-more')?.textContent).toBe('+2');
});
