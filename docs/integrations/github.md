# Integration: GitHub

GitHub is the central external system used by this repository.

The repo uses both REST and GraphQL, but hides those details behind small focused modules.

## Integration Layers

| Layer | File | Responsibility |
|---|---|---|
| Low-level client | `lobster/lib/github/client.js` | HTTPS transport, REST requests, GraphQL requests |
| `create_task` tracker adapter | `lobster/lib/github/tracker-adapter.js` | Exposes `fetchRecentTasks()` and `createIssue()` |
| Symphony adapter | `lobster/lib/github/symphony-adapter.js` | Exposes candidate fetch and issue state normalization |
| Tracker config parser | `lobster/lib/github/tracker-config.js` | Parses `tracker.kind: github` config blocks |

## GitHub Client Capabilities

| Method | Transport | Use |
|---|---|---|
| `listIssues()` | REST | Retrieve recent issues for dedup or task lookup |
| `getIssue()` | REST | Retrieve a single issue by number |
| `createIssue()` | REST | Create issues |
| `addLabels()` | REST | Add labels to an issue |
| `removeLabel()` | REST | Remove a label from an issue |
| `findMilestone()` | REST | Resolve milestone name → milestone number |
| `addToProject()` | GraphQL | Insert an issue into Project v2 |
| `graphql()` | GraphQL | Raw escape hatch used by higher-level adapters |

## Authentication Model

### Direct client

`createGitHubClient(token)` requires an explicit token.

### `createGitHubTracker` token resolution order

1. Explicit `token` argument.
2. `GITHUB_TOKEN` environment variable.
3. OpenClaw `auth-profiles.json` under the PM or main agent profile directory.

Fallback profile lookup is implemented in `tracker-adapter.js` and uses `OPENCLAW_HOME` if defined, otherwise `~/.openclaw`.

## `create_task` Adapter Mapping

| Pipeline need | Adapter method | GitHub behavior |
|---|---|---|
| Recent tasks for dedup | `fetchRecentTasks()` | Lists up to 100 issues, filters PRs, maps state from labels (fallback: open/closed → Draft/Done) |
| Publish a new task | `createIssue(task)` | Sends title/body with `status:draft` label and returns `{ id, url, title }` |

## `approve_task` Adapter Mapping

| Pipeline need | Adapter method | GitHub behavior |
|---|---|---|
| Fetch current issue state | `fetchIssue(id)` | Gets issue by number, reads state from `status:*` labels |
| Transition state via labels | `approveIssue(id)` | Removes old `status:*` label, adds new label (Draft→Backlog or Backlog→Ready) |

## Direct Publishing Path

`publish_task` uses the low-level client directly instead of going through `createGitHubTracker`.

That matters because `publish_task` needs GitHub-specific features that are outside the minimal tracker contract:

- labels
- assignees
- milestone resolution
- Project v2 insertion
- dry-run preview

## Practical Limits and Trade-offs

| Area | Current choice | Trade-off |
|---|---|---|
| Runtime dependencies | Built-in `https` only | Minimal surface, but more manual transport code |
| Dedup source | Recent issue list | Simple and deterministic, but bounded to fetched issues |
| Issue state model | `status:*` labels for granular states, open/closed fallback | Full label-based state model supports approval transitions and Symphony orchestration |
