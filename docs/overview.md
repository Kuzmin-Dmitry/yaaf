# YAAF — Yet Another AI Factory - Project Overview

**Date:** 2026-04-06
**Type:** Multi-part (Backend)
**Architecture:** Orchestration + Pipeline

## Executive Summary

YAAF is an autonomous software delivery conveyor that automates the entire lifecycle of software development—from initial idea to final release. It coordinates multiple specialized AI agents to handle specifications, architectural reasoning, implementation, testing, documentation, and publishing. The system is designed for zero-intervention delivery, allowing human users to provide high-level intent while the system manages the complex pipeline mechanics.

## Project Classification

- **Repository Type:** Multi-part / Monorepo-like
- **Project Type(s):** Backend (Service/Orchestrator)
- **Primary Language(s):** JavaScript (Node.js)
- **Architecture Pattern:** Orchestration + deterministic JSON pipelines

## Multi-Part Structure

This project consists of 2 distinct parts:

### Symphony Orchestrator

- **Type:** Backend (Service)
- **Location:** `symphony/`
- **Purpose:** Continuous execution orchestrator that polls GitHub Issues for tasks and dispatches appropriate workflows.
- **Tech Stack:** Node.js (Standard Library), no external dependencies.

### Lobster Pipeline

- **Type:** Backend (Service)
- **Location:** `lobster/`
- **Purpose:** Deterministic pipeline engine that executes sequential, typed workflows defined in `.lobster` files.
- **Tech Stack:** Node.js (Standard Library), custom dotenv and retry logic.

### How Parts Integrate

Symphony acts as the "When" layer, monitoring GitHub for state changes via labels. When a task is ready for a specific phase (e.g., `draft` or `approved_after_pm`), Symphony dispatches a Lobster run. Lobster acts as the "How" layer, executing the actual steps (LLM calls, GitHub mutations, etc.) defined in its workflows. Data flows between them via GitHub Issues (which acts as the persistent state store) and command-line arguments.

## Technology Stack Summary

### Symphony Stack

| Category | Technology | Version | Justification |
|---|---|---|---|
| Runtime | Node.js | LTS | Standard stable environment |
| Networking | `https` (native) | Built-in | Minimalist, no-dependency approach |
| Auth | GitHub PAT | N/A | Secure repository access |

### Lobster Stack

| Category | Technology | Version | Justification |
|---|---|---|---|
| Runtime | Node.js | LTS | Standard stable environment |
| Workflow | YAML (.lobster) | Custom | Deterministic, typed definitions |
| LLM Gateway | OpenClaw | Custom | Unified agent/LLM access point |
| Retry Logic | Custom | Built-in | Intelligent error recovery without external libs |

## Key Features

- **Zero-intervention delivery**: End-to-end automation from task to release.
- **Deterministic Pipelines**: Typed JSON workflows with explicit approval gates.
- **Stateful tracking via Labels**: Uses GitHub native features for task lifecycle management.
- **Stateless LLM interaction**: Efficient, self-contained AI invocations.
- **Zero Dependencies**: Robust, easy-to-deploy codebase using only standard libraries.

## Architecture Highlights

- **Stateless Execution**: Each Lobster run is self-contained; context travels via explicit state.
- **Adversarial QA**: Dedicated agents validate outputs before advancing.
- **Polled Orchestration**: Resilient, 24/7 monitoring of the task backlog.

## Development Overview

### Prerequisites

- Node.js (LTS)
- GitHub Personal Access Token (with `repo` scope)
- OpenClaw (optional, for local agent/LLM gateway)

### Getting Started

1. Clone the repository.
2. Create a `.env` file from `.env.example`.
3. Fill in `GITHUB_TOKEN` and `GATEWAY_TOKEN`.
4. Register your target projects in `config/projects.json`.
5. Run `npm run symphony` to start the orchestrator.

### Key Commands

#### Symphony

- **Dev/Run:** `npm run symphony` or `node symphony/index.js`

#### Lobster

- **Run Workflow:** `node lobster/index.js run <workflow-path> --args-json '...'`

#### Project

- **Test:** `npm test` (Zero external dependencies, all mocked)

## Repository Structure

The repository is organized into clearly separated modules despite being a single NPM package. Core logic resides in `lobster/` (workflows and steps) and `symphony/` (polling and dispatching). Shared configuration is handled via `config/`, while tests are centralized in `test/`.

## Documentation Map

For detailed information, see:

- [index.md](./index.md) - Master documentation index
- [source-tree-analysis.md](./source-tree-analysis.md) - Directory structure
- [architecture.md](./architecture.md) - Detailed architecture (multi-part)
- [development-guide.md](./development-guide.md) - Development workflow

---

_Generated using BMAD Method `document-project` workflow_
