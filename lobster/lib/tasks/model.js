/**
 * Task model — schema, states, and validation for create_task pipeline.
 */

const TASK_STATES = ['Draft', 'Backlog', 'Ready', 'InProgress', 'InReview', 'Done'];

const TITLE_MAX_LENGTH = 200;

const RESULT_TYPES = {
  Ready: 'Ready',
  NeedInfo: 'NeedInfo',
  NeedDecision: 'NeedDecision',
  Rejected: 'Rejected',
};

/**
 * Map task states to GitHub issue labels.
 */
const STATE_LABELS = {
  Draft: 'status:draft',
  Backlog: 'status:backlog',
  Ready: 'status:ready',
  InProgress: 'status:in-progress',
  InReview: 'status:in-review',
  Done: 'status:done',
};

/**
 * Valid approval transitions: current → next.
 */
const APPROVAL_TRANSITIONS = {
  Draft: 'Backlog',
  Backlog: 'Ready',
};

/**
 * Validate a TaskObject against schema.
 * @param {Object} task - { title, description, state }
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateTaskObject(task) {
  if (!task.title || typeof task.title !== 'string' || task.title.trim().length === 0) {
    return { valid: false, reason: 'Title is required and must be a non-empty string' };
  }
  if (task.title.length > TITLE_MAX_LENGTH) {
    return { valid: false, reason: `Title exceeds ${TITLE_MAX_LENGTH} characters` };
  }
  if (!TASK_STATES.includes(task.state)) {
    return { valid: false, reason: `Invalid state: ${task.state}` };
  }
  return { valid: true };
}

module.exports = {
  TASK_STATES,
  TITLE_MAX_LENGTH,
  RESULT_TYPES,
  STATE_LABELS,
  APPROVAL_TRANSITIONS,
  validateTaskObject,
};
