/**
 * Shared validation utilities for task creation pipelines.
 *
 * merge()    — merge extracted title/description with partial_state
 * validate() — run completeness → dedup → build chain
 *
 * Used by: cgi-dedup.js (create-github-issue pipeline), programmatic tests.
 */

const { checkCompleteness } = require('../steps/check-completeness');
const { dedupCheck } = require('../steps/dedup-check');
const { buildTaskObject } = require('../steps/build-task-object');

function merge(title, description, partialState) {
  const base = partialState || {};
  const merged = { ...base };
  if (title) merged.title = title;
  if (description) merged.description = description;
  return merged;
}

function validate(parsed, context) {
  const completeness = checkCompleteness(parsed);
  if (!completeness.complete) return completeness.result;

  const dedup = dedupCheck(parsed, context);
  if (!dedup.clear) return dedup.result;

  const build = buildTaskObject(parsed);
  if (!build.valid) return build.result;

  return { task: build.task };
}

module.exports = { merge, validate };
