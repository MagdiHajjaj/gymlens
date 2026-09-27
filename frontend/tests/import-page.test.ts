// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildSession, parseCsv } from '../src/pages/ImportPage';

describe('parseCsv', () => {
  it('parses valid rows and skips the header', () => {
    const { rows, errors } = parseCsv(
      'date, exercise, sets, reps, minutes, name\n2026-09-20, squat, 4, 10, 30, Leg day\n2026-09-22, pushup, 3, 15, , Push day',
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: '2026-09-20',
      exercise: 'squat',
      sets: 4,
      reps: 10,
      minutes: 30,
      name: 'Leg day',
    });
    expect(rows[1]).toMatchObject({ exercise: 'pushup', minutes: 20, name: 'Push day' });
  });

  it('flags bad dates, unknown exercises, and bad numbers', () => {
    const { rows, errors } = parseCsv(
      '2026-13-40, squat, 4, 10\n2099-01-01, squat, 4, 10\n2026-09-20, burpee, 4, 10\n2026-09-20, squat, 0, 10\n2026-09-20, squat, 4, x',
    );
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(5);
    expect(errors.map((e) => e.line)).toEqual([1, 2, 3, 4, 5]);
  });

  it('ignores blank lines and comments', () => {
    const { rows, errors } = parseCsv('# my old log\n\n2026-09-20, row, 3, 8, 15\n');
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].exercise).toBe('row');
  });
});

describe('buildSession', () => {
  it('expands sets x reps into spread rep events marked as import', () => {
    const session = buildSession(
      { line: 1, date: '2026-09-20', exercise: 'deadlift', sets: 2, reps: 3, minutes: 30, name: '' },
      'workout-1',
      new Date(2026, 8, 20, 9, 0, 0),
    );
    expect(session.source).toBe('import');
    expect(session.total_reps).toBe(6);
    expect(session.reps).toHaveLength(6);
    expect(session.reps.map((r) => r.rep_number)).toEqual([1, 2, 3, 4, 5, 6]);
    const times = session.reps.map((r) => Date.parse(r.completed_at));
    for (let i = 1; i < times.length; i += 1) expect(times[i]).toBeGreaterThan(times[i - 1]);
    expect(times[0]).toBeGreaterThanOrEqual(Date.parse(session.started_at));
    expect(times[times.length - 1]).toBeLessThanOrEqual(Date.parse(session.ended_at!));
    expect(session.metrics).toEqual([]);
  });
});
