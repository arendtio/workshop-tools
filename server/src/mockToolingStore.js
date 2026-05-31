/**
 * @deprecated Session-scoped in-memory store — use persistent SQLite via toolingMock/store.js.
 */
import { ensureToolingMockSeeded, runToolingMockCall } from "./toolingMock/store.js";

export { ensureToolingMockSeeded, ensureToolingMockSeeded as ensureToolingMockDatabase, runToolingMockCall };

/** Ensures DB exists; returns sentinel for legacy callers. */
export function createMockToolingSession() {
  ensureToolingMockSeeded();
  return "persistent";
}

/** @param {string} _id */
export function hasMockToolingSession(_id) {
  ensureToolingMockSeeded();
  return true;
}

/**
 * @param {string} _sessionId
 * @param {Parameters<typeof runToolingMockCall>[0]} raw
 */
export function runMockToolingCall(_sessionId, raw) {
  return runToolingMockCall(raw);
}
