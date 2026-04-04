#!/usr/bin/env node
/**
 * CLI step: validate AIF task type.
 *
 * Stdin: JSON from cgi-resolve — { project } or terminal result (pass-through).
 * Args: --type <type>
 * Stdout: JSON — { project, type } or NeedInfo or pass-through terminal.
 */

const { RESULT_TYPES, TASK_TYPES } = require('../model');
const { parseArg, runStdinStep } = require('./cli-io');

/**
 * Validate and normalize task type.
 * @param {string} type
 * @returns {{ valid: boolean, normalized?: string }}
 */
function validateType(type) {
  if (!type) return { valid: false };
  const normalized = type.toLowerCase().trim();
  return TASK_TYPES.includes(normalized)
    ? { valid: true, normalized }
    : { valid: false };
}

if (require.main === module) {
  const type = parseArg(process.argv, '--type');

  runStdinStep(async (input) => {
    const check = validateType(type);
    if (!check.valid) {
      return { type: RESULT_TYPES.NeedInfo, missing: ['task_type'], valid_types: TASK_TYPES };
    }
    return { ...input, task_type: check.normalized };
  });
}

module.exports = { validateType };
