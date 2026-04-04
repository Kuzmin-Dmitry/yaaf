#!/usr/bin/env node
/**
 * CLI step: resolve AIF project alias.
 *
 * Args: --alias <alias>
 * Stdout: JSON — { project, ...pass-through } or NeedInfo
 *
 * Receives title/body/type via stdin (from previous step or initial JSON).
 */

const { resolveProject, listKnownProjects } = require('../project-status-model');
const { RESULT_TYPES } = require('../model');
const { parseArg } = require('./cli-io');

/**
 * Resolve AIF project alias to project descriptor.
 * @param {string} alias
 * @returns {Object} { project } or NeedInfo result
 */
function resolveAlias(alias) {
  const project = resolveProject(alias);
  if (!project) {
    return {
      type: RESULT_TYPES.NeedInfo,
      missing: ['project_alias'],
      known_projects: listKnownProjects(),
    };
  }
  return { project: { key: project.key, repo: project.repo } };
}

if (require.main === module) {
  const alias = parseArg(process.argv, '--alias');
  const result = resolveAlias(alias);
  process.stdout.write(JSON.stringify(result) + '\n');
}

module.exports = { resolveAlias };
