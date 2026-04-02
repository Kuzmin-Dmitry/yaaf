/**
 * Step 1: Enrich Context
 *
 * Fetches project metadata from the tracker — existing labels, recent tasks
 * (for dedup), project schema. Attaches a context object to pipeline state.
 *
 * No early exit. If tracker is unreachable, throws (infra failure).
 */

const { withTimeout } = require('./with-timeout');

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * @param {Object} tracker - tracker client with fetchRecentTasks()
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=10000] - timeout for tracker call
 * @returns {Object} context - { recentTasks: Array }
 */
async function enrichContext(tracker, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const recentTasks = await withTimeout(tracker.fetchRecentTasks(), timeoutMs);
  return { recentTasks };
}

module.exports = { enrichContext };
