# Create Task Pipeline
# Runtime: Lobster
# Description: NL → struct → validate → publish. Six deterministic steps.
# Returns typed results: Ready | NeedInfo | NeedDecision | Rejected

name: create-task
version: "1.0"
description: >
  Structures a user's task request and publishes it to the tracker.
  Single pipeline invocation for happy path. Returns typed results
  for PM agent to handle clarification loops.

input:
  request: string        # raw user message (current turn)
  partial_state: object  # null on first call, accumulated parsed data on re-invoke

output:
  type: enum             # Ready | NeedInfo | NeedDecision | Rejected
  payload: object        # type-specific data (see contract below)

steps:
  - id: enrich-context
    name: Enrich Context
    description: >
      Fetch project metadata from the tracker — existing labels, recent tasks
      (for dedup), project schema. Context is available to all downstream steps.
    action: lobster/lib/tasks/steps/enrich-context
    inputs:
      - source: deps
        field: tracker
    outputs:
      - field: context
    on_failure: system-error

  - id: parse-request
    name: Parse Request
    description: >
      Extract structured fields from the user message using LLM.
      If partial_state contains parsed fields, merge — new data overrides,
      existing data is preserved. This is the only step that touches an LLM.
    action: lobster/lib/tasks/steps/parse-request
    inputs:
      - source: input
        field: request
      - source: input
        field: partial_state
      - source: steps.enrich-context
        field: context
      - source: deps
        field: llm
    outputs:
      - field: parsed

  - id: check-completeness
    name: Check Completeness
    description: >
      Validate that all required fields are present and non-empty.
      Currently only title is required.
    action: lobster/lib/tasks/steps/check-completeness
    inputs:
      - source: steps.parse-request
        field: parsed
    early_exit:
      condition: "!result.complete"
      returns: NeedInfo

  - id: dedup-check
    name: Dedup Check
    description: >
      Compare parsed.title against existing tasks (case-insensitive exact match).
      Skip if partial_state includes dedup_decision.
    action: lobster/lib/tasks/steps/dedup-check
    inputs:
      - source: steps.parse-request
        field: parsed
      - source: steps.enrich-context
        field: context
    early_exit:
      condition: "!result.clear"
      returns: NeedDecision

  - id: build-task-object
    name: Build TaskObject
    description: >
      Assemble the final TaskObject from parsed fields.
      Validate against schema. State is always Draft for new tasks.
    action: lobster/lib/tasks/steps/build-task-object
    inputs:
      - source: steps.parse-request
        field: parsed
    early_exit:
      condition: "!result.valid"
      returns: Rejected

  - id: publish
    name: Publish
    description: >
      POST to tracker API. Create the issue. Return tracker response.
    action: lobster/lib/tasks/steps/publish
    inputs:
      - source: steps.build-task-object
        field: task
      - source: deps
        field: tracker
    outputs:
      - field: result
    on_failure: system-error

# Typed results contract
results:
  Ready:
    description: Task published successfully
    schema:
      task:
        id: string
        url: string
        title: string

  NeedInfo:
    description: Required fields missing — PM asks open question
    schema:
      missing: string[]
      parsed_so_far: object

  NeedDecision:
    description: Ambiguous situation — PM presents bounded options
    schema:
      reason: string
      candidates: object[]
      parsed_so_far: object

  Rejected:
    description: Cannot proceed — pipeline run is terminal
    schema:
      reason: string
      details: string

# PM handling contract
pm_behavior:
  Ready: "Report success to user. Done."
  NeedInfo: "Ask open question from missing array. Re-invoke with enriched partial_state."
  NeedDecision: "Present options from candidates. Re-invoke with user decision in partial_state."
  Rejected: "Explain reason. Suggest alternative. No re-invoke."

# Clarification loop
loop:
  max_reinvocations: 3
  counter_reset: "On fresh user messages (not re-invokes)"
  on_max_reached: "PM asks user to reformulate from scratch"
