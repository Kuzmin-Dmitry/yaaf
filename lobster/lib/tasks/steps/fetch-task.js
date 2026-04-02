/**
 * Step 1: Fetch Task
 *
 * Retrieves an existing issue from the tracker for review.
 * Validates that the issue is in a reviewable state.
 *
 * Early exits:
 *   - Rejected(issue_not_found) — issue does not exist
 *   - Rejected(invalid_state) — issue is past reviewable states
 */

const { RESULT_TYPES, REVIEWABLE_STATES } = require('../model');

/**
 * @param {string} issueId
 * @param {Object} tracker - tracker client with fetchIssue()
 * @returns {Object} { issue } or early-exit result
 */
async function fetchTask(issueId, tracker) {
  if (!issueId) {
    return {
      ok: false,
      result: {
        type: RESULT_TYPES.Rejected,
        reason: 'missing_issue_id',
        details: 'issue_id is required',
      },
    };
  }

  const issue = await tracker.fetchIssue(issueId);

  if (!REVIEWABLE_STATES.includes(issue.state)) {
    return {
      ok: false,
      result: {
        type: RESULT_TYPES.Rejected,
        reason: 'invalid_state',
        details: `Cannot review issue in state "${issue.state}". Review is only valid for: ${REVIEWABLE_STATES.join(', ')}`,
      },
    };
  }

  return { ok: true, issue };
}

module.exports = { fetchTask };
