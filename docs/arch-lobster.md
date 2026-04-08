# YAAF — Yet Another AI Factory - Lobster Architecture

**Date:** 2026-04-06

## Executive Summary

Lobster is the deterministic pipeline engine of the YAAF platform. It acts as the "How" layer of the system, executing sequential, typed workflows that handle the actual work of software delivery. Each Lobster run is self-contained and stateless, with data flowing explicitly between steps. Lobster translates high-level workflow definitions into series of atomic actions, including LLM calls and GitHub API mutations.

## Technology Stack

| Category | Technology | Version | Justification |
|---|---|---|---|
| Runtime | Node.js | LTS | Standard stable environment |
| Workflow | YAML (.lobster) | Custom | Deterministic, typed definitions |
| LLM Gateway | OpenClaw | Custom | Unified agent/LLM access point |
| Networking | `https` (native) | Built-in | Minimalist, zero-dependency approach |

## Architecture Pattern

Lobster follows a **Deterministic Sequential Pipeline** pattern. Workflows are defined as a series of steps that communicate via `stdin`, `stdout`, and `JSON`. Each step is a discrete unit of execution that can be a Node.js script, a CLI command, or an LLM call.

## Data Architecture

Lobster is fundamentally stateless. It does not maintain a local database or persistent storage between runs.
- **Context Flow**: Data between steps is passed via `stdin` and `stdout` as JSON.
- **State Preservation**: The "state" of the overall task is preserved by updating GitHub Issue labels and bodies at the end of each workflow run.

## API Design

Lobster provides a internal "Step API" through reusable Node.js modules in `lobster/lib/tasks/steps/`. These modules provide standardized ways to:
- **`llm-task.js`**: Execute LLM calls via the OpenClaw gateway.
- **`get-project-docs.js`**: Retrieve repository documentation for context.
- **`update-issue-labels.js`**: Update task state labels on GitHub.
- **`add-issue-comment.js`**: Provide feedback to human users on GitHub.

## Component Overview

### 1. `Workflow Engine` (`lobster/index.js`)
The core engine that parses `.lobster` files and manages the execution of steps, including argument interpolation and data piping.

### 2. `Step Functions` (`lobster/lib/tasks/steps/`)
A library of atomic, reusable Node.js modules that perform the actual work of the pipeline (LLM, GitHub, Docs).

### 3. `Shared Libraries` (`lobster/lib/`)
Core utilities like `retry.js` for robust networking and `load-dotenv.js` for configuration management.

## Source Tree

```
lobster/
├── workflows/            # .lobster workflow definitions (YAML)
│   ├── issue-review.lobster
│   ├── decompose-issue.lobster
│   └── ...
├── lib/
│   ├── tasks/
│   │   └── steps/        # Step-functions (llm-task.js, etc.)
│   ├── load-dotenv.js    # Self-contained .env loader
│   └── retry.js          # Exponential backoff retry logic
└── index.js              # Workflow execution engine
```

## Development Workflow

- **Run Workflow**: `node lobster/index.js run <path> --args-json '...'`
- **Create Step**: Add a new Node.js module to `lobster/lib/tasks/steps/`.
- **Create Workflow**: Define a new `.lobster` YAML file in `lobster/workflows/`.

## Deployment Architecture

Lobster is deployed as a CLI tool within the YAAF environment. It is typically spawned by Symphony but can also be run manually for debugging or specialized tasks.

## Testing Strategy

Lobster is tested across multiple levels in the `test/` directory:
- `test/tasks/`: Unit tests for individual step modules.
- `test/workflows/`: Validation of `.lobster` YAML files to ensure structural correctness.
- `test/integration/`: End-to-end tests of full pipelines using mocked data.

---

_Generated using BMAD Method `document-project` workflow_
