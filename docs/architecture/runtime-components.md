# Runtime Components

This document describes the modules that make up the executable surface of the repository.

## Component Inventory

| Subsystem | Export entrypoint | Main responsibility |
|---|---|---|
| Tasks | `lobster/lib/tasks/index.js` | Task creation, review, direct publishing, and project status workflows |
| GitHub | `lobster/lib/github/index.js` | GitHub client, tracker adapters, Symphony adapter, config parsing |
| OpenClaw | `lobster/lib/openclaw/agent-runner.js` | Executes OpenClaw agents via CLI for code-context loading and other delegated tasks |
| Usage | `lobster/lib/usage/index.js` | In-memory request metrics aggregation |

## Tasks Subsystem

### Public surface

- `createTask(input, deps)`
- `approveTask(input, deps)`
- `reviewTask(input, deps)`
- `publishTask(params, deps)`
- `projectStatus(input, deps)`
- `TASK_STATES`, `RESULT_TYPES`, `STATE_LABELS`, `APPROVAL_TRANSITIONS`, `REVIEWABLE_STATES`, `REVIEW_LIMITS`, `REVIEW_LABEL`, `validateTaskObject`
- `validatePublishParams`, `parseGitHubProject`

### Internal structure

| Area | Notes |
|---|---|
| `create-task.js` | Runs enrich → parse → completeness → dedup → build → publish |
| `approve-task.js` | Runs fetch → validate transition → approve (swap GitHub labels) |
| `review-task.js` | Runs fetch → load-code-context → analyze → rewrite → submit-for-approval → update-issue |
| `project-status.js` | Runs resolve alias → fetch issues → aggregate → format brief |
| `steps/parse-request.js` | The only step that depends on an LLM (create-task) |
| `steps/analyze-task.js` | LLM-based architectural analysis (review-task) |
| `steps/rewrite-task.js` | LLM-based task rewriting (review-task) |
| `steps/load-code-context.js` | Delegates to Librarian agent via agentRunner (review-task) |
| `steps/submit-for-approval.js` | Formats NeedDecision result for user approval (review-task) |
| `steps/update-issue.js` | PATCH issue body and add review label (review-task) |
| `steps/dedup-check.js` | Uses exact title matching against non-terminal tasks |
| `publish-task.js` | Handles direct publishing with optional dry-run |
| `publish-task-model.js` | Enforces GitHub-specific limits such as title and label caps |
| `project-status-model.js` | Status aggregation and brief formatting |

## GitHub Subsystem

### Public surface

- `createGitHubClient(token)`
- `createGitHubTracker(options)`
- `createSymphonyTrackerClient(config)`
- `parseGitHubTrackerConfig(tracker)`

### Responsibilities

| Component | Responsibility |
|---|---|
| `client.js` | Raw HTTPS access to GitHub REST and GraphQL APIs |
| `tracker-adapter.js` | Presents `fetchRecentTasks()`, `createIssue()`, `fetchIssue()`, and `approveIssue()` to task pipelines |
| `symphony-adapter.js` | Presents candidate fetch, reconciliation, and terminal lookup to Symphony |
| `tracker-config.js` | Parses `owner/repo`, resolves `$ENV` references, validates arrays |

## OpenClaw Subsystem

### Public surface

- `runAgent(agentId, task, options?)` — runs an OpenClaw agent and returns text output
- `runAgentJSON(agentId, task, options?)` — runs an agent and parses JSON from the output
- `DEFAULT_TIMEOUT_SEC` — 120 seconds

### Operational model

| Component | Responsibility |
|---|---|
| `agent-runner.js` | Executes OpenClaw CLI (`openclaw`) with timeout handling, captures stdout, parses JSON when needed |

Used by `review-task` step 2 (load-code-context) to invoke the Librarian agent for repository structure and file contents.

## Usage Subsystem

### Public surface

- `Aggregator`

### Operational model

| Component | Responsibility |
|---|---|
| `aggregator.js` | 60-minute sliding window and current-day aggregate |

Usage aggregation is a reusable primitive. Zero-persistence, resets on restart.

## Dependency Shape

| Producer | Depends on | Why |
|---|---|---|
| `create_task` | Tracker + LLM | Tracker for context/publish, LLM for parsing |
| `approve_task` | Tracker | Tracker for fetch/approve via label transitions |
| `review_task` | Tracker + LLM + agentRunner + owner/repo | Tracker for fetch/update, LLM for analysis/rewrite, agentRunner for code context |
| `publish_task` | GitHub client | Direct GitHub publishing path |
| `project_status` | GitHub client + Clock | Read-only status snapshot, no LLM needed |
| `tracker-adapter` | GitHub client | Reuses HTTP/GitHub logic instead of embedding API code |
| `symphony-adapter` | GitHub client | Reuses GraphQL transport and auth |
