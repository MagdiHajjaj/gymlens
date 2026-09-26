import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backendToCanonicalGoal,
  canonicalToBackendGoal,
  getStoredGoalId,
  goalById,
} from '../src/features/goals/goals';
import { profileSubmitPayload } from '../src/pages/ProfilePage';
import type { AthleteProfileInput } from '../src/lib/api';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
});

beforeEach(() => store.clear());

describe('canonicalToBackendGoal', () => {
  it('maps every canonical goal to a backend bucket', () => {
    expect(canonicalToBackendGoal('strength')).toBe('strength');
    expect(canonicalToBackendGoal('form')).toBe('strength');
    expect(canonicalToBackendGoal('consistency')).toBe('general_fitness');
    expect(canonicalToBackendGoal('weight_loss')).toBe('general_fitness');
  });
});

describe('backendToCanonicalGoal', () => {
  it('maps stored backend values back to canonical goals', () => {
    expect(backendToCanonicalGoal('strength')).toBe('strength');
    expect(backendToCanonicalGoal('muscle')).toBe('strength');
    expect(backendToCanonicalGoal('mobility')).toBe('form');
    expect(backendToCanonicalGoal('general_fitness')).toBe('consistency');
  });

  it('returns null for missing or unknown values', () => {
    expect(backendToCanonicalGoal(null)).toBeNull();
    expect(backendToCanonicalGoal(undefined)).toBeNull();
    // @ts-expect-error - defensive: unknown strings from the backend
    expect(backendToCanonicalGoal('yoga')).toBeNull();
  });
});

describe('getStoredGoalId / goalById', () => {
  it('round-trips through the stubbed storage', () => {
    expect(getStoredGoalId()).toBeNull();
    store.set('gymlens.fitness_goal', 'form');
    expect(getStoredGoalId()).toBe('form');
  });

  it('rejects unknown stored values', () => {
    store.set('gymlens.fitness_goal', 'muscle');
    expect(getStoredGoalId()).toBeNull();
  });

  it('resolves goal metadata', () => {
    expect(goalById('weight_loss')?.name).toBe('Lose Weight');
    expect(goalById(null)).toBeNull();
  });
});

describe('profileSubmitPayload', () => {
  const base: AthleteProfileInput = {
    display_name: 'Yousif',
    fitness_goal: 'muscle',
    experience_level: 'intermediate',
    preferred_units: 'metric',
    height_cm: 180,
    weight_kg: 80,
    weekly_workout_target: 3,
  };

  it('writes the mapped backend goal for a canonical selection', () => {
    expect(profileSubmitPayload(base, 'form').fitness_goal).toBe('strength');
    expect(profileSubmitPayload(base, 'weight_loss').fitness_goal).toBe('general_fitness');
    expect(profileSubmitPayload(base, 'consistency').fitness_goal).toBe('general_fitness');
    expect(profileSubmitPayload(base, 'strength').fitness_goal).toBe('strength');
  });

  it('leaves other fields untouched', () => {
    const payload = profileSubmitPayload(base, 'form');
    expect(payload.display_name).toBe('Yousif');
    expect(payload.weekly_workout_target).toBe(3);
  });

  it('keeps the stored backend value when no canonical goal is set', () => {
    expect(profileSubmitPayload(base, null).fitness_goal).toBe('muscle');
  });
});
