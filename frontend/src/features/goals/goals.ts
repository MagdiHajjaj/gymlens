import { useCallback, useEffect, useState } from 'react';

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

/**
 * The backend athlete profile stores `fitness_goal` in an older, vaguer
 * vocabulary than the canonical list above (which drives session insights).
 * The canonical local goal is the source of truth; these mappings only
 * translate at the profile sync boundary and are intentionally lossy.
 */
export type BackendGoalId = 'strength' | 'muscle' | 'mobility' | 'general_fitness';

/** Canonical goal -> backend profile field. Every canonical goal has a bucket. */
export function canonicalToBackendGoal(id: GoalId): BackendGoalId {
  switch (id) {
    case 'strength':
      return 'strength';
    case 'form':
      return 'strength'; // closest backend bucket: technique work under strength
    case 'consistency':
      return 'general_fitness';
    case 'weight_loss':
      return 'general_fitness';
  }
}

/**
 * Backend profile field -> canonical goal. Used only to seed the local goal
 * when the user has never chosen one explicitly; an explicit local choice
 * always wins over this vaguer mapped value.
 */
export function backendToCanonicalGoal(value: BackendGoalId | null | undefined): GoalId | null {
  switch (value) {
    case 'strength':
      return 'strength';
    case 'muscle':
      return 'strength'; // folded into the canonical strength goal
    case 'mobility':
      return 'form'; // closest canonical goal
    case 'general_fitness':
      return 'consistency';
    default:
      return null;
  }
}

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
 *
 * Every mounted instance stays in sync: setGoalId broadcasts a same-document
 * event so a picker on one screen immediately reflects a change made on
 * another, and the 'storage' event keeps separate tabs aligned.
 */
const CHANGE_EVENT = 'gymlens:fitness-goal-changed';

export function useFitnessGoal() {
  const [goalId, setGoalIdState] = useState<GoalId | null>(() => getStoredGoalId());

  useEffect(() => {
    const onChange = (event: Event) => setGoalIdState((event as CustomEvent<GoalId | null>).detail);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setGoalIdState(isGoalId(event.newValue) ? event.newValue : null);
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setGoalId = useCallback((id: GoalId | null) => {
    setGoalIdState(id);
    try {
      if (id === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Storage unavailable (private mode, etc.) — the goal just won't persist.
    }
    window.dispatchEvent(new CustomEvent<GoalId | null>(CHANGE_EVENT, { detail: id }));
  }, []);

  return { goalId, goal: goalById(goalId), setGoalId };
}
