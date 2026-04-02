/**
 * Step: Publish to GitHub
 *
 * Creates issue via GitHub API. Optionally resolves milestone and adds
 * issue to GitHub Project v2.
 *
 * API errors are infra failures (thrown). Milestone not found is Rejected.
 */

const { RESULT_TYPES } = require('../model');
const { parseGitHubProject } = require('../publish-task-model');

/**
 * @param {Object} params - validated params with formatted_body attached
 * @param {Object} github - GitHub client with createIssue, findMilestone, addToProject
 * @returns {Object} Ready result with issue details, or Rejected for milestone_not_found
 */
async function publishToGitHub(params, github) {
  const { owner, repo, projectNumber } = parseGitHubProject(params.github_project);

  // Resolve milestone name → number
  let milestoneNumber = null;
  if (params.milestone) {
    milestoneNumber = await github.findMilestone(owner, repo, params.milestone);
    if (milestoneNumber == null) {
      return {
        type: RESULT_TYPES.Rejected,
        reason: 'milestone_not_found',
        details: `Milestone "${params.milestone}" not found in ${owner}/${repo}`,
      };
    }
  }

  // Create issue
  const issue = await github.createIssue(owner, repo, {
    title: params.title.trim(),
    body: params.formatted_body,
    labels: params.labels || [],
    assignees: params.assignees || [],
    milestone: milestoneNumber,
  });

  // Add to project if project number specified
  let projectItem = null;
  if (projectNumber) {
    projectItem = await github.addToProject(projectNumber, owner, issue.node_id);
  }

  return {
    type: RESULT_TYPES.Ready,
    issue: {
      id: issue.number,
      url: issue.html_url,
      title: issue.title,
      node_id: issue.node_id,
    },
    project: projectItem ? { added: true, projectNumber } : null,
  };
}

module.exports = { publishToGitHub };
