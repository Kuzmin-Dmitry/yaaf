# YAAF Code Review — 2026-04-23

**Reviewer:** Claude Code (Opus 4.7)
**Scope:** Full codebase at `C:/git/yaaf` — symphony/, lobster/, config/, test/, docs/
**Method:** Four parallel Explore agents covering orchestration, in-process pipelines, steps/CLI helpers, and test suite. Top-severity findings verified by direct file reads; claims that did not hold up were dropped.

Severity scale: **CRITICAL** blocks the system / exploitable · **HIGH** likely to cause incidents · **MEDIUM** correctness or maintenance pain · **LOW / NIT** style, polish.

---

## CRITICAL

### 1. Dispatcher points at workflows that don't exist
`symphony/dispatcher.js:5-9` maps:

| State                     | Workflow file referenced           | Exists? |
|---------------------------|------------------------------------|---------|
| `draft`                   | `issue-review.lobster`             | ❌      |
| `reviewed_by_pm`          | `get-user-approve.lobster`         | ❌      |
| `needs_rework_after_pm`   | `update-issue.lobster`             | ❌      |
| `approved_after_pm`       | `decompose-issue.lobster`          | ❌      |

The four workflows that *do* exist (`create-github-issue`, `review-task`, `approve-task`, `project-status`) are unreachable via Symphony. Symphony is dead on arrival — every dispatch spawns `lobster run` against a missing file.

**Fix:** decide — rename the table entries to the existing workflows, or create the missing four to match the Mermaid diagram in `docs/workflow.md`.

### 2. `npm test` is structurally broken
`package.json:7` chains 13 test files, of which **12 do not exist**:

- `test/workflows/validate-lobster.test.js`
- `test/tasks/get-user-approve.test.js`
- `test/tasks/update-issue.test.js`
- `test/tasks/decompose-issue.test.js`
- `test/tasks/issue-review.test.js`
- `test/tasks/user-approve-callback.test.js`
- `test/symphony/symphony.test.js`
- `test/symphony/dispatcher.test.js`
- `test/symphony/tracker.test.js`
- `test/symphony/timeout.test.js`
- `test/symphony/run.test.js`
- `test/integration/flow.test.js`

Conversely, these files exist but are **not** referenced, so they never run in CI:

- `test/github/symphony-adapter.test.js`
- `test/github/tracker-adapter.test.js`
- `test/usage/aggregator.test.js`
- `test/tasks/approve-task.test.js`
- `test/tasks/create-task.test.js`
- `test/tasks/model.test.js`
- `test/tasks/project-status.test.js`
- `test/tasks/publish-task.test.js`
- `test/tasks/publish-task-model.test.js`
- `test/tasks/publish-task-steps.test.js`
- `test/tasks/review-task.test.js`
- `test/tasks/steps.test.js`

**Fix:** rewrite the `test` script to list only files that exist (mechanical, low-risk).

### 3. Approval label swap is non-atomic
`lobster/lib/github/tracker-adapter.js:183-186` removes the old `status:*` label and then adds the new one in two separate API calls:

```js
if (labelNames.includes(oldLabel)) {
  await client.removeLabel(owner, repo, issueId, oldLabel);
}
await client.addLabels(owner, repo, issueId, [newLabel]);
```

If the second call fails (rate-limit, network), the issue is left with no status label — Symphony won't find it again, and the in-process state machine sees it as an unknown state.

**Fix:** either wrap in try/catch and re-add the old label on failure, or use `PUT /issues/{n}/labels` with the full label set to replace atomically.

---

## HIGH

### 4. `partial_state` counters are caller-controlled
`lobster/lib/tasks/review-task.js:66, 91, 118`. `edit_count` and `clarification_count` are read straight from untrusted input on every call:

```js
const editCount = partial_state.edit_count || 0;
if (editCount >= REVIEW_LIMITS.maxEditRounds) { ... }
```

A caller passing `{edit_count: 0}` on every re-invoke trivially bypasses `REVIEW_LIMITS`.

**Fix:** clamp `newCount = Math.max(prevCount + 1, 1)` from a server-side source, or sign/stamp `partial_state` before returning it.

### 5. Unwrapped async deps leak raw errors
`lobster/lib/tasks/review-task.js:60, 109, 114, 119, 131`; `approve-task.js:41, 54`. `tracker.fetchIssue`, `llm.analyzeTask`, `agentRunner.runAgentJSON`, `updateIssue` are awaited with no try/catch — any provider-layer exception rejects the pipeline promise and the raw stack lands in whatever Symphony logs or, worse, in a GitHub issue body.

**Fix:** wrap each async dep call and return `{ type: RESULT_TYPES.Rejected, reason: 'system_error', details: … }`.

### 6. `.lobster` workflows reference instance methods as if they were module exports
`lobster/workflows/approve-task.lobster:27, 58` uses:

```yaml
action: lobster/lib/github/tracker-adapter#fetchIssue
action: lobster/lib/github/tracker-adapter#approveIssue
```

But `tracker-adapter.js:218` only exports `{ createGitHubTracker, mapIssueState, resolveToken }`. The named methods exist on the object *returned by* `createGitHubTracker(deps)`, not at module level. Unless the external `lobster` runtime knows to call the factory first, these action references won't resolve.

**Fix:** either export methods at module level, or document the factory-then-method resolution convention the runner expects.

### 7. Dispatcher leaks child-process stdout/stderr without bound
`symphony/dispatcher.js:35-38`:

```js
child.stdout.on('data', d => { stdout += d; });
child.stderr.on('data', d => { stderr += d; });
```

Holds everything until `close`. A chatty workflow can blow memory on a 24/7 daemon. The logs at lines 42/45 only keep the last 200/500 chars anyway.

**Fix:** cap or ring-buffer to the tail size you actually log.

### 8. CLI helpers assume `project.repo` is `"owner/repo"`
`lobster/lib/tasks/cli/cgi-publish.js:15`, `cgi-enrich.js:16`, `ps-fetch.js:48`. A missing or malformed value silently yields `owner=undefined`, producing confusing GitHub 404s deep in the stack.

**Fix:** validate `project.repo.split('/').length === 2` at the boundary and fail fast with a clear message.

### 9. No retry / backoff on GitHub calls
`lobster/lib/github/client.js:20-64`. A single 429/503 kills the current run. `docs/setup.md:85` claims `lobster/lib/retry.js` exists — it doesn't.

**Fix:** add minimal retry-with-jitter on 429 + 5xx for idempotent ops (GET, label add/remove).

### 10. Test coverage holes in the riskiest code
Zero direct tests for:

- `symphony/dispatcher.js` (spawns child processes, base64 encodes args)
- `lobster/lib/openclaw/agent-runner.js` (spawns `openclaw` CLI, parses JSON from stdout)
- Most of `lobster/lib/tasks/steps/`: `parse-message`, `rewrite-task`, `run-step`, `update-issue`, `with-timeout`, `load-code-context`, `analyze-task`

`review-task.test.js` mocks the entire LLM/agent layer, so the modules it's supposedly exercising are uncovered. Most `lobster/lib/tasks/cli/*.js` modules are untested (only `cgi-resolve`, `cgi-type`, `cli-io` are covered via `create-github-issue.test.js`).

**Fix:** backfill step-level unit tests; at minimum add dispatcher and agent-runner tests with mocked `child_process`.

---

## MEDIUM

### 11. Title length bypass via whitespace
`lobster/lib/tasks/model.js:68`:

```js
if (!task.title || typeof task.title !== 'string' || task.title.trim().length === 0) { ... }
if (task.title.length > TITLE_MAX_LENGTH) { ... }
```

Inconsistent: `"   " + 200-char content` passes both checks but is >200 chars after trim.

**Fix:** apply `.trim()` to both checks and store the trimmed value.

### 12. Prompt injection surface on `issue.body`
`lobster/lib/tasks/steps/analyze-task.js:34`, `rewrite-task.js:30` embed `issue.body` directly into the LLM prompt. Low blast radius (self-directed repos), but worth fencing in a code block with a clear `USER INPUT BELOW / UNTRUSTED` marker.

### 13. `load-code-context` trusts the Librarian agent's file list and sizes
`lobster/lib/tasks/steps/load-code-context.js`. No enforced cap on returned content; the "15 files / 50KB" budget advertised in `review-task.lobster:54` is documented but not enforced in code.

**Fix:** enforce post-agent — count files and sum content sizes, truncate if exceeded.

### 14. `with-timeout` races a timer but doesn't cancel the wrapped op
`lobster/lib/tasks/steps/with-timeout.js:10`. If the underlying promise is an in-flight HTTP request, it keeps running. Fine for node stdlib `https` (GC'd), but document the semantic — callers should not assume the work stopped.

### 15. `project-status.js` exports facades nothing imports
`lobster/lib/tasks/project-status.js:13-18`. Its own doc comment says "No external consumers import from this file currently." Dead API surface.

**Fix:** delete or mark clearly as internal-only.

### 16. Hard-coded status-label strings in mocks
e.g. `test/tasks/project-status.test.js:154-215`. If `STATE_LABELS` in `model.js` changes, these mocks silently diverge from production.

**Fix:** import the constants from `model.js`.

### 17. `cgi-publish` builds labels without validating type
`lobster/lib/tasks/cli/cgi-publish.js:16-17` does `` `type:${task.type}` `` without checking against `TASK_TYPES`. User-shaped input could produce garbage labels.

### 18. `ps-aggregate.js:19` hard-codes `'Ready'` instead of `RESULT_TYPES.Ready`
Breaks if the enum is ever renamed.

### 19. Client-side `JSON.parse` without try/catch
`lobster/lib/tasks/cli/cgi-dedup.js:17` relies on a `!== 'null'` string guard before `JSON.parse(psRaw)`; any other invalid JSON will throw uncaught.

### 20. `cli-io.js:15` returns `''` for a flag provided without a value
Caller can't distinguish "missing" from "empty".

**Fix:** return `undefined` / `null`.

---

## LOW / NIT

### 21. `docs/` is partially aspirational
References files that don't exist in the tree:

- `symphony/index.js`
- `symphony/tracker.js`
- `lobster/index.js`
- `lobster/lib/retry.js`
- `AGENTS.md`
- `SKILL.md`
- `.env.example`

**Fix:** either backfill or prune the stale docs. Already flagged in `CLAUDE.md`.

### 22. Hardcoded `X-GitHub-Api-Version: 2022-11-28`
`lobster/lib/github/client.js:31`. Fine for now; leave a TODO for when it sunsets.

### 23. Base64 suffix `:base64` convention is undocumented
`symphony/dispatcher.js:24` / `run-step.js:30`. Fine, but note it somewhere normative (now in `CLAUDE.md`).

### 24. Duplicated validation between test files
`test/tasks/create-task.test.js` and `test/tasks/publish-task-steps.test.js` exercise near-identical validation paths. A single validation regression can pass both because assertions are near-identical.

---

## Dismissed findings

Two agent claims did not hold up under verification:

- **Prototype pollution in `run-step.js:29`** — the agent flagged the `for...in` recursive base64 decoder as exploitable via a `{"__proto__": ...}` payload. **Not exploitable.** `JSON.parse` creates `__proto__` as an own data property (via `[[DefineOwnProperty]]`, not the setter), and subsequent mutation of that own property does not pollute `Object.prototype`. The style is still suspect — prefer `Object.keys()` — but it's not the CVE one agent claimed.
- **Memory leak in GitHub client streaming** (`client.js:41-42`) — string concatenation on response chunks is standard Node.js idiom for small JSON responses; GitHub REST responses are bounded by pagination (`per_page ≤ 100`). Not a real leak at the expected payload sizes.

---

## Suggested next actions (by impact/effort)

1. **Decide Symphony's dispatch table** — rename to existing workflows *or* add the missing four. Without this, nothing runs end-to-end. *(CRITICAL #1)*
2. **Fix `npm test`** — prune missing files, add the orphaned ones, commit a working script. Mechanical, low-risk. *(CRITICAL #2)*
3. **Make label swap atomic + wrap async deps in try/catch.** One morning's work, large reliability win. *(CRITICAL #3, HIGH #5)*
4. **Sign or server-enforce `partial_state` counters.** *(HIGH #4)*
5. **Backfill step-level unit tests**, especially for `rewrite-task`, `analyze-task`, `update-issue`, `parse-message`, and the two untested top-level modules (`dispatcher.js`, `agent-runner.js`). *(HIGH #10)*
