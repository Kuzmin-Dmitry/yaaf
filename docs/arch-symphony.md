# YAAF — Yet Another AI Factory - Symphony Architecture

**Date:** 2026-04-06

## Executive Summary

Symphony is the continuous polling orchestrator of the YAAF platform. It acts as the "When" layer of the system, monitoring a set of registered GitHub repositories for tasks that are ready for processing. It matches the state of an issue (determined by its labels) to the appropriate Lobster workflow and dispatches it for execution. Symphony's primary goals are reliability, resilience, and 24/7 autonomous operation.

## Technology Stack

| Category | Technology | Version | Justification |
|---|---|---|---|
| Runtime | Node.js | LTS | Standard stable environment |
| Networking | `https` (native) | Built-in | Minimalist, zero-dependency approach |
| Auth | GitHub PAT | N/A | Secure repository access |

## Architecture Pattern

Symphony follows a **Poll-and-Dispatch** pattern. It operates as a daemon with a continuous event loop that sequentially processes each registered project. It is designed to be stateless and resilient, with any failure resulting in a simple retry in the next cycle.

## Data Architecture

Symphony does not maintain a local database. Instead, it treats the **GitHub Issues API** as its primary persistent state store.

- **State Discovery**: Determined by filtering GitHub issues for specific labels (`draft`, `reviewed_by_pm`, etc.).
- **In-flight Set**: Symphony maintains a transient, in-memory `Set` to track issues currently being processed by Lobster to prevent duplicate dispatching.

## API Design

Symphony interacts with the **GitHub REST API v3**. It uses a custom issues-polling module (`symphony/tracker.js`) that handles pagination and label-to-state resolution.

### GitHub API Interaction

- **Request**: `GET /repos/{owner}/{repo}/issues?state=open&per_page=100`
- **Resolution Logic**: Maps label arrays to a single canonical state (`draft`, `reviewed`, `approved`, etc.).

## Component Overview

### 1. `Orchestrator` (`symphony/index.js`)
The main entry point. Orchestrates the polling cycle across all projects registered in `config/projects.json`.

### 2. `Tracker` (`symphony/tracker.js`)
Handles the low-level communication with GitHub, including fetching issues and parsing state labels.

### 3. `Dispatcher` (`symphony/dispatcher.js`)
Contains the logic for mapping an issue's current state to a specific Lobster workflow path.

## Source Tree

```
symphony/
├── dispatcher.js      # State-to-workflow mapping logic
├── index.js           # Main daemon entry point and polling loop
└── tracker.js         # GitHub API interaction and state resolution
```

## Development Workflow

- **Run Daemon**: `node symphony/index.js`
- **Config**: Edit `config/projects.json` and `.env`.
- **Debugging**: Observe stdout for "[symphony]" logs indicating polling and dispatching events.

## Deployment Architecture

Symphony is designed to run as a long-lived process on a server or in a container. It requires constant network access to `api.github.com`.

## Testing Strategy

All Symphony logic is tested in `test/symphony/` using mocked HTTP responses.
- `tracker.test.js`: Validates GitHub API polling and label parsing.
- `dispatcher.test.js`: Ensures correct state-to-workflow mapping.
- `run.test.js`: Tests the overall polling loop and retry logic.

---

_Generated using BMAD Method `document-project` workflow_
