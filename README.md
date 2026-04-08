# YAAF — Yet Another AI Factory

> Human gives the idea. Agents deliver the Release.
> **License:** [MIT](LICENSE)

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

## Prerequisites

- **Node.js** (LTS) — runtime for all pipelines
- **GitHub Personal Access Token** with `repo` scope
- **OpenClaw** (optional) — for Jarvis agent and LLM gateway

## Get started

```bash
git clone https://github.com/Kuzmin-Dmitry/yaaf.git
cd yaaf
cp .env.example .env   # fill in GITHUB_TOKEN, GATEWAY_TOKEN
```

No `npm install` needed — zero external dependencies.

See [docs/setup.md](docs/setup.md) for full configuration.

## Documentation

| Document | What you learn |
|----------|---------------|
| [Overview](docs/overview.md) | Three layers (Symphony, Lobster, OpenClaw), when the system asks for input |
| [Task Lifecycle](docs/workflow.md) | States, labels, transitions (draft → reviewed → approved → decomposed) |
| [Workflows](docs/workflow.md) | Each pipeline step-by-step with step-functions reference |
| [Setup](docs/setup.md) | Environment variables, project registry, CLI usage |
| [Architecture](docs/index.md) | Detailed C0-C2 diagrams and component interaction |

**Recommended reading order:** Overview → Task Lifecycle → Setup

## Project structure

```
yaaf/
├── lobster/
│   ├── lib/tasks/steps/   # Step-functions (LLM, GitHub API, docs)
│   └── workflows/         # .lobster pipeline definitions
├── symphony/              # Orchestration daemon (polls issues, dispatches workflows)
├── config/                # projects.json — project registry
├── docs/
│   ├── arch-*.md          # Architecture diagrams (C0-C2)
│   └── workflow-*.md      # Workflow documentation
├── test/                  # All mocked, zero external dependencies
└── .env.example           # Environment template
```

## License

[MIT](LICENSE)
