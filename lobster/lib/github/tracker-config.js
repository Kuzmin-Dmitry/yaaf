/**
 * Symphony tracker configuration parser.
 *
 * Parses WORKFLOW.md front matter tracker config and resolves
 * environment variable references (e.g. $GITHUB_TOKEN).
 *
 * See docs/integrations/symphony.md for the runtime overview.
 */

/**
 * Resolve a value that may reference an environment variable.
 * Values starting with "$" are resolved from process.env.
 * @param {string} value
 * @returns {string|undefined}
 */
function resolveEnvVar(value) {
  if (typeof value !== 'string') return value;
  if (value.startsWith('$')) {
    const envName = value.slice(1);
    return process.env[envName];
  }
  return value;
}

/**
 * Parse "owner/repo" string into { owner, repo }.
 * @param {string} repoString
 * @returns {{ owner: string, repo: string }}
 */
function parseRepoString(repoString) {
  if (!repoString || typeof repoString !== 'string') {
    throw new Error('tracker.repo is required and must be a string in "owner/repo" format');
  }
  const parts = repoString.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid tracker.repo format: "${repoString}". Expected "owner/repo"`);
  }
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Parse and validate a GitHub tracker configuration block.
 *
 * @param {Object} tracker - raw tracker config from WORKFLOW.md front matter
 * @returns {Object} validated config for createSymphonyTrackerClient
 * @throws {Error} on missing required fields or invalid values
 */
function parseGitHubTrackerConfig(tracker) {
  if (!tracker || tracker.kind !== 'github') {
    throw new Error('tracker.kind must be "github"');
  }

  const { owner, repo } = parseRepoString(tracker.repo);

  const token = resolveEnvVar(tracker.api_key);
  if (!token) {
    throw new Error(
      `GitHub token not configured. Set tracker.api_key or ${tracker.api_key?.startsWith('$') ? tracker.api_key.slice(1) : 'GITHUB_TOKEN'
      } environment variable`
    );
  }

  const config = { owner, repo, token };

  if (tracker.endpoint) {
    config.endpoint = tracker.endpoint;
  }

  if (tracker.label_prefix) {
    config.label_prefix = tracker.label_prefix;
  }

  if (tracker.active_states) {
    if (!Array.isArray(tracker.active_states)) {
      throw new Error('tracker.active_states must be an array');
    }
    config.active_states = tracker.active_states;
  }

  if (tracker.terminal_states) {
    if (!Array.isArray(tracker.terminal_states)) {
      throw new Error('tracker.terminal_states must be an array');
    }
    config.terminal_states = tracker.terminal_states;
  }

  return config;
}

module.exports = { parseGitHubTrackerConfig, parseRepoString, resolveEnvVar };
