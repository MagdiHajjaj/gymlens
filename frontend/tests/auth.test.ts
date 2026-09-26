import { describe, expect, it } from 'vitest';
import { safeReturnTo } from '../src/features/auth/redirect';

describe('login return routes', () => {
  it('preserves the requested local page, query, and fragment', () => {
    expect(safeReturnTo('/history?view=all#recent', 'https://gym.test')).toBe('/history?view=all#recent');
  });
  it.each([undefined, null, {}, 'https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)'])(
    'rejects unsafe or malformed callback state: %s',
    (value) => {
      expect(safeReturnTo(value, 'https://gym.test')).toBe('/');
    },
  );
});
