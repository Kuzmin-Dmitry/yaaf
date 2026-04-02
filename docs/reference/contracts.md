# Reference: Contracts

This document gathers the runtime contracts that other code needs to respect.

## `createTask(input, deps)`

### Input

```js
{
  request: string,
  partial_state: {
    title?: string,
    description?: string,
    dedup_decision?: "create_new"
  } | null
}
```

### Dependencies

```js
{
  tracker: {
    fetchRecentTasks(): Promise<Array<{ id, title, state }>>,
    createIssue(task): Promise<{ id, url, title }>
  },
  llm: {
    extractFields(request, context): Promise<{ title?, description? }>
  }
}
```

### Results

| Type | Shape |
|---|---|
| `Ready` | `{ type, task: { id, url, title } }` |
| `NeedInfo` | `{ type, missing, parsed_so_far }` |
| `NeedDecision` | `{ type, reason, candidates, parsed_so_far }` |
| `Rejected` | `{ type, reason, details }` |

## `publishTask(params, deps)`

### Main params

| Param | Type | Required |
|---|---|---|
| `github_project` | string | Yes |
| `title` | string | Yes |
| `description` | string | No |
| `labels` | string[] | No |
| `assignees` | string[] | No |
| `milestone` | string | No |
| `source_id` | string | No |
| `dry_run` | boolean | No |

### Dependency

```js
{
  github: {
    createIssue(owner, repo, payload),
    findMilestone(owner, repo, name),
    addToProject(projectNumber, owner, issueNodeId)
  }
}
```

### Results

| Type | Meaning |
|---|---|
| `Ready` | Real issue created or dry-run preview returned |
| `Rejected` | Validation failure |

## `approveTask(input, deps)`

### Input

```js
{
  issue_id: string   // GitHub issue number
}
```

### Dependencies

```js
{
  tracker: {
    fetchIssue(id): Promise<{ id, title, state, labels }>,
    approveIssue(id): Promise<{ id, title, previousState, newState }>
  }
}
```

### Results

| Type | Shape |
|---|---|
| `Ready` | `{ type, task: { id, title, previousState, newState } }` |
| `Rejected` | `{ type, reason: "missing_issue_id" \| "invalid_transition", details }` |

### Valid Transitions

| Current State | → Next State |
|---|---|
| `Draft` | `Backlog` |
| `Backlog` | `Ready` |

## Tracker Contract for `create_task`

The task creation pipeline expects this exact interface:

```js
{
  fetchRecentTasks(): Promise<Array<{ id, title, state }>>,
  createIssue(task): Promise<{ id, url, title }>
}
```

### Extended Tracker Contract (approval)

The approval pipeline adds these methods:

```js
{
  fetchIssue(id): Promise<{ id, title, state, labels }>,
  approveIssue(id): Promise<{ id, title, previousState, newState }>
}
```

`createGitHubTracker()` is the GitHub-backed implementation of both contracts.

### Extended Tracker Contract (review)

The review pipeline adds this method:

```js
{
  updateIssue(id, { body?, addLabels? }): Promise<{ id, title, url }>
}
```

Note: `fetchIssue` for review also returns `body: string` in the result.

## `reviewTask(input, deps)`

### Input

```js
{
  issue_id: string,
  partial_state: {
    answers?: string[],
    decision?: "approve" | "reject",
    edit_notes?: string,
    analysis?: object,
    rewritten?: { title, body },
    code_context?: object,
    issue?: object,
    clarification_count?: number,
    edit_count?: number
  } | null
}
```

### Dependencies

```js
{
  tracker: {
    fetchIssue(id): Promise<{ id, title, body, state, labels }>,
    updateIssue(id, updates): Promise<{ id, title, url }>
  },
  llm: {
    analyzeTask(prompt): Promise<{ affected_components, technical_gaps, risks, dependencies, suggested_approach, completeness_score }>,
    rewriteTask(prompt): Promise<{ title, body }>
  },
  agentRunner: {
    runAgentJSON(agentId, task): Promise<{ repoTree, files, totalSize }>
  },
  owner: string,
  repo: string
}
```

### Results

| Type | Shape |
|---|---|
| `Ready` | `{ type, task: { id, url, title, changes_summary } }` |
| `NeedInfo` | `{ type, phase: "analysis", questions, analysis_so_far }` |
| `NeedDecision` | `{ type, phase: "approval", rewritten_task, options, diff_summary }` |
| `Rejected` | `{ type, reason, details }` |

### Rejection Reasons

| Reason | When |
|---|---|
| `missing_issue_id` | No issue_id provided |
| `invalid_state` | Issue is not in Draft or Backlog |
| `user_rejected` | User chose to reject the review |
| `max_retries` | Analysis clarifications or edit rounds exceeded limits |

### Loop Limits

| Loop | Max |
|---|---|
| Analysis clarifications | 3 |
| Approval edit rounds | 2 |

### State Labels

GitHub issue labels map to task states:

| Label | State |
|---|---|
| `status:draft` | Draft |
| `status:backlog` | Backlog |
| `status:ready` | Ready |
| `status:in-progress` | InProgress |
| `status:in-review` | InReview |
| `status:done` | Done |

## Symphony Adapter Contract

`createSymphonyTrackerClient()` returns an object with these methods:

```js
{
  fetch_candidate_issues(): Promise<Issue[]>,
  fetch_issue_states_by_ids(issueIds): Promise<Map<string, string>>,
  fetch_issues_by_states(stateNames?): Promise<Issue[]>
}
```

The normalized Symphony issue shape includes:

```js
{
  id,
  identifier,
  title,
  description,
  priority,
  state,
  branch_name,
  url,
  labels,
  blocked_by,
  created_at,
  updated_at
}
```

## Telemetry Wrapper Contract

`agent-wrapper.js` provides:

```js
onSuccess(provider, sessionMeta, usagePayload)
onError(provider, sessionMeta, error)
flush(): Promise<void>
```

These helpers are intentionally safe-to-call: telemetry failures are logged and swallowed.

## `projectStatus(input, deps)`

### Input

```js
{
  request: string,
  project_alias: string | null
}
```

### Dependencies

```js
{
  projects: {
    resolve(alias): { key, repo, aliases, stale_after_days } | null,
    list(): Array<{ key, repo, aliases }>
  },
  github: {
    listIssues(owner, repo, opts): Promise<Issue[]>
  },
  clock: {
    now(): Date
  }
}
```

### Results

| Type | Shape |
|---|---|
| `Ready` | `{ type, project, brief, stats, generated_at }` |
| `NeedInfo` | `{ type, missing, known_projects }` |

Infrastructure failures (GitHub unreachable, auth errors) throw.

### `Ready` payload

```js
{
  type: 'Ready',
  project: { key, repo },
  brief: string,
  stats: { total_open, by_status, stale_count },
  generated_at: ISO8601
}
```

### `NeedInfo` payload

```js
{
  type: 'NeedInfo',
  missing: ['project_alias'],
  known_projects: [{ key, repo, aliases }]
}
```
