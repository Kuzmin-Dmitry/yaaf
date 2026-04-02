# YAAF Documentation

Project documentation for YAAF as it exists in this repository today.

## Start Here

| If you want to... | Read |
|---|---|
| Understand what the project does | [Overview / Product](overview/product.md) |
| Navigate the repository quickly | [Overview / Repository Map](overview/repository-map.md) |
| See the system shape and boundaries | [Architecture / System Overview](architecture/system-overview.md) |
| Understand runtime modules in depth | [Architecture / Runtime Components](architecture/runtime-components.md) |
| Follow the main user flow | [Workflows / Create Task](workflows/create-task.md) |
| Approve and advance issues | [Workflows / Approve Task](workflows/approve-task.md) |
| Architecturally review a task | [Workflows / Review Task](workflows/review-task.md) |
| Understand direct GitHub publishing | [Workflows / Publish Task](workflows/publish-task.md) |
| See the project status workflow | [Workflows / Project Status](workflows/project-status.md) |
| See GitHub and Symphony integration details | [Integrations / GitHub](integrations/github.md), [Integrations / Symphony](integrations/symphony.md) |
| Understand observability modules | [Integrations / Telemetry and Usage](integrations/telemetry-and-usage.md) |
| Check contracts, config, and tests | [Reference / Contracts](reference/contracts.md), [Reference / Configuration](reference/configuration.md), [Reference / Testing](reference/testing.md) |

## Documentation Map

### Overview

| Document | Purpose |
|---|---|
| [Product](overview/product.md) | What YAAF is, what it does now, and what is still partial or planned |
| [Repository Map](overview/repository-map.md) | Top-level file layout and where each subsystem lives |

### Architecture

| Document | Purpose |
|---|---|
| [System Overview](architecture/system-overview.md) | System boundary, external dependencies, design principles, high-level data flow |
| [Runtime Components](architecture/runtime-components.md) | Detailed breakdown of `tasks`, `github`, `telemetry`, and `usage` modules |

### Workflows

| Document | Purpose |
|---|---|
| [Create Task](workflows/create-task.md) | Conversational task creation from Telegram message to GitHub issue |
| [Approve Task](workflows/approve-task.md) | Approval pipeline: Draft→Backlog→Ready transitions via GitHub labels |
| [Review Task](workflows/review-task.md) | Architectural review pipeline: fetch → analyze → rewrite → approve → update |
| [Publish Task](workflows/publish-task.md) | Direct GitHub issue publishing with validation, formatting, and optional project wiring |
| [Project Status](workflows/project-status.md) | Read-only workflow for project status requests backed by all open GitHub issues and multi-project aliases |

### Integrations

| Document | Purpose |
|---|---|
| [GitHub](integrations/github.md) | REST/GraphQL client, tracker adapter, auth resolution, project support |
| [Symphony](integrations/symphony.md) | GitHub adapter for Symphony, label-based states, current implementation status |
| [Telemetry and Usage](integrations/telemetry-and-usage.md) | Session telemetry, usage normalization, in-memory aggregation, env toggles |

### Reference

| Document | Purpose |
|---|---|
| [Contracts](reference/contracts.md) | Public module contracts, typed results, dependency interfaces |
| [Configuration](reference/configuration.md) | Environment variables, auth lookup, GitHub tracker config, key formats |
| [Testing](reference/testing.md) | Test suite map, coverage areas, command entry points, current gaps |

### Decisions

| ADR | Scope |
|---|---|
| [ADR-002 Monitoring Tool Selection](decisions/ADR-002-monitoring-tool-selection.md) | Usage metrics source, in-memory aggregation, zero-persistence design |
| [ADR-003 Create Task Pipeline](decisions/ADR-003-create-task-pipeline.md) | Typed results, partial state merge, exact-match dedup, step decomposition |

## Runtime Files Referenced Most Often

| File | Why it matters |
|---|---|
| [lobster/lib/tasks/index.js](../lobster/lib/tasks/index.js) | Main export surface for task-related runtime APIs |
| [lobster/lib/github/index.js](../lobster/lib/github/index.js) | Main export surface for GitHub and Symphony adapters |
| [lobster/lib/telemetry/index.js](../lobster/lib/telemetry/index.js) | Session telemetry entry points |
| [lobster/lib/usage/index.js](../lobster/lib/usage/index.js) | Usage aggregation entry points |
