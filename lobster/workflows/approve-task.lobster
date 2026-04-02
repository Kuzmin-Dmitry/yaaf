# Approve Task Pipeline
# Runtime: Lobster
# Description: Fetch → validate → approve. Three deterministic steps.
# Transitions: Draft→Backlog, Backlog→Ready via GitHub labels.
# Returns typed results: Ready | Rejected

name: approve-task
version: "1.0"
description: >
  Approves a task by transitioning its status label on the GitHub issue.
  Valid transitions: Draft→Backlog (first approval), Backlog→Ready (second).
  Fully deterministic, no LLM.

input:
  issue_id: string           # GitHub issue number to approve

output:
  type: enum                 # Ready | Rejected
  payload: object            # type-specific data (see contract below)

steps:
  - id: fetch-issue
    name: Fetch Issue
    description: >
      Retrieve the current issue from the tracker, including labels.
      Determine the current state from status:* labels.
    action: lobster/lib/github/tracker-adapter#fetchIssue
    inputs:
      - source: input
        field: issue_id
      - source: deps
        field: tracker
    outputs:
      - field: issue
    on_failure: system-error

  - id: validate-transition
    name: Validate Transition
    description: >
      Check that the current state has a valid approval transition.
      Draft→Backlog and Backlog→Ready are the only valid transitions.
      All other states produce a Rejected result.
    inputs:
      - source: steps.fetch-issue
        field: issue
    early_exit:
      condition: "!APPROVAL_TRANSITIONS[issue.state]"
      returns:
        type: Rejected
        reason: invalid_transition
        details: "Cannot approve issue in current state"

  - id: approve
    name: Approve (Swap Labels)
    description: >
      Remove the old status:* label and add the new one.
      Returns the transition result.
    action: lobster/lib/github/tracker-adapter#approveIssue
    inputs:
      - source: input
        field: issue_id
      - source: deps
        field: tracker
    outputs:
      - field: approval
    on_failure: system-error

results:
  Ready:
    description: Approval transition completed successfully.
    shape:
      type: Ready
      task:
        id: string
        title: string
        previousState: string
        newState: string

  Rejected:
    description: Issue is not in a state that allows approval.
    shape:
      type: Rejected
      reason: enum           # missing_issue_id | invalid_transition
      details: string
