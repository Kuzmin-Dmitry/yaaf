/**
 * approve_task pipeline orchestrator
 *
 * Three sequential steps: fetch → validate → approve.
 *
 * Transitions:
 *   Draft   → Backlog  (first approval)
 *   Backlog → Ready    (second approval)
 *
 * Uses GitHub issue labels (status:draft, status:backlog, status:ready)
 * to track state.
 *
 * Dependencies:
 *   - tracker: object with fetchIssue(id) and approveIssue(id)
 */

const { RESULT_TYPES, APPROVAL_TRANSITIONS } = require('./model');

/**
 * Run the approve_task pipeline.
 *
 * @param {Object} input
 * @param {string} input.issue_id - GitHub issue number to approve
 * @param {Object} deps
 * @param {Object} deps.tracker - tracker client with fetchIssue() and approveIssue()
 * @returns {Object} Ready | Rejected
 */
async function approveTask(input, deps) {
  const { issue_id } = input;
  const { tracker } = deps;

  if (!issue_id) {
    return {
      type: RESULT_TYPES.Rejected,
      reason: 'missing_issue_id',
      details: 'issue_id is required',
    };
  }

  // Step 1: Fetch current issue state
  const issue = await tracker.fetchIssue(issue_id);

  // Step 2: Validate transition is allowed
  const nextState = APPROVAL_TRANSITIONS[issue.state];
  if (!nextState) {
    return {
      type: RESULT_TYPES.Rejected,
      reason: 'invalid_transition',
      details: `Cannot approve issue in state "${issue.state}". Approval is only valid for: ${Object.keys(APPROVAL_TRANSITIONS).join(', ')}`,
    };
  }

  // Step 3: Execute approval (swap labels), pass pre-fetched issue to avoid double API call
  const result = await tracker.approveIssue(issue_id, issue);

  return {
    type: RESULT_TYPES.Ready,
    task: {
      id: result.id,
      title: result.title,
      previousState: result.previousState,
      newState: result.newState,
    },
  };
}

module.exports = { approveTask };
