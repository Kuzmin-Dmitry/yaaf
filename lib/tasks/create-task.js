/**
 * create_task pipeline orchestrator
 *
 * Six sequential steps: enrich → parse → completeness → dedup → build → publish.
 * Each step can exit early with a typed result.
 * Happy path falls through all six in one invocation.
 *
 * Dependencies:
 *   - tracker: object with fetchRecentTasks() and createIssue(task)
 *   - llm: object with extractFields(request, context)
 */

const { enrichContext } = require('./steps/enrich-context');
const { parseRequest } = require('./steps/parse-request');
const { checkCompleteness } = require('./steps/check-completeness');
const { dedupCheck } = require('./steps/dedup-check');
const { buildTaskObject } = require('./steps/build-task-object');
const { publish } = require('./steps/publish');

/**
 * Run the create_task pipeline.
 *
 * @param {Object} input
 * @param {string} input.request - raw user message (current turn)
 * @param {Object|null} input.partial_state - null on first call, or accumulated parsed data
 * @param {Object} deps
 * @param {Object} deps.tracker - tracker client
 * @param {Object} deps.llm - LLM client
 * @returns {Object} one of Ready | NeedInfo | NeedDecision | Rejected
 */
async function createTask(input, deps) {
  const { request, partial_state } = input;
  const { tracker, llm } = deps;

  // Step 1: Enrich context
  const context = await enrichContext(tracker);

  // Step 2: Parse request (merge with partial_state)
  const parsed = await parseRequest(request, partial_state, context, llm);

  // Step 3: Check completeness
  const completeness = checkCompleteness(parsed);
  if (!completeness.complete) {
    return completeness.result;
  }

  // Step 4: Dedup check
  const dedup = dedupCheck(parsed, context);
  if (!dedup.clear) {
    return dedup.result;
  }

  // Step 5: Build TaskObject
  const build = buildTaskObject(parsed);
  if (!build.valid) {
    return build.result;
  }

  // Step 6: Publish
  return await publish(build.task, tracker);
}

module.exports = { createTask };
