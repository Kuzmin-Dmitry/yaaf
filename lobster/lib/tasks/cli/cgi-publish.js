#!/usr/bin/env node
/**
 * CLI step: publish validated task as a GitHub issue.
 *
 * Stdin: JSON — { task, project } from cgi-validate or terminal result (pass-through).
 * Stdout: JSON — Ready result or pass-through terminal.
 * Env: GITHUB_TOKEN
 */

const { createGitHubClient } = require('../../github/client');
const { STATE_LABELS, RESULT_TYPES } = require('../model');
const { runStdinStep } = require('./cli-io');

async function publishIssue(task, project, github) {
  const [owner, repo] = project.repo.split('/');
  const labels = [STATE_LABELS.Draft];
  if (task.type) labels.push(`type:${task.type}`);

  const issue = await github.createIssue(owner, repo, {
    title: task.title,
    body: task.body || undefined,
    labels,
  });

  return {
    type: RESULT_TYPES.Ready,
    task: {
      id: String(issue.number),
      url: issue.html_url,
      title: issue.title,
    },
  };
}

if (require.main === module) {
  runStdinStep(async (input) => {
    const github = createGitHubClient(process.env.GITHUB_TOKEN);
    return publishIssue(input.task, input.project, github);
  });
}

module.exports = { publishIssue };
