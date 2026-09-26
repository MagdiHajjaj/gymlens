import { useCallback, useState } from 'react';

export type GoalId = 'strength' | 'form' | 'consistency' | 'weight_loss';

export interface FitnessGoal {
  id: GoalId;
  name: string;
  description: string;
}

export const GOALS: FitnessGoal[] = [
  {
    id: 'strength',
    name: 'Build Strength',
    description: 'Progressive overload on solid, repeatable form.',
  },
  {
    id: 'form',
    name: 'Improve Form',
    description: 'Clean up technique cues one session at a time.',
  },
  {
    id: 'consistency',
    name: 'Stay Consistent',
    description: 'Show up regularly and keep your streaks alive.',
  },
  {
    id: 'weight_loss',
    name: 'Lose Weight',
    description: 'Full-body sessions with compound movements, done often.',
  },
];

const STORAGE_KEY = 'gymlens.fitness_goal';

function isGoalId(value: unknown): value is GoalId {
  return GOALS.some((goal) => goal.id === value);
}

export function getStoredGoalId(): GoalId | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isGoalId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function goalById(id: GoalId | null | undefined): FitnessGoal | null {
  return GOALS.find((goal) => goal.id === id) ?? null;
}

/**
 * The user's fitness goal, persisted in localStorage so it works for guests
 * and signed-in users alike. Client-side only — no backend changes needed.
 */
export function useFitnessGoal() {
  const [goalId, setGoalIdState] = useState<GoalId | null>(() => getStoredGoalId());

  const setGoalId = useCallback((id: GoalId | null) => {
    setGoalIdState(id);
    try {
      if (id === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Storage unavailable (private mode, etc.) — the goal just won't persist.
    }
  }, []);

  return { goalId, goal: goalById(goalId), setGoalId };
}
