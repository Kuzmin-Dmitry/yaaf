/**
 * Step 6: Publish
 *
 * POST to tracker API. Create the issue. Return tracker response.
 *
 * No business-logic early exit. API errors are infra failures.
 */

const { RESULT_TYPES } = require('../model');
const { withTimeout } = require('./with-timeout');

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * @param {Object} task - validated TaskObject
 * @param {Object} tracker - tracker client with createIssue(task) → { id, url, title }
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=10000] - timeout for tracker call
 * @returns {Object} pipeline Ready result
 */
async function publish(task, tracker, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const created = await withTimeout(tracker.createIssue(task), timeoutMs);

  return {
    type: RESULT_TYPES.Ready,
    task: {
      id: created.id,
      url: created.url,
      title: created.title,
    },
  };
}

module.exports = { publish };
