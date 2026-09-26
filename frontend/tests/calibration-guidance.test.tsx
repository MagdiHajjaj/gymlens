// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkoutSetup, calibrationGuidance } from '../src/features/workout/WorkoutSetup';
import { VoiceCoach } from '../src/features/coaching/VoiceCoach';
import { usePlan } from '../src/features/workout/planStore';
import { useWorkout } from '../src/features/workout/workoutStore';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  usePlan.setState({ plan: [], completedExerciseIds: [] });
  useWorkout.setState({ selected: 'pushup', selectedIds: ['pushup'] });
});

const renderSetup = (entry = '/workout') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <WorkoutSetup demo={false} voiceCoach={new VoiceCoach()} onVoice={() => {}} onStart={vi.fn()} />
    </MemoryRouter>,
  );

it('renders the calibration tip with proper word spacing (regression: "plankand")', () => {
  renderSetup();
  // Step 1 aside: "To calibrate: Hold your plank and hold still for a moment."
  expect(screen.getByText(/Hold your plank and hold still for a moment/)).toBeTruthy();
  expect(screen.queryByText(/plankand/)).toBeNull();
});

it('builds the camera-setup guidance with proper word spacing', () => {
  // The live-camera step can't run in jsdom (no camera), so the composed copy
  // is covered at the unit level through its single source of truth.
  expect(calibrationGuidance('Hold your plank')).toBe('Hold your plank and hold still for a moment.');
  expect(calibrationGuidance('Extend your legs')).toBe('Extend your legs and hold still for a moment.');
  expect(calibrationGuidance('Hold your plank')).not.toMatch(/plankand/);
  expect(calibrationGuidance('Extend your legs')).not.toMatch(/legsand/);
});

it('keeps word spacing for leg exercises (regression: "legsand")', () => {
  useWorkout.setState({ selected: 'squat', selectedIds: ['squat'] });
  renderSetup();
  expect(screen.getByText(/Extend your legs and hold still for a moment/)).toBeTruthy();
  expect(screen.queryByText(/legsand/)).toBeNull();
});
