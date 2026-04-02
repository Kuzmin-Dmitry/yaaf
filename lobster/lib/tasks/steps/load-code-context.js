/**
 * Step 2: Load Code Context
 *
 * Spawns the Librarian agent to explore the repository and select
 * relevant files for architectural review. The agent uses multi-hop
 * exploration (read structure → follow references → verify relevance)
 * instead of simple keyword matching.
 *
 * No early exit — agent or infra errors throw.
 */

const LIBRARIAN_AGENT_ID = 'librarian';

/**
 * Build the task prompt for the Librarian agent.
 * @param {Object} issue - { title, body }
 * @param {string} owner
 * @param {string} repo
 * @returns {string}
 */
function buildLibrarianTask(issue, owner, repo) {
  return [
    `Explore repository ${owner}/${repo} and find files relevant to this issue.`,
    '',
    `Issue title: ${issue.title}`,
    `Issue description: ${issue.body || '(no description)'}`,
    '',
    'Return JSON with repoTree, files, and totalSize as described in your instructions.',
  ].join('\n');
}

/**
 * @param {Object} issue - { title, body }
 * @param {Object} agentRunner - { runAgentJSON(agentId, task, options) }
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<{ repoTree: string[], files: Array<{ path: string, content: string }>, totalSize: number }>}
 */
async function loadContext(issue, agentRunner, owner, repo) {
  const task = buildLibrarianTask(issue, owner, repo);
  const result = await agentRunner.runAgentJSON(LIBRARIAN_AGENT_ID, task);

  if (result.error) {
    throw new Error(`Librarian agent error: ${result.error}`);
  }

  return {
    repoTree: result.repoTree || [],
    files: result.files || [],
    totalSize: result.totalSize || 0,
  };
}

module.exports = { loadContext, buildLibrarianTask, LIBRARIAN_AGENT_ID };
