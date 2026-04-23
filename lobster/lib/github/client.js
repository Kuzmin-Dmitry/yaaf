/**
 * GitHub REST API v3 / GraphQL client.
 *
 * Authenticates via a Personal Access Token.
 * Uses Node.js built-in https — no external dependencies.
 */

const https = require('https');

const GITHUB_API_HOST = 'api.github.com';

/**
 * Low-level HTTPS request to GitHub API.
 * @param {string} method
 * @param {string} path
 * @param {Object|null} body
 * @param {string} token
 * @returns {Promise<Object>}
 */
function httpRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: GITHUB_API_HOST,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'yaaf-openclaw',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };

    if (payload) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = data ? JSON.parse(data) : {}; }
        catch (_e) { parsed = { raw: data }; }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
        } else {
          const msg = parsed.message || `HTTP ${res.statusCode}`;
          const error = new Error(`GitHub API error: ${res.statusCode} ${msg}`);
          error.status = res.statusCode;
          error.response = parsed;
          reject(error);
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function graphql(query, variables, token) {
  return httpRequest('POST', '/graphql', { query, variables }, token);
}

/**
 * Create a GitHub client bound to a token.
 *
 * @param {string} token - GitHub Personal Access Token
 * @returns {Object} client with createIssue, findMilestone, addToProject
 */
function createGitHubClient(token) {
  if (!token) {
    throw new Error('GitHub auth not configured. Check GITHUB_TOKEN environment variable');
  }

  return {
    /**
     * List recent open issues from a repository.
     * @returns {Promise<Array>} array of issue objects
     */
    listIssues(owner, repo, { state = 'open', perPage = 100, sort = 'created', direction = 'desc', page = 1 } = {}) {
      const params = `state=${state}&per_page=${perPage}&sort=${sort}&direction=${direction}&page=${page}`;
      const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${params}`;
      return httpRequest('GET', path, null, token);
    },

    /**
     * Get a single issue by number.
     * @returns {Promise<Object>} issue object
     */
    getIssue(owner, repo, issueNumber) {
      const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(issueNumber)}`;
      return httpRequest('GET', path, null, token);
    },

    /**
     * Add labels to an issue.
     * @param {string} owner
     * @param {string} repo
     * @param {number|string} issueNumber
     * @param {string[]} labels
     * @returns {Promise<Array>} updated labels
     */
    addLabels(owner, repo, issueNumber, labels) {
      const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(issueNumber)}/labels`;
      return httpRequest('POST', path, { labels }, token);
    },

    /**
     * Remove a label from an issue.
     * @param {string} owner
     * @param {string} repo
     * @param {number|string} issueNumber
     * @param {string} label
     * @returns {Promise<Array>} updated labels
     */
    removeLabel(owner, repo, issueNumber, label) {
      const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(issueNumber)}/labels/${encodeURIComponent(label)}`;
      return httpRequest('DELETE', path, null, token);
    },

    /**
     * Replace the full label set on an issue (atomic swap).
     * Pass the complete desired label list, not a delta — existing labels are
     * replaced by the provided set in a single PUT request.
     * @param {string} owner
     * @param {string} repo
     * @param {number|string} issueNumber
     * @param {string[]} labels - complete target label set; pass [] to clear
     * @returns {Promise<Array>} updated labels
     */
    setLabels(owner, repo, issueNumber, labels) {
      const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(issueNumber)}/labels`;
      return httpRequest('PUT', path, { labels }, token);
    },

    /**
     * Update an existing issue (title, body, labels, etc.).
     * @param {string} owner
     * @param {string} repo
     * @param {number|string} issueNumber
     * @param {Object} fields - { title?, body?, labels?, state? }
     * @returns {Promise<Object>} updated issue object
     */
    updateIssue(owner, repo, issueNumber, fields) {
      const payload = {};
      if (fields.title !== undefined) payload.title = fields.title;
      if (fields.body !== undefined) payload.body = fields.body;
      if (fields.labels !== undefined) payload.labels = fields.labels;
      if (fields.state !== undefined) payload.state = fields.state;
      const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(issueNumber)}`;
      return httpRequest('PATCH', path, payload, token);
    },

    /**
     * Create an issue in a repository.
     */
    createIssue(owner, repo, { title, body, labels, assignees, milestone }) {
      const payload = { title };
      if (body) payload.body = body;
      if (labels && labels.length > 0) payload.labels = labels;
      if (assignees && assignees.length > 0) payload.assignees = assignees;
      if (milestone != null) payload.milestone = milestone;

      return httpRequest(
        'POST',
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
        payload,
        token
      );
    },

    /**
     * Find a milestone number by name.
     * @returns {Promise<number|null>}
     */
    async findMilestone(owner, repo, milestoneName) {
      const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/milestones?state=open&per_page=100`;
      const milestones = await httpRequest('GET', path, null, token);
      const found = milestones.find((m) => m.title === milestoneName);
      return found ? found.number : null;
    },

    /**
     * Add an issue to a GitHub Project v2 via GraphQL.
     */
    async addToProject(projectNumber, owner, issueNodeId) {
      // Try user project first
      const userQuery = `
        query($owner: String!, $number: Int!) {
          user(login: $owner) {
            projectV2(number: $number) { id }
          }
        }
      `;

      let projectId;
      try {
        const result = await graphql(userQuery, { owner, number: projectNumber }, token);
        projectId = result.data?.user?.projectV2?.id;
      } catch (_e) {
        // ignore — will try org next
      }

      if (!projectId) {
        const orgQuery = `
          query($owner: String!, $number: Int!) {
            organization(login: $owner) {
              projectV2(number: $number) { id }
            }
          }
        `;
        const result = await graphql(orgQuery, { owner, number: projectNumber }, token);
        projectId = result.data?.organization?.projectV2?.id;
      }

      if (!projectId) {
        throw new Error(`GitHub Project #${projectNumber} not found for ${owner}`);
      }

      const addMutation = `
        mutation($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
            item { id }
          }
        }
      `;

      return graphql(addMutation, { projectId, contentId: issueNodeId }, token);
    },

    /**
     * Execute a raw GraphQL query/mutation.
     * @param {string} query - GraphQL document
     * @param {Object} [variables] - GraphQL variables
     * @returns {Promise<Object>}
     */
    graphql(query, variables) {
      return graphql(query, variables, token);
    },
  };
}

module.exports = { createGitHubClient };
