/**
 * Step 6: Update Issue
 *
 * PATCH the GitHub issue with rewritten content and add review label.
 * API errors are infra failures (throw).
 */

const { RESULT_TYPES, REVIEW_LABEL } = require('../model');

/**
 * @param {string} issueId
 * @param {Object} rewritten - { title, body }
 * @param {Object} tracker - tracker client with updateIssue()
 * @returns {Object} Ready result
 */
async function updateIssue(issueId, rewritten, tracker) {
  const updated = await tracker.updateIssue(issueId, {
    body: rewritten.body,
    addLabels: [REVIEW_LABEL],
  });

  return {
    type: RESULT_TYPES.Ready,
    task: {
      id: updated.id,
      url: updated.url,
      title: updated.title,
      changes_summary: 'Issue body rewritten with architectural review',
    },
  };
}

module.exports = { updateIssue };
