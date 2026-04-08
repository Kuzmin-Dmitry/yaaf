# YAAF — Yet Another AI Factory - Integration Architecture

**Date:** 2026-04-06

## Introduction

YAAF operates as a highly coordinated multi-part system where different components handle specific layers of the software delivery lifecycle. This document details the architectural integration between the Symphony Orchestrator, the Lobster Pipeline, and external services like GitHub.

## System Architecture Layers

The system is organized into three conceptual layers:

1. **Symphony (The "When" Layer)**: Continuously monitors the task backlog (GitHub Issues).
2. **Lobster (The "How" Layer)**: Executes deterministic workflows based on the task's current state.
3. **OpenClaw (The "Who/What" Layer)**: Provides the execution environment for AI agents and LLM gateways.

## Integration Diagram (Conceptual)

```
[GitHub Issues] ←(poll)-- [Symphony] --(dispatch)→ [Lobster]
       ↑                       ↑                      │
       └-----------(mutate)----┴-----------(mutate)----┘
                                                      │
                                                      ↓
                                                [OpenClaw/LLM]
```

## Core Integration Points

### 1. Symphony → Lobster (Process Dispatch)

- **Mechanism**: `child_process.spawn()` (Node.js)
- **Workflow**:
  - Symphony's `Dispatcher` (`symphony/dispatcher.js`) matches an issue's labels to a specific `.lobster` file.
  - It then spawns a new process: `node lobster/index.js run <workflow_path> --args-json '...'`.
  - The arguments include the repository metadata (`owner`, `repo`) and task details (`issue_number`, `title`, `body`).
- **Data Flow**: One-way from Symphony to Lobster via command-line arguments and environment variables.

### 2. Symphony/Lobster → GitHub API (State Management)

- **Mechanism**: Native Node.js `https` module (REST API).
- **Communication**:
  - **Symphony**: Reads state by polling open issues and filtering for known labels (`draft`, `reviewed_by_pm`, etc.).
  - **Lobster**: Updates state by mutating issue bodies, adding comments, and shifting labels (e.g., removing `draft` and adding `reviewed_by_pm`).
- **Data Flow**: Bi-directional. GitHub Issues act as the central "source of truth" and persistent state store for all tasks.

### 3. Lobster → OpenClaw / LLM Gateway (Agent Execution)

- **Mechanism**: Native Node.js `https` module (REST API) or `child_process` (CLI).
- **Workflow**:
  - The `llm-task.js` step module sends prompts to the `GATEWAY_URL`.
  - The `OpenClaw` gateway routes these to the underlying LLM (e.g., GPT-4o).
  - Agents can also be invoked via the `openclaw agent` CLI command for more complex, multi-turn interactions.
- **Data Flow**: Bi-directional. Prompts are sent, and generated content (code, reviews, decompositions) is returned.

## Data Exchange Formats

- **Workflows**: Defined in YAML (`.lobster` files).
- **Context Flow**: Within a Lobster run, data between steps flows via `stdin` and `stdout` as raw strings or JSON.
- **State Labels**: String constants representing the current phase of the task lifecycle (e.g., `approved_after_pm`).

## Failure Recovery & Resilience

- **Retry Logic**: All network calls (GitHub, LLM) use a custom exponential backoff retry mechanism (`lobster/lib/retry.js`).
- **Statelessness**: Since Lobster is stateless, a failed run can be re-dispatched by Symphony in the next polling cycle without data loss, as the "current state" remains preserved in GitHub labels.
- **In-flight Tracking**: Symphony maintains an "in-flight" set in memory to prevent multiple parallel runs for the same issue.

---

_Generated using BMAD Method `document-project` workflow_
