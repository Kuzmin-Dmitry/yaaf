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

Primary business logic for creating and publishing issues.

| File | Role |
|---|---|
| `create-task.js` | Orchestrates the six-step `create_task` pipeline |
| `publish-task.js` | Orchestrates the `publish_task` pipeline |
| `model.js` | Shared task states, result types, and validation helpers |
| `publish-task-model.js` | Validation and parsing rules for `publish_task` params |
| `steps/*` | Small deterministic step implementations |

### `lobster/lib/github/`

GitHub connectivity and adapter layer.

| File | Role |
|---|---|
| `client.js` | Low-level GitHub REST v3 and GraphQL v4 client |
| `tracker-adapter.js` | Bridges GitHub to the `create_task` tracker contract |
| `symphony-adapter.js` | Bridges GitHub to the Symphony issue contract |
| `tracker-config.js` | Parses and validates `tracker.kind: github` config |
| `index.js` | Aggregated exports |

### `lobster/lib/telemetry/`

Session telemetry and reporting primitives.

| File | Role |
|---|---|
| `service.js` | Queueing, batching, formatting, flush lifecycle |
| `normalizer.js` | Provider-specific usage payload normalization |
| `agent-wrapper.js` | High-level `onSuccess`, `onError`, `flush` helpers |
| `index.js` | Aggregated exports |

### `lobster/lib/usage/`

In-memory aggregation of request metrics.

| File | Role |
|---|---|
| `aggregator.js` | Sliding hourly window + daily aggregate logic |
| `collector.js` | Small facade over the aggregator |
| `index.js` | Aggregated exports |

## Workflow Definitions

| Path | Purpose |
|---|---|
| `lobster/workflows/create-task.lobster` | YAML-like definition of the `create_task` pipeline |
| `lobster/skills/tasks.md` | Routing rules for task-related intents |

## Test Layout

| Folder | What it covers |
|---|---|
| `test/tasks/` | `create_task`, `publish_task`, and model-level behavior |
| `test/github/` | GitHub tracker adapter and Symphony adapter behavior |
| `test/telemetry/` | Telemetry batching and payload normalization |
| `test/usage/` | Sliding window aggregation behavior |
| `test/research/` | Documentation assertions for ADR-backed material |

## Where to Start by Goal

| Goal | First files to read |
|---|---|
| Understand task creation | `lobster/lib/tasks/create-task.js`, `lobster/lib/tasks/steps/*` |
| Understand GitHub publishing | `lobster/lib/tasks/publish-task.js`, `lobster/lib/github/client.js` |
| Understand Symphony support | `lobster/lib/github/symphony-adapter.js`, `lobster/lib/github/tracker-config.js` |
| Understand telemetry | `lobster/lib/telemetry/agent-wrapper.js`, `lobster/lib/telemetry/service.js` |
| Understand usage aggregation | `lobster/lib/usage/aggregator.js`, `lobster/lib/usage/collector.js` |
| Understand behavior guarantees | `test/**`, `docs/reference/contracts.md`, `docs/reference/testing.md` |
