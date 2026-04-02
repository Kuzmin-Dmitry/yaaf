# Review Task Pipeline
# Runtime: Lobster
# Description: Fetch → load context → analyze → rewrite → approval → update.
# Returns typed results: Ready | NeedInfo | NeedDecision | Rejected

name: review-task
version: "0.1"
description: >
  Architectural review of an existing GitHub issue. Loads project code context,
  applies architectural analysis via LLM, clarifies gaps with the user,
  rewrites the task with technical depth, and updates the issue after approval.
  Supports multi-turn clarification via partial_state.

input:
  issue_id: string           # GitHub issue number to review
  partial_state: object      # null on first call, accumulated state on re-invoke

output:
  type: enum                 # Ready | NeedInfo | NeedDecision | Rejected
  payload: object            # type-specific data (see contract below)

deps:
  tracker: object            # tracker client with fetchIssue(), updateIssue()
  llm: object                # LLM client with analyzeTask(), rewriteTask()
  agentRunner: object        # OpenClaw agent runner with runAgentJSON()
  owner: string              # GitHub repo owner
  repo: string               # GitHub repo name

steps:
  - id: fetch-task
    name: Fetch Task
    description: >
      Retrieve the issue from the tracker. Validate state is reviewable
      (Draft or Backlog). Returns Rejected if issue not found or in
      an invalid state.
    action: lobster/lib/tasks/steps/fetch-task
    inputs:
      - source: input
        field: issue_id
      - source: deps
        field: tracker
    outputs:
      - field: issue
    early_exit:
      condition: "!result.ok"
      returns: Rejected

  - id: load-code-context
    name: Load Code Context
    description: >
      Spawn the Librarian agent to explore the repository and select
      relevant files for architectural analysis. The agent uses multi-hop
      exploration instead of keyword matching. Max 15 files, 50KB total.
    action: lobster/lib/tasks/steps/load-code-context
    inputs:
      - source: steps.fetch-task
        field: issue
      - source: deps
        field: agentRunner
      - source: deps
        field: owner
      - source: deps
        field: repo
    outputs:
      - field: codeContext
    on_failure: system-error

  - id: analyze-task
    name: Analyze Task
    description: >
      LLM-powered architectural analysis. Produces affected components,
      technical gaps, risks, dependencies, approach, and completeness score.
      Returns NeedInfo if technical gaps are detected.
    action: lobster/lib/tasks/steps/analyze-task
    inputs:
      - source: steps.fetch-task
        field: issue
      - source: steps.load-code-context
        field: codeContext
      - source: deps
        field: llm
      - source: input
        field: partial_state.answers
    early_exit:
      condition: "!result.ok"
      returns: NeedInfo

  - id: rewrite-task
    name: Rewrite Task
    description: >
      LLM-powered task rewrite producing an implementation-ready spec
      with technical context, approach, acceptance criteria, and risks.
      Original description preserved in a collapsed section.
    action: lobster/lib/tasks/steps/rewrite-task
    inputs:
      - source: steps.fetch-task
        field: issue
      - source: steps.analyze-task
        field: analysis
      - source: steps.load-code-context
        field: codeContext
      - source: deps
        field: llm
      - source: input
        field: partial_state.edit_notes

  - id: submit-for-approval
    name: Submit for Approval
    description: >
      Format the rewritten task as a NeedDecision result. Always returns
      NeedDecision with options: approve, edit, reject.
    action: lobster/lib/tasks/steps/submit-for-approval
    inputs:
      - source: steps.rewrite-task
        field: rewritten
      - source: steps.fetch-task
        field: issue
    returns: NeedDecision

  - id: update-issue
    name: Update Issue
    description: >
      PATCH the GitHub issue body with rewritten content. Add
      reviewed:architecture label. Triggered only after user approval.
    action: lobster/lib/tasks/steps/update-issue
    inputs:
      - source: input
        field: issue_id
      - source: steps.rewrite-task
        field: rewritten
      - source: deps
        field: tracker
    outputs:
      - field: result
    on_failure: system-error

results:
  Ready:
    description: Issue updated with architectural review.
    shape:
      type: Ready
      task:
        id: string
        url: string
        title: string
        changes_summary: string

  NeedInfo:
    description: Analysis found gaps requiring user clarification.
    shape:
      type: NeedInfo
      phase: analysis
      questions: string[]
      analysis_so_far: object

  NeedDecision:
    description: Rewritten task ready for user approval.
    shape:
      type: NeedDecision
      phase: approval
      rewritten_task: object
      options: string[]
      diff_summary: string

  Rejected:
    description: Review cannot proceed or was rejected by user.
    shape:
      type: Rejected
      reason: enum         # issue_not_found | invalid_state | user_rejected | max_retries | missing_issue_id
      details: string

loop_limits:
  analysis_clarification: 3
  approval_edit_rounds: 2
