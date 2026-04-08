# YAAF — Yet Another AI Factory - Documentation Index

Welcome to the documentation for YAAF, an autonomous software delivery conveyor.

## Project Overview

- **Type:** Multi-part (Backend)
- **Primary Language:** JavaScript (Node.js)
- **Architecture:** Orchestration + Pipeline (Symphony + Lobster)

## Generated Documentation

- [Overview](./overview.md) - Executive summary and tech stack.
- [Setup](./setup.md) - Setup, testing, and contribution.
- [Workflow Diagram](./workflow.md) - Detailed step-by-step process.
- [Source Tree Analysis](./source-tree-analysis.md) - Directory structure and file roles.

### Deep Dive: Architecture

- [Symphony Architecture](./arch-symphony.md) - Detailed orchestrator design.
- [Lobster Architecture](./arch-lobster.md) - Detailed pipeline design.
- [Integration Architecture](./arch-integration.md) - How components work together.

### Diagrams (C4-like Model)

- [C0 Architecture Diagram](./arch-c0.md) - High-level system context.
- [C1 Architecture Diagram](./arch-c1.md) - Container-level overview.
- [C2 Architecture Diagram](./arch-c2.md) - Component-level breakdown.

## Existing Documentation

- [README.md](../README.md) - High-level project entry point.
- [CHANGELOG.md](../CHANGELOG.md) - History of changes.
- [AGENTS.md](../AGENTS.md) - Detailed agent runtime and configuration.
- [SKILL.md](../SKILL.md) - BMAD skill specifications.

## Getting Started

To get the system running locally, please refer to the [Setup Guide](./setup.md). The basic flow is:
1. Configure `.env`.
2. Register projects in `config/projects.json`.
3. Start the orchestrator with `npm run symphony`.
