# AGENTS.md

## Scope

- This file applies to the repo root, `lobster/`, `docs/`, `test/`, and other top-level files.
- `openclaw/` in this repo is a symlink to `~/.openclaw/`; edit it when the task is to configure real OpenClaw agents or Lobster/Symphony integration.
- If a deeper `AGENTS.md` exists, follow the deeper file first. This matters for `openclaw/**`.
- Treat `openclaw/workspace-jarvis.bak/` as archival. Do not edit it unless the task explicitly targets it.

## Project Snapshot

- YAAF is a Node.js/CommonJS codebase for OpenClaw-driven task pipelines.
- The main product surface in this repo is `create_task`: enrich -> parse -> completeness -> dedup -> build -> publish, `approve_task`: fetch -> validate -> approve (Draft→Backlog→Ready via GitHub labels), and `review_task`: fetch -> load-code-context -> analyze -> rewrite -> submit-for-approval -> update-issue.
- Runtime code lives in `lobster/lib/`; workflow specs live in `lobster/workflows/`; docs live in `docs/`; verification lives in `test/`.
- This repo rewards deterministic code, explicit contracts, and small diffs.

## Commands

Use targeted checks while iterating. Run the full suite before finishing non-trivial behavior changes.

```bash
npm test
node test/tasks/create-task.test.js
node test/tasks/approve-task.test.js
node test/tasks/steps.test.js
node test/tasks/publish-task.test.js
node test/tasks/review-task.test.js
node test/tasks/project-status.test.js
node test/tasks/model.test.js
node test/github/tracker-adapter.test.js
node test/github/symphony-adapter.test.js
node test/usage/aggregator.test.js
node test/research/monitoring-tool-selection.test.js
```

Notes:

- There is no build step or lint step configured in `package.json`.
- Do not invent new validation steps inside a task unless the user asks for them.
- Prefer the smallest relevant `node test/...` command before `npm test`.

## Critical Invariants

- Only the parse step should depend on the LLM. Keep other pipeline steps deterministic and testable.
- New tasks always start in `Draft`.
- Approval transitions follow a strict state machine: Draft→Backlog, Backlog→Ready. No other approval transitions are allowed.
- Task state is tracked via GitHub issue labels (`status:draft`, `status:backlog`, `status:ready`, etc.).
- Dedup is case-insensitive exact title matching against non-`Done` tasks, not semantic similarity.
- Business-rule outcomes return typed results: `Ready`, `NeedInfo`, `NeedDecision`, `Rejected`.
- Infrastructure failures throw; they are not wrapped as business results.
- Keep orchestration boundaries intact: `agent.pm` manages clarification, `create_task` owns parsing and validation.

## Preferred Patterns

- Preserve CommonJS style: `require(...)` plus `module.exports = { ... }`.
- Prefer small single-purpose modules over broad utility files.
- Use Node built-ins first. This repo currently keeps its runtime surface minimal.
- Follow the existing control-flow style for pipelines:

```js
const completeness = checkCompleteness(parsed);
if (!completeness.complete) {
  return completeness.result;
}
```

- Tests are plain Node scripts with `assert`, async/await, and inline mocks.
- Prefer local mock builders such as `mockTracker()` and `mockLLM()` over shared fixtures.

## Good References

- `lobster/lib/tasks/create-task.js` - canonical six-step orchestration.
- `lobster/lib/tasks/approve-task.js` - three-step approval orchestration (fetch → validate → approve).
- `lobster/lib/tasks/review-task.js` - six-step architectural review (fetch → load-code-context → analyze → rewrite → submit → update).
- `lobster/lib/tasks/model.js` - result types, states, state labels, approval transitions, review limits, and validation helpers.
- `lobster/lib/github/tracker-adapter.js` - tracker contract boundary (including label-based state and approval).
- `test/tasks/create-task.test.js` - expected test structure and mock style.
- `test/tasks/approve-task.test.js` - approval pipeline test scenarios.
- `test/tasks/review-task.test.js` - review pipeline test scenarios.
- `docs/workflows/create-task.md` - workflow behavior and invariants.
- `docs/workflows/approve-task.md` - approval workflow and state transitions.
- `docs/workflows/review-task.md` - review workflow and pipeline steps.
- `docs/reference/contracts.md` and `docs/reference/testing.md` - source of truth for contracts and test coverage.
- `docs/index.md` - doc map when you need broader context.

## Change Rules

- Add or update tests with any change to pipeline behavior, result shapes, validation limits, adapter normalization, telemetry batching, or usage aggregation.
- Update docs in the same change when behavior, contracts, or operator-facing workflow changes.
- Keep README and docs consistent when user-visible workflow changes.
- Prefer focused fixes over opportunistic refactors.

## Boundaries

Always:

- run the smallest relevant test first
- keep diffs narrow and explainable
- preserve typed-result contracts and existing boundaries

Ask first:

- adding npm dependencies
- changing auth or token resolution
- editing CI, release, or automation flows
- deleting files, renaming public modules, or changing top-level docs structure
- modifying `openclaw/**` when the task is only about YAAF runtime code

Never:

- commit or hardcode secrets, tokens, or private URLs
- edit `openclaw/workspace-jarvis.bak/` unless explicitly asked
- bypass `create_task` invariants with ad-hoc issue creation logic
- replace typed business results with free-form objects or exception-based validation
- make unrelated architectural rewrites in the same change

## Finish Line

- Before handing off, run targeted tests for the touched area.
- Run `npm test` before finishing any non-trivial runtime or contract change.
- In your summary, call out what changed, what was tested, and any remaining gaps.
