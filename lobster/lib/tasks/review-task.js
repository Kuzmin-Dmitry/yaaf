/**
 * review_task pipeline orchestrator
 *
 * Six steps: fetch → load-code-context → analyze → rewrite → submit-for-approval → update-issue.
 *
 * Supports partial_state for multi-turn clarification:
 *   - partial_state.answers: user answers to analysis questions (re-enters step 3)
 *   - partial_state.decision: "approve" | "reject" (re-enters step 6 or exits)
 *   - partial_state.edit_notes: user feedback for rewrite (re-enters step 4)
 *   - partial_state.analysis: cached analysis from previous invocation
 *   - partial_state.rewritten: cached rewritten task from previous invocation
 *   - partial_state.code_context: cached code context from previous invocation
 *   - partial_state.issue: cached issue from previous invocation
 *
 * Dependencies:
 *   - tracker: object with fetchIssue(id) and updateIssue(id, updates)
 *   - llm: object with analyzeTask(prompt) and rewriteTask(prompt)
 *   - agentRunner: object with runAgentJSON(agentId, task) — OpenClaw agent runner
 *   - owner: string — repo owner
 *   - repo: string — repo name
 */

const { RESULT_TYPES, REVIEW_LIMITS } = require('./model');
const { fetchTask } = require('./steps/fetch-task');
const { loadContext } = require('./steps/load-code-context');
const { analyzeTask } = require('./steps/analyze-task');
const { rewriteTask } = require('./steps/rewrite-task');
const { submitForApproval } = require('./steps/submit-for-approval');
const { updateIssue } = require('./steps/update-issue');

/**
 * Run the review_task pipeline.
 *
 * @param {Object} input
 * @param {string} input.issue_id - GitHub issue number to review
 * @param {Object|null} input.partial_state - null on first call, accumulated state on re-invoke
 * @param {Object} deps
 * @param {Object} deps.tracker - tracker client
 * @param {Object} deps.llm - LLM client with analyzeTask() and rewriteTask()
 * @param {Object} deps.agentRunner - OpenClaw agent runner with runAgentJSON()
 * @param {string} deps.owner - repo owner
 * @param {string} deps.repo - repo name
 * @returns {Object} one of Ready | NeedInfo | NeedDecision | Rejected
 */
async function reviewTask(input, deps) {
  const { issue_id, partial_state } = input;
  const { tracker, llm, agentRunner, owner, repo } = deps;

  // Handle approval decision from previous NeedDecision
  if (partial_state && partial_state.decision) {
    if (partial_state.decision === 'reject') {
      return {
        type: RESULT_TYPES.Rejected,
        reason: 'user_rejected',
        details: 'User rejected the architectural review',
      };
    }

    if (partial_state.decision === 'approve' && partial_state.rewritten) {
      return updateIssue(issue_id, partial_state.rewritten, tracker);
    }
  }

  // Handle edit feedback — re-enter rewrite step
  if (partial_state && partial_state.edit_notes && partial_state.analysis) {
    const editCount = partial_state.edit_count || 0;
    if (editCount >= REVIEW_LIMITS.maxEditRounds) {
      return {
        type: RESULT_TYPES.Rejected,
        reason: 'max_retries',
        details: `Maximum edit rounds (${REVIEW_LIMITS.maxEditRounds}) exceeded. Consider creating a new task.`,
      };
    }

    const issue = partial_state.issue;
    const codeContext = partial_state.code_context;
    const rewritten = await rewriteTask(issue, partial_state.analysis, codeContext, llm, partial_state.edit_notes);

    const result = submitForApproval(rewritten, issue);
    result.partial_state = {
      issue,
      code_context: codeContext,
      analysis: partial_state.analysis,
      rewritten,
      edit_count: editCount + 1,
    };
    return result;
  }

  // Step 1: Fetch task
  const fetch = await fetchTask(issue_id, tracker);
  if (!fetch.ok) return fetch.result;
  const issue = fetch.issue;

  // Step 2: Load code context (via Librarian agent)
  const codeContext = await loadContext(issue, agentRunner, owner, repo);

  // Step 3: Analyze task
  const clarificationCount = (partial_state && partial_state.clarification_count) || 0;
  if (clarificationCount >= REVIEW_LIMITS.maxAnalysisClarifications) {
    return {
      type: RESULT_TYPES.Rejected,
      reason: 'max_retries',
      details: `Maximum analysis clarification rounds (${REVIEW_LIMITS.maxAnalysisClarifications}) exceeded.`,
    };
  }

  const previousAnswers = partial_state && partial_state.answers;
  const analyze = await analyzeTask(issue, codeContext, llm, previousAnswers);
  if (!analyze.ok) {
    const result = analyze.result;
    result.partial_state = {
      issue,
      code_context: codeContext,
      clarification_count: clarificationCount + 1,
    };
    return result;
  }

  // Step 4: Rewrite task
  const rewritten = await rewriteTask(issue, analyze.analysis, codeContext, llm);

  // Step 5: Submit for approval
  const result = submitForApproval(rewritten, issue);
  result.partial_state = {
    issue,
    code_context: codeContext,
    analysis: analyze.analysis,
    rewritten,
    edit_count: 0,
  };
  return result;
}

module.exports = { reviewTask };
