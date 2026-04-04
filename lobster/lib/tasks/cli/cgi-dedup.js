#!/usr/bin/env node
/**
 * CLI step: validate + dedup check against existing GitHub issues.
 *
 * Stdin: JSON from cgi-enrich — { project, task_type, context }
 * Args: --title <title> --body <body> --partial-state <json>
 * Stdout: JSON — { task, project } or NeedInfo/NeedDecision/Rejected or pass-through terminal.
 */

const { validate } = require('./ct-validate');
const { parseArg, runStdinStep } = require('./cli-io');

if (require.main === module) {
  const title = parseArg(process.argv, '--title');
  const body = parseArg(process.argv, '--body');
  const psRaw = parseArg(process.argv, '--partial-state');
  const partialState = psRaw && psRaw !== 'null' ? JSON.parse(psRaw) : null;

  runStdinStep(async (input) => {
    const parsed = { ...(partialState || {}), title, body, type: input.task_type };

    const result = validate(parsed, input.context);
    if (result.type) return result; // terminal result (NeedInfo/NeedDecision/Rejected)

    // Attach CGI-specific fields to the task
    const task = { ...result.task, type: parsed.type, body: parsed.body || '' };
    return { task, project: input.project };
  });
}

module.exports = {};
