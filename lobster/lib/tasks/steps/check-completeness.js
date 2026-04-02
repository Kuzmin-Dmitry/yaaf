/**
 * Step 3: Check Completeness
 *
 * Validate that all required fields are present and non-empty.
 * Currently only title is required.
 *
 * Early exit: NeedInfo if required fields are missing.
 */

const { RESULT_TYPES } = require('../model');

/**
 * @param {Object} parsed - merged field set from step 2
 * @returns {{ complete: boolean, result?: Object }} - if not complete, result is a NeedInfo object
 */
function checkCompleteness(parsed) {
  const missing = [];

  if (!parsed.title || typeof parsed.title !== 'string' || parsed.title.trim().length === 0) {
    missing.push('title');
  }

  if (missing.length > 0) {
    return {
      complete: false,
      result: {
        type: RESULT_TYPES.NeedInfo,
        missing,
        parsed_so_far: { ...parsed },
      },
    };
  }

  return { complete: true };
}

module.exports = { checkCompleteness };
