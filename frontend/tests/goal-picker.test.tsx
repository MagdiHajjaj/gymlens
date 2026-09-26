// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GOALS } from '../src/features/goals/goals';
import { GoalPicker } from '../src/features/goals/GoalPicker';
import { GoalChip } from '../src/features/goals/GoalChip';
import { ProfileGoalSelect } from '../src/features/goals/ProfileGoalSelect';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

function optionButton(name: string) {
  return screen.getByRole('button', { name: new RegExp(name) });
}

describe('GoalPicker', () => {
  it('renders the four canonical goal options', () => {
    render(<GoalPicker />);
    for (const goal of GOALS) {
      expect(optionButton(goal.name)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('tapping an option visibly selects it and persists the choice', () => {
    render(<GoalPicker />);
    const button = optionButton('Improve Form');
    expect(button).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button.className).toContain('selected');
    expect(localStorage.getItem('gymlens.fitness_goal')).toBe('form');
  });

  it('tapping the selected option again deselects it', () => {
    render(<GoalPicker />);
    const button = optionButton('Build Strength');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('gymlens.fitness_goal')).toBeNull();
  });

  it('two pickers stay in sync through the shared hook', () => {
    render(
      <>
        <GoalPicker />
        <GoalPicker />
      </>,
    );
    const [first, second] = screen.getAllByRole('button', { name: /Stay Consistent/ });

    fireEvent.click(first);

    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(second).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('GoalChip', () => {
  it('links to the workout setup page', () => {
    render(
      <MemoryRouter>
        <GoalChip />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/workout');
  });

  it('shows "Not set" with no goal, then reflects a picked goal', () => {
    render(
      <MemoryRouter>
        <GoalChip />
        <GoalPicker />
      </MemoryRouter>,
    );
    expect(screen.getByText('Not set')).toBeInTheDocument();

    fireEvent.click(optionButton('Lose Weight'));

    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('Lose Weight');
    expect(link).not.toHaveTextContent('Not set');
  });
});

describe('ProfileGoalSelect', () => {
  it('offers exactly the four canonical goals', () => {
    render(<ProfileGoalSelect />);
    const select = screen.getByRole('combobox', { name: 'Primary goal *' });
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(options).toEqual(['', 'strength', 'form', 'consistency', 'weight_loss']);
    expect(select.textContent).not.toMatch(/Build muscle|Improve mobility|General fitness/);
  });

  it('stays in sync with the workout picker through the shared hook', () => {
    render(
      <>
        <ProfileGoalSelect />
        <GoalPicker />
      </>,
    );
    const select = screen.getByRole('combobox', { name: 'Primary goal *' }) as HTMLSelectElement;

    fireEvent.click(optionButton('Improve Form'));
    expect(select.value).toBe('form');

    fireEvent.change(select, { target: { value: 'strength' } });
    expect(optionButton('Build Strength')).toHaveAttribute('aria-pressed', 'true');
    expect(optionButton('Improve Form')).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('gymlens.fitness_goal')).toBe('strength');
  });
});
