# Troubleshooting

Common errors, their causes, and how to fix them. For result type definitions (Ready, NeedInfo, NeedDecision, Rejected) and their meanings, see [task-lifecycle.md](task-lifecycle.md). For workflow-specific scenarios, see [workflows.md](workflows.md).

## GitHub API Errors

### Authentication Failures

**Error:** `GitHub auth not configured. Check GITHUB_TOKEN environment variable`

**Cause:** No valid token was found through any of the three resolution paths (explicit parameter, `GITHUB_TOKEN` env var, OpenClaw auth-profiles.json).

**Fix:** Set the `GITHUB_TOKEN` environment variable with a valid Personal Access Token that has `repo` scope:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

**Error:** `GitHub API error: 401 Bad credentials`

**Cause:** The token is set but is invalid, expired, or revoked.

**Fix:** Generate a new token at GitHub Settings → Developer settings → Personal access tokens. Ensure `repo` scope is selected.

### Rate Limiting

**Error:** `GitHub API error: 403 ...` with rate limit headers

**Cause:** You have exceeded the GitHub API rate limit (5,000 requests/hour for authenticated requests).

**Fix:** Wait for the rate limit to reset (the `X-RateLimit-Reset` header in the response indicates when). If you hit this regularly, review how often the conveyor polls for issues.

### Network Errors

**Error:** `Connection refused` or similar network errors

**Cause:** Cannot reach `api.github.com`. This could be a network issue, DNS problem, or firewall restriction.

**Fix:** Verify network connectivity. The system uses HTTPS to `api.github.com` on port 443. All API calls use Node.js built-in `https` — no proxy configuration is supported in the current implementation.

### GraphQL Errors (Symphony Adapter)

**Error:** `GitHub GraphQL errors: [...]`

**Cause:** The Symphony adapter uses GraphQL for bulk operations (fetching candidate issues, reconciling states). Errors here typically indicate permission issues or malformed queries.

**Fix:** Ensure your token has sufficient permissions. For GitHub Project v2 operations, the token needs the `project` scope in addition to `repo`.

**Error:** `Unexpected GraphQL response: missing repository.issues`

**Cause:** The repository does not exist, or the token does not have access to it.

**Fix:** Verify the `owner/repo` configuration is correct and the token has access.

**Error:** `Pagination integrity error: hasNextPage=true but no endCursor`

**Cause:** Unexpected GitHub API response during pagination. This is a defensive check — it indicates a GitHub API behavior change.

**Fix:** This is rare. Retry the operation. If persistent, check GitHub's status page.

## Agent Timeouts

**Error:** `Agent <agentId> failed: ...`

**Cause:** An OpenClaw agent (e.g., the Librarian) failed to complete within the timeout period or encountered an error.

**Details:**
- Default agent timeout: **120 seconds**
- The process is killed 30 seconds after the agent timeout (150 seconds total)
- Errors include both the agent's stderr output and the process error

**Fix:**
1. Verify the `openclaw` CLI is installed and on your `PATH`
2. Ensure the OpenClaw gateway is running (or use `--local` mode)
3. Check that the agent ID exists (the review pipeline uses `librarian`)
4. For timeout issues, the repository may be too large for the agent to explore in time

**Error:** `Agent <agentId> returned invalid JSON: ...`

**Cause:** The agent produced output that is not valid JSON, even after stripping markdown code fences.

**Fix:** This typically indicates an agent configuration issue. The raw output (first 500 characters) is included in the error message for diagnosis.

**Error:** `Librarian agent error: Cannot access repository`

**Cause:** The Librarian agent was unable to access or explore the target repository.

**Fix:** Verify the `owner` and `repo` parameters are correct and the agent has the necessary permissions.

## Pipeline-Specific Timeouts

### LLM Timeout

**Error:** `Timeout after 30000ms`

**Cause:** The LLM call in the parse-request step did not complete within 30 seconds (default).

**Fix:** This is a transient issue — retry the operation. If persistent, the LLM service may be overloaded or unreachable.

### Tracker Timeout

**Error:** `Timeout after 10000ms`

**Cause:** The GitHub API call during context enrichment (fetching recent tasks for dedup) did not complete within 10 seconds.

**Fix:** Check network connectivity to GitHub. Retry the operation.

## How Retries and Concurrency Work

### Retry Model

Pipelines do not automatically retry on failure. Infrastructure errors (network failures, API errors) are thrown as exceptions and bubble up to the caller. It is the caller's responsibility to retry.

The review pipeline has built-in loop limits for interactive operations:
- **Analysis clarification:** Up to 3 rounds of NeedInfo → answer → re-analyze
- **Edit feedback:** Up to 2 rounds of NeedDecision (edit) → feedback → rewrite

Exceeding these limits produces a Rejected result rather than an infinite loop.

### Concurrency Model (Symphony)

Symphony manages task concurrency at the orchestrator level:
- It polls GitHub Issues for tasks in active states (`status:todo`, `status:in-progress` by default)
- Each task is dispatched as an isolated agent run
- Workspace management ensures tasks don't interfere with each other
- Terminal states (`status:done`, `status:cancelled`) trigger cleanup

The Symphony adapter provides three operations for the orchestrator:
- `fetch_candidate_issues()` — Get open issues in active states for dispatch
- `fetch_issue_states_by_ids()` — Reconcile running task states (check if still active)
- `fetch_issues_by_states()` — Get closed issues in terminal states for workspace cleanup

## Usage Metrics

YAAF includes an in-memory usage aggregator that tracks:
- **Hourly metrics** — Token consumption, average context window usage, and request count over a sliding 60-minute window
- **Daily metrics** — Same metrics aggregated by UTC day, plus unique session count

The aggregator resets on process restart (zero persistence). It is designed for real-time monitoring, not historical analysis.
