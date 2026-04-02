/**
 * Step 3: Analyze Task
 *
 * LLM-powered architectural analysis of a task against the codebase.
 * Uses the architect skill prompt as system context.
 *
 * Early exit:
 *   - NeedInfo(phase="analysis") when technical_gaps are detected
 */

const { RESULT_TYPES } = require('../model');

/**
 * Build the analysis prompt for the LLM.
 * @param {Object} issue - { title, body }
 * @param {Object} codeContext - { repoTree, files }
 * @param {string[]|undefined} previousAnswers
 * @returns {string}
 */
function buildAnalysisPrompt(issue, codeContext, previousAnswers) {
  const treeListing = codeContext.repoTree.join('\n');
  const fileContents = codeContext.files
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

  const answersSection = previousAnswers && previousAnswers.length > 0
    ? `## Previous Clarifications\n${previousAnswers.join('\n')}`
    : '';

  return `You are reviewing a task for implementation readiness.

## Task
Title: ${issue.title}
Description: ${issue.body || '(no description)'}

## Project Code Context
Repository tree:
${treeListing}

Key files:
${fileContents}

${answersSection}

## Instructions
Analyze this task and produce a JSON object with:
1. affected_components: string[] — files/modules that will need changes
2. technical_gaps: string[] — questions that must be answered before implementation
3. risks: string[] — architectural risks or concerns
4. dependencies: string[] — external/internal dependencies
5. suggested_approach: string — high-level implementation approach
6. completeness_score: number (1-5) — how ready is this task for implementation

If technical_gaps is non-empty, the pipeline will ask the user.
If completeness_score >= 4 and no gaps, proceed to rewrite.

Respond with valid JSON only.`;
}

/**
 * @param {Object} issue - { title, body }
 * @param {Object} codeContext - { repoTree, files }
 * @param {Object} llm - LLM client with analyzeTask(systemPrompt, userPrompt)
 * @param {string[]|undefined} previousAnswers - from partial_state.answers
 * @returns {Object} { ok, analysis } or { ok: false, result: NeedInfo }
 */
async function analyzeTask(issue, codeContext, llm, previousAnswers) {
  const prompt = buildAnalysisPrompt(issue, codeContext, previousAnswers);
  const analysis = await llm.analyzeTask(prompt);

  if (analysis.technical_gaps && analysis.technical_gaps.length > 0) {
    return {
      ok: false,
      result: {
        type: RESULT_TYPES.NeedInfo,
        phase: 'analysis',
        questions: analysis.technical_gaps,
        analysis_so_far: analysis,
      },
    };
  }

  return { ok: true, analysis };
}

module.exports = { analyzeTask, buildAnalysisPrompt };
