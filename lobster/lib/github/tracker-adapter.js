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
const { STATE_LABELS, APPROVAL_TRANSITIONS, REVIEW_LABEL } = require('../tasks/model');
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
 * Inverted STATE_LABELS: label → state. Computed once at module load.
 */
const LABEL_TO_STATE = Object.fromEntries(
  Object.entries(STATE_LABELS).map(([state, label]) => [label, state])
);

/**
 * Map GitHub issue to internal task state using labels first, then fallback.
 * GitHub has: open, closed
 * Labels: status:draft, status:backlog, status:ready, etc.
 * Pipeline expects: Draft, Backlog, Ready, InProgress, InReview, Done
 */
function mapIssueState(ghState, labels) {
  if (labels && labels.length > 0) {
    const labelNames = labels.map((l) => (typeof l === 'string' ? l : l.name));
    for (const name of labelNames) {
      if (LABEL_TO_STATE[name]) {
        return LABEL_TO_STATE[name];
      }
    }
  }
  // Fallback: closed → Done, open → Draft
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
          state: mapIssueState(issue.state, issue.labels),
        }));
    },

    /**
     * Fetch a single issue by number.
     * @param {string} issueId - issue number
     * @returns {Promise<{ id: string, title: string, state: string, labels: string[] }>}
     */
    async fetchIssue(issueId) {
      const issue = await client.getIssue(owner, repo, issueId);
      const labelNames = (issue.labels || []).map((l) => l.name);
      return {
        id: String(issue.number),
        title: issue.title,
        body: issue.body || '',
        state: mapIssueState(issue.state, issue.labels),
        labels: labelNames,
      };
    },

    /**
     * Create a GitHub Issue with status:draft label.
     * @param {Object} task - { title, description, state }
     * @returns {Promise<{ id: string, url: string, title: string }>}
     */
    async createIssue(task) {
      const issue = await client.createIssue(owner, repo, {
        title: task.title,
        body: task.description || undefined,
        labels: [STATE_LABELS.Draft],
      });

      return {
        id: String(issue.number),
        url: issue.html_url,
        title: issue.title,
      };
    },

    /**
     * Approve an issue: transition Draft→Backlog or Backlog→Ready via labels.
     * Caller (approve-task) must validate transition before calling.
     * @param {string} issueId - issue number
     * @param {Object} [knownIssue] - pre-fetched normalized issue from pipeline (avoids extra API call)
     * @returns {Promise<{ id: string, title: string, previousState: string, newState: string }>}
     */
    async approveIssue(issueId, knownIssue) {
      // Normalize: if knownIssue already has string labels and mapped state, use as-is.
      // Otherwise fetch from API and normalize.
      let id, title, currentState, labelNames;
      if (knownIssue) {
        id = knownIssue.id;
        title = knownIssue.title;
        currentState = knownIssue.state;
        labelNames = knownIssue.labels;
      } else {
        const raw = await client.getIssue(owner, repo, issueId);
        id = String(raw.number);
        title = raw.title;
        labelNames = (raw.labels || []).map((l) => l.name);
        currentState = mapIssueState(raw.state, raw.labels);
      }

      const nextState = APPROVAL_TRANSITIONS[currentState];
      if (!nextState) {
        throw new Error(`Cannot approve issue in state "${currentState}". Approval is only valid for: ${Object.keys(APPROVAL_TRANSITIONS).join(', ')}`);
      }

      const oldLabel = STATE_LABELS[currentState];
      const newLabel = STATE_LABELS[nextState];

      if (labelNames.includes(oldLabel)) {
        await client.removeLabel(owner, repo, issueId, oldLabel);
      }
      await client.addLabels(owner, repo, issueId, [newLabel]);

      return { id, title, previousState: currentState, newState: nextState };
    },

    /**
     * Update an issue's body and optionally add labels.
     * @param {string} issueId - issue number
     * @param {Object} updates - { body?: string, addLabels?: string[] }
     * @returns {Promise<{ id: string, title: string, url: string }>}
     */
    async updateIssue(issueId, updates) {
      const fields = {};
      if (updates.body !== undefined) {
        fields.body = updates.body;
      }

      const issue = await client.updateIssue(owner, repo, issueId, fields);

      if (updates.addLabels && updates.addLabels.length > 0) {
        await client.addLabels(owner, repo, issueId, updates.addLabels);
      }

      return {
        id: String(issue.number),
        title: issue.title,
        url: issue.html_url,
      };
    },
  };
}

module.exports = { createGitHubTracker, mapIssueState, resolveToken };
