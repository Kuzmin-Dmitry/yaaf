/**
 * Step 4: Rewrite Task
 *
 * LLM-powered task rewrite with architectural depth.
 * Takes the original issue, analysis, and code context to produce
 * an implementation-ready specification.
 */

/**
 * Build the rewrite prompt for the LLM.
 * @param {Object} issue - { title, body }
 * @param {Object} analysis - from step 3
 * @param {Object} codeContext - { repoTree, files }
 * @param {string|undefined} editNotes - user feedback from rejected approval
 * @returns {string}
 */
function buildRewritePrompt(issue, analysis, codeContext, editNotes) {
  const filesListing = codeContext.files
    .map((f) => `- ${f.path}`)
    .join('\n');

  const editSection = editNotes
    ? `## User Feedback\n${editNotes}\n\nIncorporate the feedback above into the rewritten task.`
    : '';

  return `You are rewriting a task to make it implementation-ready.

## Original Task
Title: ${issue.title}
Description: ${issue.body || '(no description)'}

## Analysis
Affected components: ${JSON.stringify(analysis.affected_components)}
Risks: ${JSON.stringify(analysis.risks)}
Dependencies: ${JSON.stringify(analysis.dependencies)}
Suggested approach: ${analysis.suggested_approach}

## Available Context Files
${filesListing}

${editSection}

## Instructions
Produce a rewritten task in markdown with these sections:
- Summary (1-2 sentence technical summary)
- Technical Context (affected components, architecture notes)
- Implementation Approach (step-by-step technical approach)
- Acceptance Criteria (checkbox list)
- Risks & Dependencies
- Affected Components (list of files/modules)

Then include the original description in a collapsed <details> block.

Return a JSON object: { "title": "...", "body": "..." }
The title should be the same or a refined version of the original.
The body should be the full markdown content.

Respond with valid JSON only.`;
}

/**
 * @param {Object} issue - { title, body }
 * @param {Object} analysis - from step 3
 * @param {Object} codeContext - { repoTree, files }
 * @param {Object} llm - LLM client with rewriteTask(prompt)
 * @param {string|undefined} editNotes - user feedback from rejected approval
 * @returns {Promise<{ title: string, body: string }>}
 */
async function rewriteTask(issue, analysis, codeContext, llm, editNotes) {
  const prompt = buildRewritePrompt(issue, analysis, codeContext, editNotes);
  return llm.rewriteTask(prompt);
}

module.exports = { rewriteTask, buildRewritePrompt };
