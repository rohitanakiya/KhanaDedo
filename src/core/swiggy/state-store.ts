/**
 * Short-lived in-memory store mapping OAuth state -> per-user context.
 *
 * Lifecycle:
 *   - /auth/swiggy/start writes an entry keyed by `state`, containing
 *     { kdUserId, codeVerifier, returnTo }, with a ~10 minute TTL.
 *   - /auth/swiggy/callback reads + deletes the entry by `state` to
 *     get back the verifier and the user this flow belongs to.
 *
 * Why in-memory not Redis?
 *   - Single-instance deploy on Render free tier; nothing to share.
 *   - TTL is short (10 min), volume is tiny (one entry per OAuth
 *     attempt), so memory pressure is non-existent.
 *   - If we ever go multi-instance, swap for Redis with the same
 *     interface — caller code doesn't change.
 *
 * Entries auto-expire via setTimeout, so stale state never accumulates.
 */

export interface StateEntry {
  kdUserId: string;
  codeVerifier: string;
  /** Frontend URL to redirect to after successful auth. */
  returnTo: string;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes — generous; flow is usually <2 min

const store = new Map<string, StateEntry>();
const timers = new Map<string, NodeJS.Timeout>();

export function put(state: string, entry: StateEntry): void {
  // Clear any existing timer for this state (shouldn't happen, but
  // defensive — `state` is 24 random bytes so collisions are
  // astronomically unlikely).
  const existing = timers.get(state);
  if (existing) clearTimeout(existing);

  store.set(state, entry);
  const timer = setTimeout(() => {
    store.delete(state);
    timers.delete(state);
  }, TTL_MS);
  // Don't keep the event loop alive just for these timers.
  timer.unref();
  timers.set(state, timer);
}

/**
 * Reads and removes the entry for `state`. Returns null if no entry
 * exists (expired, never existed, or already consumed by an earlier
 * callback — codes are single-use, replay attempts return null).
 */
export function consume(state: string): StateEntry | null {
  const entry = store.get(state);
  if (!entry) return null;

  store.delete(state);
  const timer = timers.get(state);
  if (timer) {
    clearTimeout(timer);
    timers.delete(state);
  }

  return entry;
}

/** Test-only helper. Don't call from production code paths. */
export function _clearAll(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  store.clear();
  timers.clear();
}
