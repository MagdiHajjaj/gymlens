import { lazy, type ComponentType } from 'react';

const RELOAD_FLAG = 'gymlens-chunk-reload';

function flagSet(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === '1';
  } catch {
    return false;
  }
}

function setFlag(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    /* Storage unavailable: fall through and surface the original error. */
  }
}

function clearFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* ignore */
  }
}

export interface RecoveryDeps {
  getFlag: () => boolean;
  setFlag: () => void;
  clearFlag: () => void;
  reload: () => void;
}

const defaultDeps: RecoveryDeps = {
  getFlag: flagSet,
  setFlag,
  clearFlag,
  reload: () => window.location.reload(),
};

/**
 * Import a route chunk, recovering from stale hashed assets.
 *
 * The app ships hashed JS chunks. If a redeploy lands between the initial
 * page load and an SPA navigation, the old chunk URL no longer exists and
 * the dynamic import rejects (the CDN rewrite serves index.html, so it
 * fails as a syntax error). Without recovery React throws into the app
 * error boundary ("Let's reset your workspace") even though a reload
 * would fix it.
 *
 * On the first chunk-load failure we reload the page once so the browser
 * picks up fresh asset hashes. The flag prevents a reload loop if the
 * chunk genuinely cannot load; the second failure propagates to the
 * error boundary as before.
 */
export async function loadWithRecovery<T extends ComponentType<object>>(
  importer: () => Promise<{ default: T }>,
  deps: RecoveryDeps = defaultDeps,
) {
  try {
    const mod = await importer();
    deps.clearFlag();
    return mod;
  } catch (err) {
    if (!deps.getFlag()) {
      deps.setFlag();
      deps.reload();
    }
    throw err;
  }
}

/** React.lazy wrapper around {@link loadWithRecovery} for route components. */
export function lazyRoute<T extends ComponentType<object>>(
  importer: () => Promise<{ default: T }>,
) {
  return lazy(() => loadWithRecovery(importer));
}
