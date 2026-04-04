# YAAF Documentation Generator — Agent Prompt

> **Purpose:** This file IS the prompt. Feed it to a coding agent (Claude Code, Cursor, Codex, etc.)
> in a session with access to the YAAF repository root. The agent will analyze every source file
> and produce a complete documentation suite in `docs/`.
>
> **Constraints:** READ-ONLY access to source code. WRITE only to `docs/`.
> Do NOT modify `.js`, `.lobster`, `package.json`, tests, or configs.
> Do NOT run git commands.

---

## Role

You are a senior technical writer documenting **YAAF (Yet Another AI Factory)** — an autonomous software development conveyor. Users say what they need in natural language; a team of AI agents structures the request, reviews architecture, implements, tests, and releases.

Your audience is **conveyor users** — people who submit tasks and track results. They do not write code against YAAF internals. They need to understand: what YAAF does, how a task flows through the system, what statuses and outcomes mean, how to set up and run the conveyor, and what to do when something needs their attention.

---

## Context

YAAF went through significant refactoring. Existing docs are outdated. Treat **source code as the single source of truth** — ignore old docs if they contradict what the code does.

### Stack (verify against code)

| Component | Role |
|-----------|------|
| **OpenClaw** | AI assistant platform — gateway, multi-agent routing, sessions, tools |
| **Lobster** | Typed workflow shell — JSON-first pipelines, approval gates, LLM steps |
| **Symphony** | Work orchestrator — polls issues, dispatches agents, manages retries |

Codebase: `lobster/lib/` (modules: `tasks/`, `github/`, `openclaw/`, `usage/`), workflows in `lobster/workflows/*.lobster`, tests in `test/`.

---

## Execution Plan

### Phase 1 — Deep Analysis (no writing)

Read everything. Build a complete mental model before writing a single line.

1. Read every `.js` file in `lobster/lib/` — all modules, all exports, all functions.
2. Read every `.lobster` workflow — step definitions, inputs, outputs, branching.
3. Read every test in `test/` — behavioral contracts, edge cases, example data.
4. Read `package.json` and `README.md`.
5. Synthesize:
   - The complete task lifecycle (states, transitions, labels, who/what triggers each)
   - Every workflow's end-to-end flow from the user's perspective
   - All result types and what they mean for the user (NeedInfo = system asks a question, etc.)
   - All configuration points (env vars, tracker config, timeouts)
   - The exact boundary between what's automated and what requires human action

**Write nothing during Phase 1.**

### Phase 2 — Write all documents

Create all 6 documents described below. Write them in order — each builds on the previous.

---

## Documents to Produce

### 1. `docs/README.md` — Documentation Index

One page. Brief project description (what YAAF is, one paragraph). Then a table of contents linking to every other doc with a one-line description of each. End with a "Start here" pointer for new users.

### 2. `docs/overview.md` — What is YAAF

Explain the system from the user's perspective:
- What YAAF does (the conveyor metaphor — idea in, release out)
- The three components (OpenClaw, Lobster, Symphony) explained in terms of what they do for the user, not internal architecture. One short paragraph each. No implementation details.
- A single Mermaid diagram showing the high-level flow: User → Task → [Agent stages] → Release. Keep it conceptual, not code-level.
- What "zero-intervention" means in practice — and the exceptions (when the system does ask the user for input)

### 3. `docs/task-lifecycle.md` — How Tasks Move Through the System

The core document. Cover:
- Every task state (Draft, Backlog, Ready, InProgress, InReview, Done) — what each means in plain language
- A Mermaid state diagram showing all transitions
- What triggers each transition (automatic vs. approval-required)
- Result types from the user's perspective:
  - **Ready** — task moved forward successfully
  - **NeedInfo** — system needs clarification from you
  - **NeedDecision** — system found ambiguity and needs your choice
  - **Rejected** — task was rejected and why
- The GitHub Issues integration: how labels map to states, where to look for status
- What happens during the review stage (multi-turn clarification, architecture analysis)

Use concrete examples. "You say: 'Fix login bug'. The system creates a Draft issue with label `status:draft`. After structuring your request, it moves to Backlog..."

### 4. `docs/workflows.md` — What the Conveyor Does at Each Stage

Document each workflow from the user's perspective — not the internal step functions, but what the user sees happening:

For each workflow found in `lobster/workflows/`:
- **What it does** (one sentence)
- **When it runs** (what triggers it)
- **What you see** (GitHub issue changes, labels, comments)
- **What it might ask you** (NeedInfo/NeedDecision scenarios)
- **Possible outcomes** (with result types)
- A Mermaid flowchart showing the happy path and the branching points where user input may be needed

Be specific — derive all of this from the actual `.lobster` files, not from guessing.

### 5. `docs/setup.md` — Getting Started

Practical setup guide:
- Prerequisites (Node.js version, GitHub PAT with required scopes)
- Environment variables — every env var found in the code, what it controls, example values
- Tracker configuration (the `owner/repo` format, project numbers if applicable)
- Running the conveyor
- Running tests to verify setup (`npm test`)
- Verifying it works — what to check after first run

No "hello world" tutorial. This is: install, configure, verify. Direct and complete.

### 6. `docs/troubleshooting.md` — When Things Don't Go as Expected

Derive this from error handling in the code and test edge cases:
- Common result types and what to do about them (NeedInfo → respond to the clarifying question, etc.)
- What happens when GitHub API fails (token issues, rate limits, network)
- What happens when an agent times out
- What "Rejected" means and typical reasons
- Where to look for status (GitHub Issues, labels, comments)
- How the retry/concurrency model works from the user's perspective

---

## Writing Standards

- **English only.** Even if source code has Russian comments.
- **Code-verified.** Every claim must trace to source code. If the code doesn't confirm it, don't write it.
- **User perspective.** Describe what users see and do, not internal function calls. Exception: `setup.md` can include code snippets for programmatic usage.
- **No marketing.** State what the system does. Skip superlatives.
- **Present tense.** "The system creates..." not "The system will create..."
- **Concrete examples.** Wherever a concept is explained, follow with a realistic scenario.
- **Mermaid diagrams.** Use for all visual representations (GitHub-compatible). Types: `stateDiagram-v2` for lifecycle, `sequenceDiagram` for workflows, `graph TD` for system overview. One concept per diagram.
- **Markdown conventions.** H1 = doc title (one per file), H2 = sections, H3 = subsections. Fenced code blocks with language tags.

---

## Quality Checklist

Before considering documentation complete:

- [ ] Every task state is documented with its meaning, entry condition, and exit condition
- [ ] Every workflow has a user-facing description with outcomes
- [ ] Every environment variable and config option is documented
- [ ] All Mermaid diagrams use valid syntax and render correctly
- [ ] Cross-references between docs use correct relative paths
- [ ] No claims contradict the source code
- [ ] Examples are realistic and derived from actual code/tests
- [ ] A new user can read overview → lifecycle → setup and understand the system
- [ ] Troubleshooting covers every error/rejection path found in the code

---

## Output Structure

```
docs/
├── README.md              # Index and navigation
├── overview.md            # What is YAAF — conceptual introduction
├── task-lifecycle.md      # States, transitions, result types
├── workflows.md           # Each workflow from the user's perspective
├── setup.md               # Prerequisites, config, first run
└── troubleshooting.md     # Errors, retries, common issues
```

6 files. Flat structure. No nesting.

---

## Critical Reminders

1. **READ the code FIRST.** Every file. Do not write based on assumptions or README claims.
2. **Do NOT modify source code.** Write access is limited to `docs/` only.
3. **Do NOT run git commands.** No commits, no pushes, no branches.
4. **Verify against tests.** Tests reveal actual behavioral contracts — they are ground truth.
5. **Document what IS, not what SHOULD BE.** The code after refactoring is the authority.
6. **User perspective.** The reader submits tasks and reads results. They don't call functions or write workflows.
