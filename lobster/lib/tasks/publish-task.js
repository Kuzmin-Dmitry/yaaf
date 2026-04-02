/**
 * publish_task pipeline orchestrator
 *
 * Three sequential steps: validate → format → publish.
 * Supports dry-run mode to preview without creating real issues.
 *
 * Dependencies:
 *   - github: object with createIssue, findMilestone, addToProject
 */

const { RESULT_TYPES } = require('./model');
const { validateParams } = require('./steps/validate-publish-params');
const { formatIssueBody } = require('./steps/format-issue-body');
const { publishToGitHub } = require('./steps/publish-to-github');

/**
 * Run the publish_task pipeline.
 *
 * @param {Object} params
 * @param {string} params.github_project - 'owner/repo' or 'owner/repo/projectNumber'
 * @param {string} params.title - issue title (required)
 * @param {string} [params.description] - issue body (Markdown)
 * @param {string[]} [params.labels] - labels to set
 * @param {string[]} [params.assignees] - GitHub usernames
 * @param {string} [params.milestone] - milestone name
 * @param {string} [params.source_id] - yaaf task ID for cross-reference
 * @param {boolean} [params.dry_run] - preview without creating
 * @param {Object} deps
 * @param {Object} deps.github - GitHub client
 * @returns {Object} Ready | Rejected
 */
async function publishTask(params, deps) {
  const { github } = deps;

  // Step 1: Validate parameters
  const validation = validateParams(params);
  if (!validation.valid) {
    return validation.result;
  }

  // Step 2: Format issue body
  const formattedBody = formatIssueBody(params);

  // Step 3: Dry-run check — return preview without API calls
  if (params.dry_run) {
    return {
      type: RESULT_TYPES.Ready,
      dry_run: true,
      would_create: {
        github_project: params.github_project,
        title: params.title.trim(),
        body: formattedBody,
        labels: params.labels || [],
        assignees: params.assignees || [],
        milestone: params.milestone || null,
      },
    };
  }

  // Step 4: Publish to GitHub (create issue + optional project)
  return publishToGitHub({ ...params, formatted_body: formattedBody }, github);
}

module.exports = { publishTask };
