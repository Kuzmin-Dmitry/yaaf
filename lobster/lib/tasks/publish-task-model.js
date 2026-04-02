/**
 * Publish-task model — validation rules and constants for GitHub issue publishing.
 */

const GITHUB_PROJECT_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:\/\d+)?$/;
// 300 chars — GitHub API limit. create_task uses a stricter 200 (see model.js TITLE_MAX_LENGTH).
const TITLE_MAX = 300;
const DESCRIPTION_MAX = 65536;
const LABELS_MAX = 50;
const LABEL_LENGTH_MAX = 50;
const ASSIGNEES_MAX = 10;

/**
 * Validate publish parameters against schema.
 * @param {Object} params
 * @returns {{ valid: boolean, errors?: string[] }}
 */
function validatePublishParams(params) {
  const errors = [];

  // github_project: required, format owner/repo or owner/repo/N
  if (!params.github_project || typeof params.github_project !== 'string') {
    errors.push('github_project is required');
  } else if (!GITHUB_PROJECT_RE.test(params.github_project)) {
    errors.push('Invalid github_project format. Use owner/repo or owner/repo/project-number');
  }

  // title: required, 1-300 chars
  if (!params.title || typeof params.title !== 'string' || params.title.trim().length === 0) {
    errors.push('title is required and must be a non-empty string');
  } else if (params.title.length > TITLE_MAX) {
    errors.push(`title exceeds ${TITLE_MAX} characters`);
  }

  // description: optional, max 65536
  if (params.description != null && typeof params.description === 'string' && params.description.length > DESCRIPTION_MAX) {
    errors.push(`description exceeds ${DESCRIPTION_MAX} characters`);
  }

  // labels: optional array, max 50 items, each 1-50 chars
  if (params.labels != null) {
    if (!Array.isArray(params.labels)) {
      errors.push('labels must be an array');
    } else {
      if (params.labels.length > LABELS_MAX) {
        errors.push(`labels array exceeds ${LABELS_MAX} items`);
      }
      for (const label of params.labels) {
        if (typeof label !== 'string' || label.length === 0 || label.length > LABEL_LENGTH_MAX) {
          errors.push(`Each label must be a string of 1-${LABEL_LENGTH_MAX} characters`);
          break;
        }
      }
    }
  }

  // assignees: optional array, max 10
  if (params.assignees != null) {
    if (!Array.isArray(params.assignees)) {
      errors.push('assignees must be an array');
    } else if (params.assignees.length > ASSIGNEES_MAX) {
      errors.push(`assignees array exceeds ${ASSIGNEES_MAX} items`);
    }
  }

  // milestone: optional string
  if (params.milestone != null && typeof params.milestone !== 'string') {
    errors.push('milestone must be a string');
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

/**
 * Parse github_project string into components.
 * @param {string} githubProject - 'owner/repo' or 'owner/repo/projectNumber'
 * @returns {{ owner: string, repo: string, projectNumber: number|null }}
 */
function parseGitHubProject(githubProject) {
  const parts = githubProject.split('/');
  return {
    owner: parts[0],
    repo: parts[1],
    projectNumber: parts.length === 3 ? parseInt(parts[2], 10) : null,
  };
}

module.exports = {
  GITHUB_PROJECT_RE,
  TITLE_MAX,
  DESCRIPTION_MAX,
  LABELS_MAX,
  LABEL_LENGTH_MAX,
  ASSIGNEES_MAX,
  validatePublishParams,
  parseGitHubProject,
};
