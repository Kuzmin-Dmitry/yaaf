# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

YAAF is an orchestration + pipeline system that drives GitHub Issues through a task lifecycle (Draft → Backlog → Ready → …) using external AI agents. The code here is **only the orchestrator (Symphony) and the step/workflow library (Lobster)** — the pipeline runtime and the agent runtime are separate tools that live outside this repo.

## External dependencies on PATH

Several entry points spawn binaries that are **not** provided by this repo. If you see a ENOENT for these, that's why — nothing in the repo builds them.

- `lobster` — pipeline runner invoked by `symphony/dispatcher.js` as `lobster run <workflow.lobster> --args-json <json>`. Workflows in `lobster/workflows/*.lobster` are definitions fed to this external runner.
- `openclaw` — agent runtime invoked by `lobster/lib/openclaw/agent-runner.js` and inside `.lobster` step `command:` lines as `openclaw.invoke --tool llm-task ...`.

Never assume you can `node` your way into a full pipeline run locally.

## Commands

```bash
# Start the orchestration daemon (polls GitHub, dispatches Lobster workflows).
# NOTE: package.json points at symphony/index.js, which does not exist in this repo —
# only symphony/dispatcher.js is present. `npm run symphony` will fail as-is.
npm run symphony

# Run a single test file directly (tests have zero external deps and shell out to node):
node test/tasks/model.test.js
node test/tasks/review-task.test.js
node test/github/tracker-adapter.test.js
```

`npm test` is currently **broken**: the script in `package.json` references files that do not exist (`test/workflows/…`, `test/symphony/…`, `test/integration/…`, plus several `test/tasks/*.test.js` that are not present). When adding tests, update the `test` script to match reality or split it into discoverable chunks — do not add it into the existing broken command blindly.

The test files that actually exist are under `test/tasks/`, `test/github/`, and `test/usage/`. Each is a standalone `assert`-based script runnable via `node <path>`.

## Architecture

Two layers, loosely coupled through GitHub Issues as the state store.

### Symphony (`symphony/`) — orchestration layer

Polls GitHub Issues across projects registered in `config/projects.json`, resolves each issue's state from its `status:*` labels, and dispatches to a Lobster workflow via `spawn('lobster', ['run', <workflow>, '--args-json', …])`.

The state→workflow routing lives in `symphony/dispatcher.js` (`DISPATCH_TABLE`). Currently mapped states: `draft`, `reviewed_by_pm`, `needs_rework_after_pm`, `approved_after_pm`. Note: the polling/tracker modules referenced in docs (`symphony/index.js`, `symphony/tracker.js`) are **not** in this repo — only the dispatcher is. Treat docs in `docs/arch-*.md` as aspirational/partial.

`issue_body` is passed to the workflow base64-encoded with a `:base64` suffix so that `run-step.js` can decode it; this is how binary-unsafe JSON arg passing is handled.

### Lobster (`lobster/`) — pipeline layer

Two styles of workflow coexist and should not be conflated:

1. **`.lobster` YAML-ish workflows** (`lobster/workflows/*.lobster`). Executed by the external `lobster` binary. Steps shell out via `command:` (mostly to `node lobster/lib/tasks/cli/<x>.js`) and pipe `stdout` between steps (`stdin: $prev.stdout`). The entrypoint `lobster/lib/tasks/steps/run-step.js` is a universal dispatcher: `node run-step.js <step-name> <args-json> [--stdin]`, with base64-suffixed string values auto-decoded.

2. **In-process JS pipelines** (`lobster/lib/tasks/{approve-task,publish-task,project-status,review-task}.js`). Plain async functions composed from step modules under `lobster/lib/tasks/steps/`. Called programmatically with a `deps` object (tracker/github/llm/agentRunner). These are what the test suite exercises.

Both styles share the same **typed result envelope**: `{ type: 'Ready' | 'NeedInfo' | 'NeedDecision' | 'Rejected', … }`. `RESULT_TYPES` in `lobster/lib/tasks/model.js` is the source of truth. Steps early-exit with one of these types; workflows propagate them.

### Task model (`lobster/lib/tasks/model.js`)

The canonical task lifecycle:
- `TASK_STATES` = `Draft → Backlog → Ready → InProgress → InReview → Done`
- `STATE_LABELS` maps each state to a `status:*` GitHub label.
- `APPROVAL_TRANSITIONS` defines the only two auto-approval hops: `Draft→Backlog`, `Backlog→Ready`.
- `REVIEWABLE_STATES` = `['Draft','Backlog']` — architectural review is only allowed here.

The `status:*` label on a GitHub Issue **is** the task state. There is no separate DB.

### GitHub integration (`lobster/lib/github/`)

- `client.js` — thin wrapper around GitHub REST.
- `tracker-adapter.js` — `fetchIssue`/`updateIssue`/`approveIssue` used by in-process pipelines.
- `symphony-adapter.js` — polling-oriented client used by Symphony-style flows.
- `tracker-config.js` — env-driven config parsing.

### Environment

`.env` is loaded by `lobster/lib/load-dotenv` (imported by `run-step.js`). Expected vars: `GITHUB_TOKEN`, `GATEWAY_TOKEN`, `GATEWAY_URL`. `.env.example` is referenced by docs but not currently present at repo root.

## Conventions

- **CommonJS only** (`"type": "commonjs"`). Use `require`/`module.exports`.
- **Zero runtime dependencies.** `package.json` has no `dependencies` field; keep it that way. Retry, dotenv, HTTP mocking are all hand-rolled.
- **Pipelines are stateless.** Anything that needs to cross step boundaries goes through `partial_state` (explicit input) or GitHub (labels / issue body), never module-level state.
- **`.lobster` workflow changes require matching external runner support.** If you add a new `command:` form, step property, or `early_exit` condition that the external `lobster` binary doesn't understand, the workflow will fail at runtime — there's no local validator in this repo to catch it.
- **Step functions under `lobster/lib/tasks/steps/`** are the reusable unit. They take `(inputs, deps)` and return a result-envelope-compatible object. New workflow logic usually means a new step module, not inline code in a pipeline file.

## Things to be skeptical of

- `docs/` was generated by an external "BMAD document-project" workflow and is partially aspirational. It references files (`symphony/index.js`, `symphony/tracker.js`, `lobster/index.js`, `lobster/lib/retry.js`, `AGENTS.md`, `SKILL.md`) that aren't in the tree. Trust the code over the docs when they disagree.
- The `npm test` script and its referenced files diverge — see Commands above.
