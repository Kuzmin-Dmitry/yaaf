# Feature: Create Task Flow

> Conversational task creation — user talks to PM agent, system structures the request and publishes it to the tracker.

## Overview

The create-task flow enables users to create structured tasks in the issue tracker through natural language conversation in Telegram. The PM agent orchestrates clarification when needed, while the `create_task` pipeline handles all NL parsing, validation, dedup, and publishing deterministically.

## Components

| Component | Type | Location |
|---|---|---|
| `agent.main` | OpenClaw agent | Intent classification, routing. Delegates task intents to PM. |
| `agent.pm` | OpenClaw agent | [agents/pm.md](../agents/pm.md) — conversational orchestrator, clarification loop |
| `skill.tasks` | Markdown config | [skills/tasks.md](../skills/tasks.md) — routing rules for agent.main |
| `create_task` | Lobster pipeline | [workflows/create-task.lobster](../workflows/create-task.lobster) — 6-step pipeline definition |
| `lib/tasks/` | Node.js modules | Pipeline runtime implementation |
| Tracker | External API | GitHub Issues (via PAT) |

## Responsibility Boundaries

```
agent.main  → WHO should handle this (routing)
agent.pm    → WHAT does the user want (orchestration)
create_task → HOW to structure and publish it (execution)
```

PM does not parse. Pipeline does not converse. This boundary is load-bearing.

## Task Model

### Fields

| Field | Type | Required | Source |
|---|---|---|---|
| `title` | string (max 200) | yes | Extracted from user message by pipeline |
| `description` | string | no | Extracted or empty |
| `state` | enum | yes, default `Draft` | Set by pipeline |

### States

```
[*] → Draft → Backlog → Ready → InProgress → InReview → Done → [*]
                                       ↑                  |
                                       └── rework ────────┘
```

New tasks always start in `Draft`. State transitions are out of scope.

### Out of Scope

- Assignee, Priority — no assignment/prioritization logic needed
- Update flow — separate feature
- Approval gate before publish — deferred

## Pipeline: create_task

Six sequential steps. Each can exit early with a typed result.

```
enrich context → parse request → check completeness → dedup check → build TaskObject → publish
                                        ↓                   ↓                ↓
                                    NeedInfo            NeedDecision      Rejected
```

### Step 1: Enrich Context

Fetches project metadata from the tracker — recent tasks (for dedup). No early exit. Tracker unreachable = infra failure (throws).

**Implementation:** `lib/tasks/steps/enrich-context.js`

### Step 2: Parse Request

Extracts structured fields from user message via LLM. Merges with `partial_state` — new non-null values override. This is the **only step that touches an LLM**.

**Implementation:** `lib/tasks/steps/parse-request.js`

### Step 3: Check Completeness

Validates required fields (currently only `title`). Returns `NeedInfo` with `missing` array if incomplete.

**Implementation:** `lib/tasks/steps/check-completeness.js`

### Step 4: Dedup Check

Case-insensitive exact title match against recent tasks (excludes `Done`). Skips if `dedup_decision` present in `partial_state`. Returns `NeedDecision` with candidates if match found.

**Implementation:** `lib/tasks/steps/dedup-check.js`

### Step 5: Build TaskObject

Assembles final `TaskObject`, validates against schema. State is always `Draft`. Returns `Rejected` on schema violation (e.g. title > 200 chars).

**Implementation:** `lib/tasks/steps/build-task-object.js`

### Step 6: Publish

POSTs to tracker API. Returns `Ready` with task ID, URL, title.

**Implementation:** `lib/tasks/steps/publish.js`

## Typed Results

| Type | PM Behavior | Re-invoke? |
|---|---|---|
| `Ready` | Report success: "Создал TASK-43" | No |
| `NeedInfo` | Ask open question from `missing` array | Yes, with enriched `partial_state` |
| `NeedDecision` | Present bounded options from `candidates` | Yes, with user decision |
| `Rejected` | Explain reason, suggest alternative | No — terminal |

## Clarification Loop

### partial_state

Assembled by PM from two sources:
1. `parsed_so_far` — returned by pipeline, passed through unchanged
2. User decisions on `NeedDecision` — single key added (e.g. `dedup_decision: "create_new"`)

PM never extracts structured fields from user text.

### Merge Rule

On re-invoke, step 2 always parses the new request and merges with `partial_state`. New non-null values override. If parse finds nothing new, existing values are preserved.

### Loop Limits

Max 3 re-invocations. After 3 loops without `Ready`, PM asks user to reformulate. Counter resets on fresh user messages.

## Scenarios

### Happy Path

```
User: сделай таск "Fix login bug" — логин падает на невалидном email
→ create_task(request, null)
→ enrich → parse → complete ✓ → dedup ✓ → build → publish
← Ready { id: TASK-43 }
PM: Создал TASK-43 "Fix login bug"
```

### Missing Title

```
User: сделай таск — логин не работает
→ create_task(request, null)
← NeedInfo { missing: [title] }
PM: Как назвать задачу?
User: Fix login bug
→ create_task("Fix login bug", { description: "логин не работает" })
← Ready { id: TASK-44 }
```

### Duplicate Found

```
User: сделай таск на фикс логина
→ create_task(request, null)
← NeedDecision { candidates: [TASK-42] }
PM: Нашёл TASK-42. Создать новую или это она?
User: создай новую
→ create_task("создай новую", { title: "Fix login bug", dedup_decision: "create_new" })
← Ready { id: TASK-45 }
```

### Intent Switch to Update

```
PM: Нашёл TASK-42. Создать новую или обновить?
User: обнови существующую
→ PM switches to update_task flow (not implemented yet)
```

### Schema Violation

```
User: сделай таск с очень длинным названием...
← Rejected { reason: "schema_violation", details: "Title exceeds 200 characters" }
PM: Название слишком длинное (макс. 200). Сократить?
```

## Error Handling

| Error | Source | Handling |
|---|---|---|
| Tracker unreachable | step 1, step 6 | Infra failure. PM tells user to try again later. |
| LLM fails to parse | step 2 | Returns empty parsed. Step 3 catches as NeedInfo. |
| Pipeline crash | any step | PM reports error. No retry — user can rephrase. |

## File Map

```
lib/tasks/
├── index.js              # Module export
├── model.js              # Task schema, states, validation, result types
├── create-task.js        # Pipeline orchestrator
└── steps/
    ├── enrich-context.js
    ├── parse-request.js
    ├── check-completeness.js
    ├── dedup-check.js
    ├── build-task-object.js
    └── publish.js

workflows/
└── create-task.lobster   # Lobster pipeline definition

agents/
└── pm.md                 # PM agent behavioral rules

skills/
└── tasks.md              # Intent routing rules for agent.main

test/tasks/
├── model.test.js         # Task model unit tests
├── steps.test.js         # Individual step tests
└── create-task.test.js   # End-to-end pipeline scenario tests
```

## Future Extensions

| Extension | Impact |
|---|---|
| Update flow | New `update_task` pipeline. PM routes by intent. |
| Approval gate | Lobster `approve` step before publish. |
| Semantic dedup | Embedding-based similarity in step 4. |
| More fields | Add to TaskObject, validation in step 5, NeedInfo in step 3. |
| Max loop override | Config value instead of hardcoded 3. |
