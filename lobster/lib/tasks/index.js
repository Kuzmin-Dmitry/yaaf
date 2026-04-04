/**
 * Tasks module — public API surface.
 *
 * Only re-exports symbols that external consumers (README examples, OpenClaw scripts) need.
 * Internal modules should require source files directly.
 */
const { approveTask } = require('./approve-task');
const { publishTask } = require('./publish-task');
const { TASK_STATES, TITLE_MAX_LENGTH, RESULT_TYPES, STATE_LABELS, APPROVAL_TRANSITIONS, TASK_TYPES, validateTaskObject } = require('./model');

module.exports = {
  approveTask,
  publishTask,
  TASK_STATES,
  TITLE_MAX_LENGTH,
  RESULT_TYPES,
  STATE_LABELS,
  APPROVAL_TRANSITIONS,
  TASK_TYPES,
  validateTaskObject,
};
