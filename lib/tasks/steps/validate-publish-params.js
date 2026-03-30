/**
 * Step: Validate publish parameters
 *
 * Deterministic. Checks github_project format, title, description length,
 * labels, assignees, milestone types.
 *
 * Early exit: Rejected if validation fails.
 */

const { RESULT_TYPES } = require('../model');
const { validatePublishParams } = require('../publish-task-model');

/**
 * @param {Object} params - publish task input
 * @returns {{ valid: boolean, result?: Object }}
 */
function validateParams(params) {
  const validation = validatePublishParams(params);
  if (!validation.valid) {
    return {
      valid: false,
      result: {
        type: RESULT_TYPES.Rejected,
        reason: 'invalid_params',
        details: validation.errors,
      },
    };
  }
  return { valid: true };
}

module.exports = { validateParams };
