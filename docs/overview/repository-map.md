# Repository Map

This document is the fastest way to orient yourself in the codebase.

## Top-Level Layout

```text
yaaf/
├── docs/           Project documentation
├── lobster/        Runtime code, workflows, and skills
├── openclaw/       Local OpenClaw workspace material and agent notes
├── test/           Automated tests
├── _bmad/          BMAD support files
├── README.md
└── package.json
```

## Runtime Modules

### `lobster/lib/tasks/`

Primary business logic for creating, reviewing, and publishing issues.

| File | Role |
|---|---|
| `create-task.js` | Legacy programmatic API for `create_task` (backward compat and tests) |
| `approve-task.js` | Orchestrates the `approve_task` pipeline (Draft→Backlog→Ready via labels) |
| `review-task.js` | Orchestrates the six-step `review_task` pipeline (fetch → analyze → rewrite → approve → update) |
| `publish-task.js` | Orchestrates the `publish_task` pipeline |
| `project-status.js` | Re-exports model and CLI step functions for programmatic use |
| `model.js` | Shared task states, result types, state labels, approval transitions, review limits, and validation helpers |
| `publish-task-model.js` | Validation and parsing rules for `publish_task` params |
| `project-status-model.js` | Status aggregation and brief formatting |
| `steps/*` | Small deterministic step implementations |

### `lobster/lib/github/`

GitHub connectivity and adapter layer.

| File | Role |
|---|---|
| `client.js` | Low-level GitHub REST v3 and GraphQL v4 client |
| `tracker-adapter.js` | Bridges GitHub to the `create_task` and `approve_task` tracker contract |
| `symphony-adapter.js` | Bridges GitHub to the Symphony issue contract |
| `tracker-config.js` | Parses and validates `tracker.kind: github` config |
| `index.js` | Aggregated exports |

### `lobster/lib/openclaw/`

OpenClaw agent integration layer.

| File | Role |
|---|---|
| `agent-runner.js` | Executes OpenClaw agents via CLI (`runAgent`, `runAgentJSON`) |

### `lobster/lib/usage/`

In-memory aggregation of request metrics.

| File | Role |
|---|---|
| `aggregator.js` | Sliding hourly window + daily aggregate logic |
| `index.js` | Aggregated exports |

## Workflow Definitions

| Path | Purpose |
|---|---|
| `lobster/workflows/create-github-issue.lobster` | Declarative pipeline for `create_task` (source of truth) |
| `lobster/workflows/approve-task.lobster` | YAML-like definition of the `approve_task` pipeline |
| `lobster/workflows/review-task.lobster` | YAML-like definition of the `review_task` pipeline |
| `lobster/workflows/project-status.lobster` | YAML-like definition of the `project_status` pipeline |

## Test Layout

| Folder | What it covers |
|---|---|
| `test/tasks/` | `create_task`, `approve_task`, `review_task`, `publish_task`, `project_status`, and model-level behavior |
| `test/github/` | GitHub tracker adapter and Symphony adapter behavior |
| `test/usage/` | Sliding window aggregation behavior |

## Where to Start by Goal

| Goal | First files to read |
|---|---|
| Understand task creation | `lobster/lib/tasks/create-task.js`, `lobster/lib/tasks/steps/*` |
| Understand task approval | `lobster/lib/tasks/approve-task.js`, `lobster/lib/tasks/model.js` |
| Understand task review | `lobster/lib/tasks/review-task.js`, `lobster/lib/openclaw/agent-runner.js` |
| Understand GitHub publishing | `lobster/lib/tasks/publish-task.js`, `lobster/lib/github/client.js` |
| Understand Symphony support | `lobster/lib/github/symphony-adapter.js`, `lobster/lib/github/tracker-config.js` |
| Understand usage aggregation | `lobster/lib/usage/aggregator.js` |
| Understand behavior guarantees | `test/**`, `docs/reference/contracts.md`, `docs/reference/testing.md` |
