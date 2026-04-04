# Getting Started

This guide covers prerequisites, configuration, running the conveyor, and verifying your setup.

## Prerequisites

- **Node.js** — The project uses CommonJS modules (`"type": "commonjs"` in `package.json`). No specific version is pinned; a current LTS release is recommended.
- **GitHub Personal Access Token** — Required for all GitHub API interactions (creating issues, reading labels, managing projects). The token needs the `repo` scope at minimum.
- **OpenClaw CLI** (optional) — Required only if you use the review pipeline's Librarian agent or other agent-dependent features. The `openclaw` binary must be on your `PATH`. See [OpenClaw documentation](https://github.com/openclaw/openclaw) for installation.

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GITHUB_TOKEN` | Yes | GitHub Personal Access Token with `repo` scope. Used by all pipelines that interact with GitHub. | `ghp_xxxxxxxxxxxxxxxxxxxx` |
| `OPENCLAW_HOME` | No | Path to the OpenClaw home directory. Defaults to `~/.openclaw`. Used to locate `auth-profiles.json` for token resolution when `GITHUB_TOKEN` is not set. | `/home/user/.openclaw` |

### Token Resolution Order

The system resolves the GitHub token in this priority order:

1. Explicit `token` parameter passed programmatically
2. `GITHUB_TOKEN` environment variable
3. OpenClaw `auth-profiles.json` file (searched in `OPENCLAW_HOME/agents/pm/agent/` then `OPENCLAW_HOME/agents/main/agent/`)

If none of these provide a valid token, the system throws: `GitHub auth not configured. Check GITHUB_TOKEN environment variable`.

## Tracker Configuration

### Repository Format

All pipelines expect a repository in `owner/repo` format:

```js
const tracker = createGitHubTracker({ owner: 'Kuzmin-Dmitry', repo: 'yaaf' });
```

For the publish pipeline, the format extends to include an optional project number:

- `owner/repo` — Create issues in the repository
- `owner/repo/N` — Create issues and add them to GitHub Project v2 number N

### Symphony Tracker Configuration

When running under Symphony, the tracker is configured via workflow front matter with these fields:

| Field | Required | Description |
|-------|----------|-------------|
| `kind` | Yes | Must be `"github"` |
| `repo` | Yes | Repository string in `owner/repo` format |
| `api_key` | Yes | Token or environment variable reference (e.g., `$GITHUB_TOKEN`) |
| `endpoint` | No | GraphQL endpoint URL (for GitHub Enterprise) |
| `label_prefix` | No | Status label prefix (default: `"status"`) |
| `active_states` | No | Labels treated as active for dispatch (default: `["status:todo", "status:in-progress"]`) |
| `terminal_states` | No | Labels treated as terminal for cleanup (default: `["status:done", "status:cancelled"]`) |

Values starting with `$` are resolved from environment variables (e.g., `$GITHUB_TOKEN` reads `process.env.GITHUB_TOKEN`).

### Project Alias Registry

The project status pipeline resolves project aliases from a built-in registry. Currently registered:

| Key | Repository | Aliases | Stale Threshold |
|-----|-----------|---------|-----------------|
| `yaaf` | `Kuzmin-Dmitry/yaaf` | `yaaf` | 7 days |

## Running the Conveyor

### Programmatic Usage

```js
const { approveTask, publishTask } = require('./lobster/lib/tasks');
const { createGitHubTracker } = require('./lobster/lib/github');

// Set up the tracker
const tracker = createGitHubTracker({ owner: 'Kuzmin-Dmitry', repo: 'yaaf' });

// Approve a Draft task → moves to Backlog
const result = await approveTask({ issue_id: '42' }, { tracker });
// result.type === 'Ready'
// result.task.newState === 'Backlog'

// Approve again → moves to Ready
const ready = await approveTask({ issue_id: '42' }, { tracker });
// ready.task.newState === 'Ready'
```

Publishing a new issue to any GitHub repository:

```js
const { publishTask } = require('./lobster/lib/tasks');
const { createGitHubClient } = require('./lobster/lib/github');

const github = createGitHubClient(process.env.GITHUB_TOKEN);

const result = await publishTask({
  github_project: 'owner/repo',
  title: 'Fix login button styling',
  description: 'The login button on mobile devices is cut off',
  labels: ['bug', 'ui'],
  assignees: ['alice'],
  milestone: 'v1.5',
}, { github });

// result.type === 'Ready'
// result.issue.url === 'https://github.com/owner/repo/issues/42'
```

Dry-run mode previews without creating:

```js
const preview = await publishTask({
  github_project: 'owner/repo',
  title: 'Test dry run',
  description: 'Preview only',
  dry_run: true,
}, { github });

// preview.type === 'Ready'
// preview.dry_run === true
// preview.would_create.title === 'Test dry run'
```

### Lobster Workflows (CLI)

Workflows are defined in `lobster/workflows/` and run via the Lobster shell. Each workflow is a sequence of CLI steps piped via stdin/stdout:

```bash
# Project status
lobster run lobster/workflows/project-status.lobster --project_alias yaaf

# Create a GitHub issue
lobster run lobster/workflows/create-github-issue.lobster \
  --project_alias yaaf \
  --task_type bug \
  --title "Fix login bug" \
  --body "Login page returns 500 on invalid email"

# Approve a task
lobster run lobster/workflows/approve-task.lobster --issue_id 42

# Review a task
lobster run lobster/workflows/review-task.lobster --issue_id 42
```

## Running Tests

Verify your setup by running the test suite:

```bash
npm test
```

All tests use mocks — no GitHub API calls, no network access, no OpenClaw dependency. The test suite validates:

- Task model (states, validation, result types)
- Pipeline step functions (parse, validate, dedup, format, publish)
- End-to-end pipeline orchestration (approve, review, publish, create-github-issue)
- GitHub adapter (tracker contract, state mapping, label management)
- Symphony adapter (issue normalization, status extraction, pagination)
- Project status (alias resolution, aggregation, formatting)
- Usage aggregator (hourly/daily metrics)

If all tests pass, the codebase is correctly installed and functional.

## Verifying It Works

After configuration:

1. **Run tests** — `npm test` should pass with zero failures.
2. **Check GitHub connectivity** — The enrich step (`cgi-enrich.js`) acts as a health check. If your token or repository configuration is wrong, it fails immediately with a clear error.
3. **Try a dry run** — Use `publishTask` with `dry_run: true` to verify the pipeline works end-to-end without creating a real issue.
4. **Check project status** — Run the project-status pipeline with your project alias to verify GitHub API access and see current issue counts.
