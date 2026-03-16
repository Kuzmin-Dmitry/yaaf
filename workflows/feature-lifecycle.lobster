# Feature Lifecycle Workflow
# Runtime: Lobster
# Description: End-to-end pipeline for autonomous feature delivery.
# Trigger: New Symphony session with a feature request.

name: feature-lifecycle
version: "1.0"
description: >
  Complete feature lifecycle from raw request to merged PR.
  Each stage is assigned to a specialized agent role.

stages:
  - id: init-spec
    name: Initialize Feature Specification
    agent: product-owner
    description: >
      Transform the raw feature request into a structured specification.
      If the request is ambiguous, the PO agent asks clarifying questions
      and waits for human response before proceeding.
    inputs:
      - source: session
        field: feature_request
    outputs:
      - file: docs/FEATURE_SPEC.md
    on_success: plan-tasks
    on_failure: halt-and-escalate

  - id: plan-tasks
    name: Plan Implementation Tasks
    agent: system-architect
    description: >
      Read the feature spec and analyze project files to produce
      an atomic, dependency-ordered task list.
    inputs:
      - file: docs/FEATURE_SPEC.md
    outputs:
      - file: docs/TASKS.json
    on_success: loop-coding
    on_failure: halt-and-escalate

  - id: loop-coding
    name: Iterative Coding Loop
    agent: implementation-lobster
    description: >
      Iterate through each task in TASKS.json. For each task:
      write code, validate, fix. Max 3 retry attempts per task.
      On 3 consecutive failures, escalate to the Architect.
    inputs:
      - file: docs/TASKS.json
    loop:
      over: tasks
      item_ref: current_task
      max_retries: 3
      retry_strategy: fix-and-revalidate
      on_max_retries: escalate-to-architect
    outputs:
      - type: code-changes
        target: working-tree
    on_success: verify-build
    on_failure: escalate-to-architect

  - id: verify-build
    name: Verify Build and Tests
    agent: qa-validator
    description: >
      Run the full test suite, build pipeline, and any feature-specific
      validation commands. If failures are detected, create a ticket
      and return to the Coder for fixes.
    inputs:
      - type: code-changes
        source: working-tree
      - file: docs/TASKS.json
    validation:
      - command: run-tests
      - command: run-build
      - command: feature-specific-validate
    on_success: update-docs
    on_failure:
      action: return-to-coder
      target: loop-coding
      with:
        error_logs: true
        failure_ticket: true

  - id: update-docs
    name: Update Documentation
    agent: technical-writer
    description: >
      Finalize README, CHANGELOG, and any other documentation
      to reflect the implemented feature.
    inputs:
      - file: docs/FEATURE_SPEC.md
      - type: code-changes
        source: working-tree
    outputs:
      - file: README.md
      - file: CHANGELOG.md
    on_success: pipeline-complete
    on_failure: halt-and-escalate

  - id: pipeline-complete
    name: Pipeline Complete
    description: >
      All stages passed. The feature is ready for human review.
      Create or update the Pull Request.
    action: finalize-session

# Error handling
escalation:
  escalate-to-architect:
    description: Coder failed 3 times — re-plan the task
    target: system-architect
    fallback: halt-and-escalate

  halt-and-escalate:
    description: Unrecoverable failure — request human intervention
    action: pause-session
    notify: human
