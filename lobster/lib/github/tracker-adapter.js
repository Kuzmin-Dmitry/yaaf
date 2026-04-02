/**
 * GitHub Tracker Adapter
 *
 * Wraps the GitHub API client to implement the tracker contract
 * expected by the create_task pipeline:
 *   - fetchRecentTasks() → Array<{ id, title, state }>
 *   - createIssue(task)  → { id, url, title }
 *
 * Configured with owner/repo at creation time.
 */

const { createGitHubClient } = require('./client');
const fs = require('fs');
const path = require('path');

/**
 * Read GitHub token from OpenClaw auth-profiles.json.
 * @param {string} [agentDir] - path to agent dir containing auth-profiles.json
 * @returns {string|null}
 */
function readTokenFromAuthProfiles(agentDir) {
  const openclawHome = process.env.OPENCLAW_HOME || path.join(require('os').homedir(), '.openclaw');
  const candidates = agentDir
    ? [path.join(agentDir, 'auth-profiles.json')]
    : [
      path.join(openclawHome, 'agents', 'pm', 'agent', 'auth-profiles.json'),
      path.join(openclawHome, 'agents', 'main', 'agent', 'auth-profiles.json'),
    ];

  for (const filePath of candidates) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const profile = data.profiles?.['github:default'];
      if (profile?.token) return profile.token;
    } catch (_e) {
      // file not found or invalid — try next
    }
  }
  return null;
}

/**
 * Resolve GitHub token from multiple sources (priority order):
 * 1. Explicit token argument
 * 2. GITHUB_TOKEN env var
 * 3. OpenClaw auth-profiles.json
 */
function resolveToken(token, agentDir) {
  return token || process.env.GITHUB_TOKEN || readTokenFromAuthProfiles(agentDir);
}

/**
 * Map GitHub issue state to internal task state.
 * GitHub has: open, closed
 * Pipeline expects: Draft, Backlog, Ready, InProgress, InReview, Done
 */
function mapIssueState(ghState) {
  return ghState === 'closed' ? 'Done' : 'Draft';
}

/**
 * Create a tracker adapter bound to a specific GitHub repository.
 *
 * @param {Object} options
 * @param {string} options.owner - GitHub owner (user or org)
 * @param {string} options.repo  - GitHub repository name
 * @param {string} [options.token] - PAT (defaults to GITHUB_TOKEN env, then auth-profiles.json)
 * @param {string} [options.agentDir] - path to OpenClaw agent dir with auth-profiles.json
 * @param {Object} [options.github] - pre-built GitHub client (for testing)
 * @returns {Object} tracker conforming to create_task contract
 */
function createGitHubTracker({ owner, repo, token, agentDir, github }) {
  const client = github || createGitHubClient(resolveToken(token, agentDir));

  return {
    /**
     * Fetch recent open issues from the repo for dedup check.
     * @returns {Promise<Array<{ id: string, title: string, state: string }>>}
     */
    async fetchRecentTasks() {
      const issues = await client.listIssues(owner, repo, {
        state: 'all',
        perPage: 100,
        sort: 'created',
        direction: 'desc',
      });

      return issues
        .filter((issue) => !issue.pull_request) // skip PRs
        .map((issue) => ({
          id: String(issue.number),
          title: issue.title,
          state: mapIssueState(issue.state),
        }));
    },

    /**
     * Create a GitHub Issue and return the tracker contract result.
     * @param {Object} task - { title, description, state }
     * @returns {Promise<{ id: string, url: string, title: string }>}
     */
    async createIssue(task) {
      const issue = await client.createIssue(owner, repo, {
        title: task.title,
        body: task.description || undefined,
      });

      return {
        id: String(issue.number),
        url: issue.html_url,
        title: issue.title,
      };
    },
  };
}

module.exports = { createGitHubTracker, mapIssueState, resolveToken };
