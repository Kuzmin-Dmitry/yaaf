/**
 * project_status pipeline orchestrator
 *
 * Resolve alias → fetch issues → aggregate → format brief.
 * Fully deterministic — no LLM dependency.
 * Returns typed results: Ready | NeedInfo.
 *
 * Dependencies:
 *   - github: GitHub client with listIssues(owner, repo, opts)
 *   - clock: object with now() → Date (for stale detection in tests)
 */

const { RESULT_TYPES } = require('./model');
const { aggregateStatus, formatBrief } = require('./project-status-model');

// --- Project config ---

const PROJECTS = [
  {
    key: 'yaaf',
    repo: 'Kuzmin-Dmitry/yaaf',
    aliases: ['yaaf'],
    stale_after_days: 7,
  },
];

function resolveProject(alias) {
  if (!alias) return null;
  const normalized = alias.toLowerCase().trim();
  if (!normalized) return null;
  return PROJECTS.find(
    (p) => p.key === normalized || p.aliases.includes(normalized)
  ) || null;
}

function listKnownProjects() {
  return PROJECTS.map((p) => ({ key: p.key, repo: p.repo, aliases: p.aliases }));
}

// --- Paginated issue fetch ---

const PER_PAGE = 100;

async function fetchAllOpenIssues(github, owner, repo) {
  const allIssues = [];
  let page = 1;

  while (true) {
    const batch = await github.listIssues(owner, repo, {
      state: 'open',
      perPage: PER_PAGE,
      sort: 'updated',
      direction: 'desc',
      page,
    });

    for (const item of batch) {
      if (item.pull_request) continue;
      allIssues.push({
        number: item.number,
        title: item.title,
        url: item.html_url,
        labels: (item.labels || []).map((l) => typeof l === 'string' ? l : l.name),
        updated_at: item.updated_at,
      });
    }

    if (batch.length < PER_PAGE) break;
    page++;
  }

  return allIssues;
}

// --- Pipeline ---

/**
 * Run the project_status pipeline.
 *
 * @param {Object} input
 * @param {string} input.request - raw user message
 * @param {string|null} input.project_alias - resolved alias from PM (may be null)
 * @param {Object} deps
 * @param {Object} deps.github - GitHub client: { listIssues(owner, repo, opts) }
 * @param {Object} deps.clock - deterministic clock: { now() }
 * @returns {Object} Ready | NeedInfo
 */
async function projectStatus(input, deps) {
  const { project_alias } = input;
  const { github, clock } = deps;

  const project = resolveProject(project_alias);
  if (!project) {
    return {
      type: RESULT_TYPES.NeedInfo,
      missing: ['project_alias'],
      known_projects: listKnownProjects(),
    };
  }

  const [owner, repo] = project.repo.split('/');
  const issues = await fetchAllOpenIssues(github, owner, repo);

  const now = clock.now();
  const stats = aggregateStatus(issues, project.stale_after_days, now);
  const brief = formatBrief(project.key, stats);

  return {
    type: RESULT_TYPES.Ready,
    project: { key: project.key, repo: project.repo },
    brief,
    stats,
    generated_at: now.toISOString(),
  };
}

module.exports = { projectStatus };
