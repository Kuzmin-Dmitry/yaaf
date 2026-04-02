/**
 * Step 5: Submit for Approval
 *
 * Formats the rewritten task as a NeedDecision result for user review.
 * Always returns NeedDecision — no conditional logic.
 */

const { RESULT_TYPES } = require('../model');

/**
 * @param {Object} rewritten - { title, body } from step 4
 * @param {Object} originalIssue - { title, body } original issue
 * @returns {Object} NeedDecision result
 */
function submitForApproval(rewritten, originalIssue) {
  const titleChanged = rewritten.title !== originalIssue.title;
  const changes = [];
  if (titleChanged) changes.push('title refined');
  changes.push('body rewritten with technical depth');

  return {
    type: RESULT_TYPES.NeedDecision,
    phase: 'approval',
    rewritten_task: rewritten,
    options: ['approve', 'edit', 'reject'],
    diff_summary: changes.join('; '),
  };
}

module.exports = { submitForApproval };
