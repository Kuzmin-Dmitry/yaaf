# Workflow: Review Task

**Pipeline:** `review-task`
**Orchestrator:** `lobster/lib/tasks/review-task.js`
**Workflow spec:** `lobster/workflows/review-task.lobster`

## Purpose

Takes an existing GitHub issue (Draft or Backlog), loads project code context, runs architectural analysis via LLM, rewrites the task with technical depth, and updates the issue after user approval.

## Pipeline Steps

1. **fetch-task** — Retrieve issue from tracker, validate reviewable state (Draft/Backlog)
2. **load-code-context** — Spawn Librarian agent to explore repo and select relevant files
3. **analyze-task** — LLM-powered analysis: affected components, gaps, risks, approach
4. **rewrite-task** — LLM-powered rewrite with technical sections and acceptance criteria
5. **submit-for-approval** — Format NeedDecision for user review (approve/edit/reject)
6. **update-issue** — PATCH issue body on GitHub, add `reviewed:architecture` label

## Results

| Type | When |
|---|---|
| `Ready` | Issue updated with architectural review |
| `NeedInfo` | Analysis found gaps requiring user clarification |
| `NeedDecision` | Rewritten task ready for user approval |
| `Rejected` | Issue not found, invalid state, user rejected, or max retries exceeded |

## Multi-Turn Flow

- **Analysis clarification**: up to 3 re-invocations via `partial_state.answers`
- **Approval edit rounds**: up to 2 via `partial_state.edit_notes`
- **Approve**: `partial_state.decision = "approve"` triggers issue update
- **Reject**: `partial_state.decision = "reject"` exits immediately

## Reviewable States

Only `Draft` and `Backlog` issues can be reviewed. Other states return `Rejected(invalid_state)`.

## Dependencies

| Dependency | Contract |
|---|---|
| `tracker` | `fetchIssue(id)`, `updateIssue(id, updates)` |
| `llm` | `analyzeTask(prompt)`, `rewriteTask(prompt)` |
| `agentRunner` | `runAgentJSON(agentId, task)` — spawns OpenClaw Librarian agent |
| `owner`, `repo` | Repository coordinates |

## Code Context (Librarian Agent)

Step 2 delegates file discovery to the **Librarian** OpenClaw agent (`openclaw/Librarian/`). The agent:

- Explores the repository using multi-hop reading (structure → references → verification)
- Selects at most 15 files, up to 50KB total, truncating large files to 200 lines
- Returns structured JSON: `{ repoTree, files, totalSize }`
- Uses the agent's own tools (file reading) instead of direct GitHub API calls

Agent config: `openclaw/Librarian/AGENTS.md`
