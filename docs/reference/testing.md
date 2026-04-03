# Reference: Testing

The repository is built around explicit module tests. The default test entrypoint is:

```bash
npm test
```

## Test Suite Map

| Folder | Coverage |
|---|---|
| `test/tasks/` | Task model, task pipeline steps, `create_task`, `approve_task`, `review_task`, `publish_task`, `project_status` |
| `test/github/` | GitHub tracker adapter (including label-based approval), Symphony adapter |
| `test/usage/` | Sliding-window aggregation |
| `test/research/` | ADR/document existence and structure checks |

## What Is Well Covered

| Area | Evidence |
|---|---|
| `create_task` happy path and clarification paths | `create-task.test.js`, `steps.test.js` |
| `approve_task` state transitions and rejection paths | `approve-task.test.js` |
| `review_task` full pipeline, multi-turn, approval/rejection | `review-task.test.js` |
| `publish_task` validation and dry-run behavior | `publish-task*.test.js` |
| `project_status` pipeline, model, and aggregation | `project-status.test.js` |
| GitHub tracker contract mapping | `tracker-adapter.test.js` (including label-based state mapping and approval transitions) |
| Symphony GitHub adapter normalization and edge cases | `symphony-adapter.test.js` |
| Aggregation windows | `aggregator.test.js` |

## What Is Not Covered by Automated Tests

1. Real GitHub API integration against a live repository.
2. Real Telegram delivery.
3. Full Symphony runtime integration outside the adapter layer.
4. Live OpenClaw session orchestration.

## Test Strategy Notes

- Tests are plain Node.js scripts using `assert`.
- There is no external test framework dependency.
- Most tests rely on inline mocks rather than fixtures.
- Infrastructure failures are generally asserted as thrown errors.

## When to Add Tests

Add or update tests whenever you change:

- pipeline step behavior
- result shape or validation limits
- GitHub adapter normalization rules
- usage aggregation windows or counters
