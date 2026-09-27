// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HistorySummaryCard } from '../src/components/HistorySummaryCard';

const { mockHistorySummary, MockApiError } = vi.hoisted(() => {
  const mockHistorySummary = vi.fn();
  class MockApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { mockHistorySummary, MockApiError };
});
vi.mock('../src/lib/api', () => ({
  api: { historySummary: (...args: unknown[]) => mockHistorySummary(...args) },
  ApiError: MockApiError,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const canned = {
  recap: 'Three sessions in four days.',
  highlights: ['Trained 3 of the last 4 days'],
  trends: ['Squat volume leads pushup volume'],
  next_focus: 'Add a pulling movement',
  source: 'gemini' as const,
};

it('loads and renders the AI summary on click', async () => {
  mockHistorySummary.mockResolvedValue(canned);
  render(<HistorySummaryCard />);
  fireEvent.click(screen.getByRole('button', { name: /summarize my training/i }));
  expect(await screen.findByText('Three sessions in four days.')).toBeTruthy();
  expect(screen.getByText('Trained 3 of the last 4 days')).toBeTruthy();
  expect(screen.getByText('Squat volume leads pushup volume')).toBeTruthy();
  expect(screen.getByText('Add a pulling movement')).toBeTruthy();
});

it('explains an empty history (404)', async () => {
  mockHistorySummary.mockRejectedValue(new MockApiError('No training history yet', 404));
  render(<HistorySummaryCard />);
  fireEvent.click(screen.getByRole('button', { name: /summarize my training/i }));
  expect(await screen.findByText(/no training history yet/i)).toBeTruthy();
});

it('asks the user to wait when rate limited (429)', async () => {
  mockHistorySummary.mockRejectedValue(new MockApiError('Please wait before trying again', 429));
  render(<HistorySummaryCard />);
  fireEvent.click(screen.getByRole('button', { name: /summarize my training/i }));
  expect(await screen.findByText(/slow down/i)).toBeTruthy();
});
