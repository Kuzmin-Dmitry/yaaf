/**
 * Step 5: Build TaskObject
 *
 * Assemble the final TaskObject from parsed fields.
 * Validate against schema. State is always Draft for new tasks.
 *
 * Early exit: Rejected if schema validation fails.
 */

const { RESULT_TYPES, validateTaskObject } = require('../model');

/**
 * @param {Object} parsed - merged field set
 * @returns {{ valid: boolean, task?: Object, result?: Object }}
 */
function buildTaskObject(parsed) {
  const task = {
    title: parsed.title.trim(),
    description: parsed.description || '',
    state: 'Draft',
  };

  const validation = validateTaskObject(task);
  if (!validation.valid) {
    return {
      valid: false,
      result: {
        type: RESULT_TYPES.Rejected,
        reason: 'schema_violation',
        details: validation.reason,
      },
    };
  }

  return { valid: true, task };
}

module.exports = { buildTaskObject };
