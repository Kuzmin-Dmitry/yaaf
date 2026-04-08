# YAAF — Yet Another AI Factory - Source Tree Analysis

**Date:** 2026-04-06

## Overview

YAAF is organized into several key directories that separate the pipeline logic (`lobster`), the orchestration layer (`symphony`), and the configuration/test infrastructure. The project follows a "zero-dependency" philosophy, meaning all logic is self-contained or relies on standard Node.js libraries.

## Multi-Part Structure

This project is organized into 2 distinct parts:

- **Symphony Orchestrator** (`symphony/`): The "when" layer that polls GitHub and dispatches workflows.
- **Lobster Pipeline** (`lobster/`): The "how" layer containing workflow definitions and step logic.

## Complete Directory Structure

```
yaaf/
├── AGENTS.md                 # Agent-specific documentation and runtime details
├── README.md                 # Project entry point and high-level overview
├── SKILL.md                  # Skill-specific details (BMAD)
├── config/                   # Configuration files (e.g., projects.json)
├── docs/                     # Documentation hub (Overview, Setup, etc.)
├── lobster/                  # Core pipeline logic (Lobster)
│   ├── lib/                  # Shared library modules (retry, load-dotenv)
│   │   ├── tasks/            # Task-specific logic
│   │   │   └── steps/        # Individual pipeline steps (Node.js modules)
│   └── workflows/            # .lobster workflow definitions (YAML)
├── symphony/                 # Orchestration daemon (Symphony)
│   ├── dispatcher.js         # Logic for matching states to workflows
│   ├── index.js              # Main entry point for the orchestrator
│   └── tracker.js            # Logic for polling GitHub issues/labels
├── test/                     # Comprehensive test suite (zero-dependency)
│   ├── helpers/              # Test mocks and utilities
│   ├── integration/          # Full-flow integration tests
│   ├── symphony/             # Tests for the Symphony orchestrator
│   ├── tasks/                # Tests for individual pipeline steps
│   └── workflows/            # Tests for Lobster workflow execution
└── scripts/                  # Operational and maintenance scripts
```

## Critical Directories

### `lobster/workflows/`

**Purpose:** Pipeline definitions.
**Contains:** `.lobster` files describing the sequence of steps for each lifecycle event.
**Purpose:** Defines "How" a task progresses (e.g., from `draft` to `reviewed`).
**Entry Points:** Run via `node lobster/index.js run ...`

### `lobster/lib/tasks/steps/`

**Purpose:** Individual building blocks of workflows.
**Contains:** Node.js modules for specific tasks (GitHub API calls, LLM calls, doc reading).
**Purpose:** Reusable atomic operations that make up a pipeline.

### `symphony/`

**Purpose:** Orchestration layer.
**Contains:** Daemon logic for continuous monitoring.
**Purpose:** Defines "When" a task should be processed.
**Entry Points:** `node symphony/index.js` (Main polling loop)

### `config/`

**Purpose:** External configuration registry.
**Contains:** `projects.json` for mapping GitHub repos to local paths/aliases.

## Entry Points

### Symphony Orchestrator

- **Entry Point:** `symphony/index.js`
- **Bootstrap:** Requires `lobster/lib/load-dotenv`, then starts the continuous polling loop.

### Lobster Pipeline

- **Entry Point:** `lobster/lib/tasks/index.js` (via `package.json` main)
- **Bootstrap:** Workflows are executed via the `lobster` CLI or by running individual `node -e` commands defined in `.lobster` files.

## File Organization Patterns

- **No external dependencies**: Every file is either pure JavaScript or JSON/YAML.
- **State via Labels**: No local database; project state is stored in GitHub Issue labels.
- **Explicit Context**: Data between steps flows via stdin/stdout and JSON.

## Key File Types

### Lobster Workflow

- **Pattern:** `*.lobster`
- **Purpose:** YAML-based definition of atomic steps and their execution sequence.
- **Examples:** `issue-review.lobster`, `decompose-issue.lobster`.

### Pipeline Step

- **Pattern:** `*.js` in `lobster/lib/tasks/steps/`
- **Purpose:** Specialized Node.js modules for interacting with GitHub, LLM, or the filesystem.
- **Examples:** `llm-task.js`, `update-issue-labels.js`.

## Configuration Files

- **`package.json`**: Root project manifest (zero dependencies).
- **`.env.example`**: Template for environment variables (`GITHUB_TOKEN`, `GATEWAY_TOKEN`).
- **`config/projects.json`**: Registry of repositories and their local aliases.

## Notes for Development

- **Testing**: Run `npm test`. All HTTP calls are mocked in `test/helpers/mock-http.js`.
- **Minimalism**: Maintain the zero-dependency rule. Use standard Node.js APIs only.
- **Self-Contained**: Each Lobster run should be idempotent and stateless.

---

_Generated using BMAD Method `document-project` workflow_
