#!/usr/bin/env node
/**
 * CLI step: validate all gates before publishing a GitHub issue.
 *
 * LEGACY — monolithic validation. New pipeline uses separate steps:
 *   cgi-resolve → cgi-type → cgi-enrich → cgi-dedup → cgi-publish
 *
 * Kept for backward compat and tests. Delegates to shared step functions.
 *
 * Args: --alias, --type, --title, --body, --partial-state
 * Stdout: JSON — { task, project } or terminal result
 */

const { RESULT_TYPES, TASK_TYPES } = require('../model');
const { createGitHubTracker } = require('../../github/tracker-adapter');
const { enrichContext } = require('../steps/enrich-context');
const { checkCompleteness } = require('../steps/check-completeness');
const { dedupCheck } = require('../steps/dedup-check');
const { buildTaskObject } = require('../steps/build-task-object');
const { resolveAlias } = require('./cgi-resolve');
const { validateType: validateTypeRich } = require('./cgi-type');
const { parseArg } = require('./cli-io');

/**
 * Validate task type (boolean API for backward compat).
 */
function validateType(type) {
  return validateTypeRich(type).valid;
}

/**
 * Build task object from parsed fields (CGI-specific: adds type and body).
 * Delegates validation to shared steps.
 */
function buildTask(parsed) {
  const completeness = checkCompleteness(parsed);
  if (!completeness.complete) return completeness.result;

  const build = buildTaskObject(parsed);
  if (!build.valid) return build.result;

  return {
    task: {
      ...build.task,
      body: parsed.body || '',
      type: parsed.type,
    },
  };
}

function validate(alias, type, title, body, partialState) {
  // Gate 1: resolve project
  const resolved = resolveAlias(alias);
  if (resolved.type) return resolved;

  // Gate 2: validate type
  const typeCheck = validateTypeRich(type);
  if (!typeCheck.valid) {
    return { type: RESULT_TYPES.NeedInfo, missing: ['task_type'], valid_types: TASK_TYPES };
  }

  const parsed = { ...(partialState || {}), title, body, type: typeCheck.normalized };
  return { _continue: true, project: resolved.project, parsed };
}

async function validateAsync(alias, type, title, body, partialState) {
  const gate = validate(alias, type, title, body, partialState);
  if (!gate._continue) return gate;

  const { project, parsed } = gate;
  const [owner, repo] = project.repo.split('/');

  // Gates 3-4: health check + enrich (fetch recent tasks)
  const tracker = createGitHubTracker({ owner, repo });
  const context = await enrichContext(tracker);

  // Gate 5: dedup (skip if partial_state has dedup_decision)
  const dedup = dedupCheck(parsed, context);
  if (!dedup.clear) return dedup.result;

  // Gate 6: build task
  const build = buildTask(parsed);
  if (build.type) return build;

  return { task: build.task, project: { key: project.key, repo: project.repo } };
}

if (require.main === module) {
  const alias = parseArg(process.argv, '--alias');
  const type = parseArg(process.argv, '--type');
  const title = parseArg(process.argv, '--title');
  const body = parseArg(process.argv, '--body');
  const psRaw = parseArg(process.argv, '--partial-state');
  const partialState = psRaw && psRaw !== 'null' ? JSON.parse(psRaw) : null;

  validateAsync(alias, type, title, body, partialState)
    .then((result) => {
      process.stdout.write(JSON.stringify(result) + '\n');
    })
    .catch((err) => {
      process.stderr.write(err.message + '\n');
      process.exit(1);
    });
}

module.exports = { validate, validateAsync, validateType, buildTask };
