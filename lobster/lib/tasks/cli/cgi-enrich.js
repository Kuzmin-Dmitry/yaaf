#!/usr/bin/env node
/**
 * CLI step: health-check GitHub connectivity + enrich context (fetch recent tasks).
 *
 * Stdin: JSON from cgi-type — { project, task_type } or terminal result (pass-through).
 * Stdout: JSON — { project, task_type, context } or pass-through terminal.
 * Env: GITHUB_TOKEN
 */

const { createGitHubTracker } = require('../../github/tracker-adapter');
const { enrichContext } = require('../steps/enrich-context');
const { runStdinStep } = require('./cli-io');

if (require.main === module) {
  runStdinStep(async (input) => {
    const [owner, repo] = input.project.repo.split('/');
    const tracker = createGitHubTracker({ owner, repo });
    const context = await enrichContext(tracker);
    return { ...input, context };
  });
}

module.exports = {};
