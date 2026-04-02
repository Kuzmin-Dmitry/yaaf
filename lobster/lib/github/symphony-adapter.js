/**
 * Symphony GitHub Tracker Adapter
 *
 * Implements the three SPEC.md §11.1 operations for Symphony orchestrator:
 *   - fetch_candidate_issues()      → Issue[] (active issues for dispatch)
 *   - fetch_issue_states_by_ids()   → Map<id, state> (reconciliation)
 *   - fetch_issues_by_states()      → Issue[] (terminal, for cleanup)
 *
 * State model: labels with configurable prefix (default "status:").
 * See docs/integrations/symphony.md for the runtime overview.
 */

const { createGitHubClient } = require('./client');

// --- Configuration defaults ---

const DEFAULT_LABEL_PREFIX = 'status';
const DEFAULT_ACTIVE_STATES = ['status:todo', 'status:in-progress'];
const DEFAULT_TERMINAL_STATES = ['status:done', 'status:cancelled'];

// --- GraphQL queries ---

const ISSUES_QUERY = `
  query($owner: String!, $name: String!, $states: [IssueState!]!, $first: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      issues(states: $states, first: $first, after: $after, orderBy: {field: CREATED_AT, direction: ASC}) {
        nodes {
          id
          number
          title
          body
          url
          createdAt
          updatedAt
          labels(first: 20) { nodes { name } }
          linkedBranches(first: 1) { nodes { ref { name } } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const NODES_QUERY = `
  query($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Issue {
        id
        state
        labels(first: 20) { nodes { name } }
      }
    }
  }
`;

// --- Normalization helpers ---

/**
 * Extract the first status label from a list of label names.
 * If multiple status labels exist, picks first alphabetically and returns a warning.
 * @param {string[]} labelNames
 * @param {string} prefix - label prefix (e.g. "status")
 * @returns {{ state: string|null, warning: string|null }}
 */
function extractStatusLabel(labelNames, prefix) {
  const statusLabels = labelNames
    .filter((name) => name.startsWith(`${prefix}:`))
    .sort();

  if (statusLabels.length === 0) return { state: null, warning: null };

  const warning = statusLabels.length > 1
    ? `Multiple status labels found: ${statusLabels.join(', ')}; using ${statusLabels[0]}`
    : null;

  const state = statusLabels[0].slice(prefix.length + 1);
  return { state, warning };
}

/**
 * Extract priority from labels matching "priority:N" pattern.
 * @param {string[]} labelNames
 * @returns {number|null}
 */
function extractPriority(labelNames) {
  for (const name of labelNames) {
    if (name.startsWith('priority:')) {
      const n = parseInt(name.slice('priority:'.length), 10);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

/**
 * Parse blocked_by references from issue body.
 * Matches: "blocked by #N", "depends on #N", "blocks: #N"
 * @param {string|null} body
 * @param {string} owner
 * @param {string} repo
 * @returns {Array<{ id: null, identifier: string, state: null }>}
 */
function parseBlockedBy(body, owner, repo) {
  if (!body) return [];
  const pattern = /(?:blocked\s+by|depends\s+on|blocks:?)\s+#(\d+)/gi;
  const results = [];
  const seen = new Set();
  let match;
  while ((match = pattern.exec(body)) !== null) {
    const num = match[1];
    if (!seen.has(num)) {
      seen.add(num);
      results.push({ id: null, identifier: `${owner}/${repo}#${num}`, state: null });
    }
  }
  return results;
}

/**
 * Normalize a GitHub Issue GraphQL node into the Symphony Issue domain model.
 * @param {Object} node - GraphQL issue node
 * @param {Object} config - { owner, repo, prefix }
 * @returns {{ issue: Object, warning: string|null }}
 */
function normalizeIssue(node, { owner, repo, prefix }) {
  const labelNames = (node.labels?.nodes || []).map((l) => l.name);
  const { state, warning } = extractStatusLabel(labelNames, prefix);

  const metaLabelPrefixes = [`${prefix}:`, 'priority:'];
  const filteredLabels = labelNames
    .filter((name) => !metaLabelPrefixes.some((p) => name.startsWith(p)))
    .map((name) => name.toLowerCase());

  return {
    issue: {
      id: node.id,
      identifier: `${owner}/${repo}#${node.number}`,
      title: node.title,
      description: node.body || null,
      priority: extractPriority(labelNames),
      state,
      branch_name: node.linkedBranches?.nodes?.[0]?.ref?.name || null,
      url: node.url,
      labels: filteredLabels,
      blocked_by: parseBlockedBy(node.body, owner, repo),
      created_at: node.createdAt,
      updated_at: node.updatedAt,
    },
    warning,
  };
}

// --- Paginated fetch helper ---

async function fetchAllIssues(client, owner, repo, ghStates) {
  const allNodes = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const result = await client.graphql(ISSUES_QUERY, {
      owner,
      name: repo,
      states: ghStates,
      first: 100,
      after: cursor,
    });

    const errors = result.errors;
    if (errors && errors.length > 0) {
      const err = new Error(`GitHub GraphQL errors: ${JSON.stringify(errors)}`);
      err.graphqlErrors = errors;
      throw err;
    }

    const issues = result.data?.repository?.issues;
    if (!issues) {
      throw new Error('Unexpected GraphQL response: missing repository.issues');
    }

    allNodes.push(...issues.nodes);

    hasMore = issues.pageInfo.hasNextPage;
    cursor = issues.pageInfo.endCursor;

    if (hasMore && !cursor) {
      throw new Error('Pagination integrity error: hasNextPage=true but no endCursor');
    }
  }

  return allNodes;
}

// --- Factory ---

/**
 * Create a Symphony tracker client for GitHub Issues.
 *
 * @param {Object} config
 * @param {string} config.owner - GitHub owner (user or org)
 * @param {string} config.repo  - GitHub repository name
 * @param {string} [config.token] - PAT (defaults to GITHUB_TOKEN env)
 * @param {string} [config.endpoint] - GraphQL endpoint (for GHE)
 * @param {string} [config.label_prefix] - Status label prefix (default "status")
 * @param {string[]} [config.active_states] - Labels treated as active
 * @param {string[]} [config.terminal_states] - Labels treated as terminal
 * @param {Object} [config.github] - Pre-built GitHub client (for testing)
 * @param {Function} [config.onWarning] - Warning callback (label, message)
 * @returns {Object} Symphony tracker client
 */
function createSymphonyTrackerClient(config) {
  const {
    owner,
    repo,
    token,
    label_prefix: prefix = DEFAULT_LABEL_PREFIX,
    active_states: activeStates = DEFAULT_ACTIVE_STATES,
    terminal_states: terminalStates = DEFAULT_TERMINAL_STATES,
    github,
    onWarning,
  } = config;

  if (!owner || !repo) {
    throw new Error('Symphony tracker: owner and repo are required');
  }

  const client = github || createGitHubClient(token || process.env.GITHUB_TOKEN);
  const activeSet = new Set(activeStates);
  const terminalSet = new Set(terminalStates);

  function warn(msg) {
    if (onWarning) onWarning(msg);
  }

  return {
    /**
     * Fetch open issues with an active status label.
     * Used by Symphony orchestrator for dispatch.
     * @returns {Promise<Object[]>} normalized Issue[]
     */
    async fetch_candidate_issues() {
      const nodes = await fetchAllIssues(client, owner, repo, ['OPEN']);

      const issues = [];
      for (const node of nodes) {
        const { issue, warning } = normalizeIssue(node, { owner, repo, prefix });
        if (warning) warn(warning);

        // Must have status label AND it must be in active_states
        if (issue.state === null) continue;

        const fullLabel = `${prefix}:${issue.state}`;
        if (!activeSet.has(fullLabel)) continue;

        issues.push(issue);
      }

      return issues;
    },

    /**
     * Fetch current state for a set of issue IDs (by global node_id).
     * Used by Symphony for reconciliation of running issues.
     * @param {string[]} issueIds - array of GitHub global node IDs
     * @returns {Promise<Map<string, string>>} Map<id, state_name>
     */
    async fetch_issue_states_by_ids(issueIds) {
      if (!issueIds || issueIds.length === 0) return new Map();

      const result = await client.graphql(NODES_QUERY, { ids: issueIds });

      const errors = result.errors;
      if (errors && errors.length > 0) {
        const err = new Error(`GitHub GraphQL errors: ${JSON.stringify(errors)}`);
        err.graphqlErrors = errors;
        throw err;
      }

      const stateMap = new Map();

      for (const node of (result.data?.nodes || [])) {
        if (!node || !node.id) continue;

        const labelNames = (node.labels?.nodes || []).map((l) => l.name);
        const { state, warning } = extractStatusLabel(labelNames, prefix);
        if (warning) warn(warning);

        if (state !== null) {
          stateMap.set(node.id, state);
        } else if (node.state === 'CLOSED') {
          // Closed without status label → map to first terminal state
          const fallback = terminalStates[0];
          stateMap.set(node.id, fallback ? fallback.slice(prefix.length + 1) : 'done');
        }
        // Open with no status label → not Symphony-managed, skip
      }

      return stateMap;
    },

    /**
     * Fetch issues in terminal states (for startup workspace cleanup).
     * @param {string[]} [terminalStateNames] - terminal state labels to match
     * @returns {Promise<Object[]>} normalized Issue[]
     */
    async fetch_issues_by_states(terminalStateNames) {
      const targetSet = terminalStateNames
        ? new Set(terminalStateNames)
        : terminalSet;

      const nodes = await fetchAllIssues(client, owner, repo, ['CLOSED']);

      const issues = [];
      for (const node of nodes) {
        const { issue, warning } = normalizeIssue(node, { owner, repo, prefix });
        if (warning) warn(warning);

        if (issue.state === null) continue;

        const fullLabel = `${prefix}:${issue.state}`;
        if (!targetSet.has(fullLabel)) continue;

        issues.push(issue);
      }

      return issues;
    },
  };
}

module.exports = {
  createSymphonyTrackerClient,
  // Exported for testing
  extractStatusLabel,
  extractPriority,
  parseBlockedBy,
  normalizeIssue,
};
