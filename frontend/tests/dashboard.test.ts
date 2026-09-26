import { describe, expect, it } from 'vitest';
import { badgeNumber } from '../src/pages/DashboardPage';

describe('badgeNumber', () => {
  it('pads single-digit exercise numbers without breaking double digits', () => {
    expect(badgeNumber(0)).toBe('01');
    expect(badgeNumber(8)).toBe('09');
    expect(badgeNumber(9)).toBe('10');
    expect(badgeNumber(10)).toBe('11');
  });
});
