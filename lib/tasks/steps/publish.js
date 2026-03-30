/**
 * Step 6: Publish
 *
 * POST to tracker API. Create the issue. Return tracker response.
 *
 * No business-logic early exit. API errors are infra failures.
 */

const { RESULT_TYPES } = require('../model');

/**
 * @param {Object} task - validated TaskObject
 * @param {Object} tracker - tracker client with createIssue(task) → { id, url, title }
 * @returns {Object} pipeline Ready result
 */
async function publish(task, tracker) {
  const created = await tracker.createIssue(task);

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
