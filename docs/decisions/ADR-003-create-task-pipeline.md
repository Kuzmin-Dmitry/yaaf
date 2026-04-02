# ADR-003: Create Task Pipeline Design

## Status

Accepted

## Context

YAAF needs a conversational task creation flow: user sends a natural language message in Telegram, the system structures it and publishes to GitHub Issues. The design must support:

- Happy path: one pipeline invocation, zero clarification questions
- Unhappy path: PM agent asks minimum needed, re-invokes with accumulated context
- Clean separation between conversation (PM agent) and execution (pipeline)

Key design decisions were needed around:
1. Where NL parsing happens (agent vs pipeline)
2. How clarification state is carried across re-invocations
3. How duplicates are detected
4. How the pipeline communicates back to the agent

## Decision

### Typed Result Protocol

The pipeline returns one of four typed results instead of free-form text:

| Type | Meaning | PM Action |
|---|---|---|
| `Ready` | Task published | Report success, done |
| `NeedInfo` | Required fields missing | Ask open question, re-invoke |
| `NeedDecision` | Ambiguous situation (e.g. duplicate) | Present options, re-invoke |
| `Rejected` | Cannot proceed (e.g. schema violation) | Explain, no re-invoke |

**Rationale:** Typed results make PM behavior deterministic and testable. PM doesn't need to interpret free-form pipeline output — it pattern-matches on type and acts accordingly.

### Parsing in Pipeline, Not in Agent

NL → structured field extraction happens in pipeline step 2 (`parse-request`), not in the PM agent.

**Rationale:** If PM parsed fields, the pipeline couldn't validate or correct them. PM would need to understand task schema, breaking the separation of concerns. The pipeline is the single authority on what constitutes a valid task.

### partial_state for Clarification Context

On re-invocation, PM passes `partial_state` (assembled from pipeline's `parsed_so_far` + user decisions). The pipeline's parse step merges this with newly extracted fields.

**Rationale:** Without `partial_state`, re-invokes lose context. "Fix login bug" as a title response gets parsed as a new task instead of filling a missing field. The merge rule (new non-null wins) is simple and predictable.

### Exact Match Dedup

Duplicate detection uses case-insensitive exact title match against non-Done tasks.

**Rationale:** Semantic similarity adds LLM latency to every create and produces false positives that annoy users. Exact match is free, deterministic, and sufficient for the current scale. Can upgrade to embeddings later if duplicates become a real problem.

### Six Sequential Steps

The pipeline uses six sequential steps with early-exit capability:

1. Enrich context (fetch tracker state)
2. Parse request (LLM — only step with AI)
3. Check completeness (deterministic)
4. Dedup check (deterministic)
5. Build TaskObject (deterministic)
6. Publish (tracker API)

**Rationale:** Each step has a single responsibility. Only step 2 uses an LLM — all other steps are deterministic and trivially testable. Early exits at steps 3, 4, 5 prevent unnecessary work.

### Max 3 Re-invocations

Clarification loop is capped at 3 iterations per user request.

**Rationale:** Prevents infinite clarification spirals from ambiguous requests. 3 iterations covers: missing title + dedup decision + one more field. If that's not enough, the request is too ambiguous and the user should start over.

## Consequences

**Positive:**
- Pipeline is fully testable with mock tracker and LLM
- PM agent logic is simple (switch on result type)
- Adding fields requires no pipeline structure changes (just new validation in step 3/5)
- Dedup is fast and predictable

**Negative:**
- Exact match dedup misses semantic duplicates — accepted tradeoff
- LLM in step 2 adds latency even for perfect requests — unavoidable for NL parsing
- `partial_state` merge can surprise if user accidentally provides a field name as text — parser should handle this

**Future:**
- `update_task` pipeline will follow the same typed result pattern
- Approval gate can be inserted as step 5.5 (before publish) without restructuring
- Semantic dedup replaces step 4 internals without changing the interface
