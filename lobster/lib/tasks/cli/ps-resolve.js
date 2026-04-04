#!/usr/bin/env node
/**
 * CLI step: resolve project alias.
 * Usage: node ps-resolve.js --alias <alias>
 * Stdout: JSON — { project: {...} } or { type: "NeedInfo", ... }
 */

const { resolveProject, listKnownProjects } = require('../project-status-model');

function resolve(alias) {
  const project = resolveProject(alias);
  if (!project) {
    return {
      type: 'NeedInfo',
      missing: ['project_alias'],
      known_projects: listKnownProjects(),
    };
  }
  return { project: { key: project.key, repo: project.repo, stale_after_days: project.stale_after_days } };
}

if (require.main === module) {
  const idx = process.argv.indexOf('--alias');
  const alias = idx !== -1 ? process.argv[idx + 1] || null : null;
  const result = resolve(alias);
  process.stdout.write(JSON.stringify(result) + '\n');
}

module.exports = { resolve };
