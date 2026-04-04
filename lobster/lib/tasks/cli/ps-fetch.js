#!/usr/bin/env node
/**
 * CLI step: fetch all open issues from GitHub.
 * Stdin: JSON from ps-resolve (project descriptor or terminal result).
 * Stdout: JSON — { project, issues: [...] } or pass-through terminal result.
 * Env: GITHUB_TOKEN
 */

const { createGitHubClient } = require('../../github/client');
const { runStdinStep } = require('./cli-io');

const PER_PAGE = 100;

async function fetchAllOpenIssues(github, owner, repo) {
  const allIssues = [];
  let page = 1;

  while (true) {
    const batch = await github.listIssues(owner, repo, {
      state: 'open',
      perPage: PER_PAGE,
      sort: 'updated',
      direction: 'desc',
      page,
    });

    for (const item of batch) {
      if (item.pull_request) continue;
      allIssues.push({
        number: item.number,
        title: item.title,
        url: item.html_url,
        labels: (item.labels || []).map((l) => typeof l === 'string' ? l : l.name),
        updated_at: item.updated_at,
      });
    }

    if (batch.length < PER_PAGE) break;
    page++;
  }

  return allIssues;
}

if (require.main === module) {
  runStdinStep(async (input) => {
    const { project } = input;
    const [owner, repo] = project.repo.split('/');
    const github = createGitHubClient(process.env.GITHUB_TOKEN);
    const issues = await fetchAllOpenIssues(github, owner, repo);
    return { project, issues };
  });
}

module.exports = { fetchAllOpenIssues };
