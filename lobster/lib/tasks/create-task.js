/**
 * create_task — LEGACY programmatic API for task creation.
 *
 * The canonical workflow is `lobster/workflows/create-github-issue.lobster`
 * which uses split CLI steps: cgi-resolve → cgi-type → cgi-enrich → cgi-dedup → cgi-publish.
 *
 * This module is kept for backward compat and test coverage of shared steps.
 *
 * Pipeline: enrich → parse (LLM) → completeness → dedup → build → publish.
 */

const { enrichContext } = require('./steps/enrich-context');
const { parseRequest } = require('./steps/parse-request');
const { checkCompleteness } = require('./steps/check-completeness');
const { dedupCheck } = require('./steps/dedup-check');
const { buildTaskObject } = require('./steps/build-task-object');
const { publish } = require('./steps/publish');
/**
 * Run the create_task pipeline (programmatic API, backward compat).
 * Accepts injected tracker + llm deps for testability.
 */
async function createTask(input, deps) {
  const { request, partial_state } = input;
  const { tracker, llm } = deps;

  const context = await enrichContext(tracker);
  const parsed = await parseRequest(request, partial_state, context, llm);

  const completeness = checkCompleteness(parsed);
  if (!completeness.complete) return completeness.result;

  const dedup = dedupCheck(parsed, context);
  if (!dedup.clear) return dedup.result;

  const build = buildTaskObject(parsed);
  if (!build.valid) return build.result;

  return await publish(build.task, tracker);
}

module.exports = { createTask };
