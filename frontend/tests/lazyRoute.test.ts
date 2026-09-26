import { describe, expect, it, vi } from 'vitest';
import { loadWithRecovery, type RecoveryDeps } from '../src/app/lazyRoute';

function makeDeps(overrides: Partial<RecoveryDeps> = {}): RecoveryDeps {
  return {
    getFlag: () => false,
    setFlag: vi.fn(),
    clearFlag: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  };
}

const FakeComponent = () => null;

describe('loadWithRecovery', () => {
  it('returns the module and clears the flag on success', async () => {
    const clearFlag = vi.fn();
    const reload = vi.fn();
    const deps = makeDeps({ getFlag: () => true, clearFlag, reload });
    const mod = await loadWithRecovery(async () => ({ default: FakeComponent }), deps);
    expect(mod.default).toBe(FakeComponent);
    expect(clearFlag).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once and rethrows when the chunk fails to load', async () => {
    const setFlag = vi.fn();
    const reload = vi.fn();
    const deps = makeDeps({ setFlag, reload });
    const boom = new Error('chunk failed');
    await expect(
      loadWithRecovery(async () => {
        throw boom;
      }, deps),
    ).rejects.toBe(boom);
    expect(setFlag).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload again when the flag is already set (no reload loop)', async () => {
    const reload = vi.fn();
    const deps = makeDeps({ getFlag: () => true, reload });
    const boom = new Error('chunk failed');
    await expect(
      loadWithRecovery(async () => {
        throw boom;
      }, deps),
    ).rejects.toBe(boom);
    expect(reload).not.toHaveBeenCalled();
  });
});
