# Runtime Components

This document describes the modules that make up the executable surface of the repository.

## Component Inventory

| Subsystem | Export entrypoint | Main responsibility |
|---|---|---|
| Tasks | `lobster/lib/tasks/index.js` | Task creation, direct publishing, and project status workflows |
| GitHub | `lobster/lib/github/index.js` | GitHub client, tracker adapters, Symphony adapter, config parsing |
| Telemetry | `lobster/lib/telemetry/index.js` | Session telemetry normalization and batching |
| Usage | `lobster/lib/usage/index.js` | In-memory request metrics aggregation |

## Tasks Subsystem

### Public surface

- `createTask(input, deps)`
- `approveTask(input, deps)`
- `publishTask(params, deps)`
- `projectStatus(input, deps)`
- `TASK_STATES`, `RESULT_TYPES`, `STATE_LABELS`, `APPROVAL_TRANSITIONS`, `validateTaskObject`
- `validatePublishParams`, `parseGitHubProject`

### Internal structure

| Area | Notes |
|---|---|
| `create-task.js` | Runs enrich → parse → completeness → dedup → build → publish |
| `approve-task.js` | Runs fetch → validate transition → approve (swap GitHub labels) |
| `project-status.js` | Runs resolve alias → fetch issues → aggregate → format brief |
| `steps/parse-request.js` | The only step that depends on an LLM |
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

## Telemetry Subsystem

### Public surface

- `TelemetryService`
- `Normalizer`
- `onSuccess(provider, sessionMeta, usagePayload)`
- `onError(provider, sessionMeta, error)`
- `flush()`

### Operational model

| Component | Responsibility |
|---|---|
| `agent-wrapper.js` | Simplest way to report session outcomes from agent code |
| `normalizer.js` | Converts provider-specific shapes into one schema |
| `service.js` | Queues events, flushes by size or timeout, formats Telegram text |

The sender itself is intentionally non-fatal: `_sendTelegram()` is still a placeholder, but queueing and flush semantics are real and tested.

## Usage Subsystem

### Public surface

- `Aggregator`
- `MetricCollector`

### Operational model

| Component | Responsibility |
|---|---|
| `aggregator.js` | 60-minute sliding window and current-day aggregate |
| `collector.js` | Thin facade for recording metrics and reading aggregates |

Unlike telemetry, usage aggregation is a reusable primitive. The repository does not automatically wire every telemetry event into the collector.

## Dependency Shape

| Producer | Depends on | Why |
|---|---|---|
| `create_task` | Tracker + LLM | Tracker for context/publish, LLM for parsing |
| `approve_task` | Tracker | Tracker for fetch/approve via label transitions |
| `publish_task` | GitHub client | Direct GitHub publishing path |
| `project_status` | GitHub client + Clock | Read-only status snapshot, no LLM needed |
| `tracker-adapter` | GitHub client | Reuses HTTP/GitHub logic instead of embedding API code |
| `symphony-adapter` | GitHub client | Reuses GraphQL transport and auth |
| `agent-wrapper` | Normalizer + TelemetryService | Keeps agent code minimal |
| `MetricCollector` | Aggregator | Convenience API around aggregation logic |
