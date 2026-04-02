/**
 * Tasks module export
 */
const { createTask } = require('./create-task');
const { approveTask } = require('./approve-task');
const { publishTask } = require('./publish-task');
const { projectStatus } = require('./project-status');
const { TASK_STATES, TITLE_MAX_LENGTH, RESULT_TYPES, STATE_LABELS, APPROVAL_TRANSITIONS, validateTaskObject } = require('./model');
const { validatePublishParams, parseGitHubProject } = require('./publish-task-model');

module.exports = {
  createTask,
  approveTask,
  publishTask,
  projectStatus,
  TASK_STATES,
  TITLE_MAX_LENGTH,
  RESULT_TYPES,
  STATE_LABELS,
  APPROVAL_TRANSITIONS,
  validateTaskObject,
  validatePublishParams,
  parseGitHubProject,
};
