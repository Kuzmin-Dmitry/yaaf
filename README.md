# YAAF — Yet Another AI Factory

> Human gives the idea. Agents deliver the Release.

---

## What is YAAF

**YAAF is an autonomous software delivery conveyor.**
You describe what needs to be done — “Fix the login bug”, “Add WS2025 support to Packer templates” — and the system carries it from request to release.

That includes specification, architectural reasoning, implementation, testing, documentation, and publishing.

No manual pipeline stitching. No agent choreography. No “who owns this step?” meetings.

You get a shipped result: code merged, tests passing, docs updated, release published.

---

## Who it’s for

**YAAF is for people who care about outcomes more than implementation mechanics.**

You submit tasks, track them via GitHub Issues, and step in only when the system genuinely needs input — clarification or approval.

You don’t:

* wire agents together
* design pipelines
* babysit execution

You do:

* state intent
* answer questions when ambiguity matters
* decide when work is allowed to start

If you want to control every line of code, this will feel wrong.
If you want the system to carry work end-to-end, it will feel obvious.

---

## How it works

YAAF is not a single model loop. It’s a coordinated system of three layers:

**OpenClaw**
Agent runtime. Handles routing, sessions, tool access, and inter-agent communication.

**Lobster**
Pipeline definition. Typed JSON workflows with explicit steps, approval gates, and LLM invocations.

**Symphony**
Execution orchestrator. Continuously polls GitHub Issues, dispatches runs, manages retries, and keeps the system moving 24/7.

Together, they turn a static request into a progressing execution.

---

## Core capabilities

* **Zero-intervention delivery**
  Once a task is accepted, it can proceed to release without further human involvement.

* **Natural-language input**
  The interface is plain text. The system translates it into structured execution.

* **Architectural review**
  Tasks are analyzed against the codebase, risks are surfaced, and the request is rewritten into an implementation-ready spec.

* **Multi-turn clarification**
  If the task is underspecified, the system asks. Answers are fed back into the pipeline, not lost in chat history.

* **Duplicate detection**
  Similar tasks are caught before they become parallel workstreams.

* **Two-step approval**
  Draft → Backlog → Ready. You control when execution is allowed to start.

* **GitHub-native tracking**
  State is encoded in labels. No separate UI required.

* **Operational visibility**
  Aggregated state, stale task detection, and reporting (including Telegram) give you a system-level view.

* **Adversarial quality gates**
  A dedicated QA agent validates outputs before the pipeline advances. “Looks fine” is not a passing state.

* **Stateless pipelines**
  Each run is self-contained. Context travels explicitly via `partial_state`, not implicit memory.

---

## The core idea

YAAF treats software delivery as a system, not a sequence of coordinated manual steps.

You don’t move tasks through stages.
The system moves tasks for you.

You don’t manage the pipeline.
You define intent and constraints.

Everything else is execution.

---

Если присмотреться, тут есть лёгкий сдвиг:
это уже не “инструмент для разработки”, а **интерфейс к доставке софта как процессу**.
И именно это лучше всего считывается, когда текст не пытается быть “продающим”, а просто спокойно фиксирует, как устроена реальность.


## Prerequisites

Before using YAAF, ensure you have:

- **Node.js** (current LTS) — runtime for all pipelines
- **GitHub Personal Access Token** with `repo` scope — for issue tracking and publishing
- **OpenClaw CLI** (optional) — only needed for the architectural review pipeline's Librarian agent

## Get started

### 1. Clone and install

```bash
git clone https://github.com/Kuzmin-Dmitry/yaaf.git
cd yaaf
```

No `npm install` needed — zero external dependencies.

### 2. Configure

Set your GitHub token:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

See [docs/setup.md](docs/setup.md) for full configuration options, dry-run mode, and Lobster CLI usage.

## Documentation

| Document | What you learn |
|----------|---------------|
| [Overview](docs/overview.md) | How the conveyor works, what each component does, when the system asks for your input |
| [Task Lifecycle](docs/task-lifecycle.md) | Task states (Draft → Backlog → Ready → Done), result types, GitHub label mapping |
| [Workflows](docs/workflows.md) | Each pipeline step-by-step — create issue, approve, review, project status |
| [Setup](docs/setup.md) | Environment variables, tracker configuration, programmatic and CLI usage |
| [Troubleshooting](docs/troubleshooting.md) | Error messages, API failures, timeouts, retry behavior |

**Recommended reading order:** Overview → Task Lifecycle → Setup

## Project structure

```
yaaf/
├── lobster/
│   ├── lib/
│   │   ├── tasks/      # Pipelines: approve, review, publish, project status
│   │   ├── github/     # GitHub API client, tracker adapters, Symphony integration
│   │   ├── openclaw/   # OpenClaw agent runner
│   │   └── usage/      # Usage metrics aggregator
│   └── workflows/      # Lobster pipeline definitions (.lobster)
├── docs/                # User-facing documentation
├── test/                # Test suites (all mocked, zero dependencies)
└── README.md
```

## License

[MIT](LICENSE)
