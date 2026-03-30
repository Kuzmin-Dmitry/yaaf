# Contract: create_task Pipeline

Interface reference for the `create_task` pipeline. Used by `agent.pm` to invoke the pipeline and interpret results.

## Invocation

```js
const { createTask } = require('/Users/silicon/git/yaaf/lib/tasks');
const { createGitHubTracker } = require('/Users/silicon/git/yaaf/lib/github/tracker-adapter');

// Tracker: GitHub Issues (uses GITHUB_TOKEN env var)
const tracker = createGitHubTracker({ owner: 'Kuzmin-Dmitry', repo: 'yaaf' });

const result = await createTask(input, { tracker, llm });
```

### Input

```js
{
  request: string,          // raw user message (current turn)
  partial_state: {          // null on first call
    title?: string,         // from pipeline's parsed_so_far
    description?: string,   // from pipeline's parsed_so_far
    dedup_decision?: "create_new",  // from user's NeedDecision choice
  } | null
}
```

### Dependencies

```js
{
  tracker: {
    fetchRecentTasks(): Promise<Array<{ id, title, state }>>
    createIssue(task: TaskObject): Promise<{ id, url, title }>
  },
  llm: {
    extractFields(request: string, context: object): Promise<{ title?, description? }>
  }
}
```

## Results

The pipeline returns exactly one of four typed results.

### Ready

Task published successfully. Pipeline run is complete.

```js
{
  type: "Ready",
  task: {
    id: string,       // e.g. "TASK-43"
    url: string,      // e.g. "https://github.com/org/repo/issues/43"
    title: string     // e.g. "Fix login bug"
  }
}
```

**PM action:** Report success to user. Done.

### NeedInfo

Required fields are missing. PM should ask the user.

```js
{
  type: "NeedInfo",
  missing: string[],       // e.g. ["title"]
  parsed_so_far: {
    title?: string,
    description?: string,
    // ...any fields extracted so far
  }
}
```

**PM action:** Formulate an open-ended question from `missing`. Re-invoke with user's reply as `request` and `parsed_so_far` as `partial_state`.

### NeedDecision

Ambiguous situation requiring user choice.

```js
{
  type: "NeedDecision",
  reason: string,          // e.g. "duplicate_candidate"
  candidates: [            // present when reason = "duplicate_candidate"
    {
      id: string,          // e.g. "TASK-42"
      title: string,
      state: string
    }
  ],
  parsed_so_far: {
    title?: string,
    description?: string,
  }
}
```

**PM action:** Present bounded options. On "create new" → re-invoke with `dedup_decision: "create_new"` in `partial_state`. On "update existing" → switch to `update_task` flow.

### Rejected

Pipeline cannot proceed. Terminal for this run.

```js
{
  type: "Rejected",
  reason: string,          // e.g. "schema_violation"
  details: string          // e.g. "Title exceeds 200 characters"
}
```

**PM action:** Explain reason to user. If user provides a fix, start a **new** `createTask` invocation (no `partial_state` carry-over).

## TaskObject (Internal)

Schema for the task published to the tracker. Not exposed to PM.

```js
{
  title: string,       // required, max 200 chars, trimmed
  description: string, // optional, default ""
  state: "Draft"       // always Draft for new tasks
}
```

## partial_state Contract

### Assembly Rules

PM builds `partial_state` from:
1. `parsed_so_far` from the previous pipeline result — pass through unchanged
2. User decisions — add single keys (e.g. `dedup_decision: "create_new"`)

PM **never** extracts structured fields from user text.

### Merge Behavior

On re-invoke, step 2 (parse) merges `partial_state` with newly extracted fields:

```js
merged = { ...partial_state, ...newly_parsed }
// new non-null values override; null/empty values don't overwrite
```

### Step Behavior on Re-invoke

| Step | Behavior |
|---|---|
| parse request | Parses new request, merges with `partial_state` |
| check completeness | Checks merged result |
| dedup check | Skips if `dedup_decision` present |
| build TaskObject | Uses merged fields |

## Loop Limits

- Max 3 re-invocations per user request
- Counter resets on fresh user messages
- On max reached: PM asks user to reformulate from scratch

## Infra Errors

Tracker unreachable or API failure throws an error (not a typed result). PM catches and tells user to try later.
