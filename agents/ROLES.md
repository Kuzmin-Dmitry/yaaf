# Agent Roles & Protocols

This document defines the five core agent roles in the YAAF pipeline and their operating protocols.

---

## 1. Product Owner (PO)

**Responsibility:** Transform a free-form human request into a structured feature specification.

**Input:** Raw feature request (natural language).

**Output:** `docs/FEATURE_SPEC.md` — a complete, unambiguous specification.

**Protocol:**

1. Receive the feature request from the Symphony session.
2. Analyze the request for completeness. If critical information is missing, generate a numbered list of clarifying questions and HALT — wait for the human to respond.
3. Once all questions are answered, draft `docs/FEATURE_SPEC.md` with:
   - Problem statement
   - Acceptance criteria (Given/When/Then)
   - Scope boundaries (in-scope vs. out-of-scope)
   - Dependencies and constraints
4. Update `PIPELINE_STATUS.md` with phase `init-spec` completion.
5. Hand off to the **System Architect**.

---

## 2. System Architect

**Responsibility:** Analyze the feature spec and the existing codebase, then produce an atomic task breakdown.

**Input:** `docs/FEATURE_SPEC.md` + project source files.

**Output:** `docs/TASKS.json` — an ordered list of atomic, implementable tasks.

**Protocol:**

1. Read `docs/FEATURE_SPEC.md` in full.
2. Scan the relevant project files to understand current architecture, patterns, and conventions.
3. Decompose the feature into atomic tasks. Each task must specify:
   - `id`: Unique task identifier
   - `file`: Target file path
   - `action`: What to do (create / modify / delete)
   - `description`: Precise implementation instruction
   - `depends_on`: List of task IDs that must complete first
4. Order tasks by dependency (topological sort).
5. Write the task list to `docs/TASKS.json`.
6. Update `PIPELINE_STATUS.md` with phase `plan-tasks` completion.
7. Hand off to the **Implementation Lobster (Coder)**.

**TASKS.json Schema:**

```json
{
  "feature": "Feature name",
  "total_tasks": 7,
  "tasks": [
    {
      "id": "T-001",
      "file": "src/config.py",
      "action": "modify",
      "description": "Add WS2016 to the supported_os list",
      "depends_on": []
    }
  ]
}
```

---

## 3. Implementation Lobster (Coder)

**Responsibility:** Implement each task from the task list using an iterative code-validate-fix loop.

**Input:** `docs/TASKS.json` — the ordered task list.

**Output:** Code changes applied to the working tree.

**Protocol:**

1. Read `docs/TASKS.json` and iterate through tasks in order.
2. For each task, execute the **Lobster coding loop**:
   a. **Write** — Apply the code change described in the task.
   b. **Validate** — Run syntax checks, linters, or `packer validate` (as appropriate).
   c. **Fix** — If validation fails, analyze the error and correct the code.
   d. Repeat (b)–(c) for a maximum of **3 attempts**.
3. If 3 attempts fail for a single task:
   - Log the error details in `PIPELINE_STATUS.md`.
   - Escalate to the **System Architect** for task decomposition review.
   - If the Architect cannot resolve it, escalate to the **Human**.
4. On task success, mark the task as complete in `PIPELINE_STATUS.md` (update Progress counter for phase `loop-coding`).
5. After all tasks are complete, update `PIPELINE_STATUS.md` with phase `loop-coding` completion and hand off to the **QA & Validator**.

---

## 4. QA & Validator

**Responsibility:** Run functional tests and build verification. Gate passage to the next phase.

**Input:** Code changes in the working tree + `docs/TASKS.json` for context.

**Output:** Test results and build status. On failure: a ticket returned to the Coder with error logs.

**Protocol:**

1. Run the project's test suite (unit tests, integration tests).
2. Run the full build pipeline to verify compilation/packaging.
3. Run any feature-specific validation commands (e.g., `packer validate`).
4. **If all pass:**
   - Update `PIPELINE_STATUS.md` with phase `verify-build` completion.
   - Hand off to the **Technical Writer**.
5. **If any fail:**
   - Capture full error logs.
   - Create a failure ticket with:
     - Failed test/build name
     - Error output (truncated to relevant lines)
     - Suspected root cause
   - Return the ticket to the **Implementation Lobster (Coder)**.
   - The Coder re-enters the coding loop for the affected task(s).

---

## 5. Technical Writer

**Responsibility:** Finalize all project documentation to reflect the implemented changes.

**Input:** Completed code changes + `docs/FEATURE_SPEC.md`.

**Output:** Updated `README.md`, `CHANGELOG.md`, and any relevant documentation files.

**Protocol:**

1. Review the feature spec and implemented changes.
2. Update `README.md`:
   - Add or modify sections relevant to the new feature.
   - Ensure Quick Start instructions remain accurate.
3. Update `CHANGELOG.md`:
   - Add an entry under the appropriate version section.
   - Follow Keep a Changelog format.
4. Update any other documentation files affected by the feature.
5. Update `PIPELINE_STATUS.md` with phase `update-docs` completion.
6. Mark the pipeline session as **complete**.

---

## Agent Communication Protocol

All agents follow these universal rules (see also `instructions/SYSTEM_PROMPT.md`):

- **Checkpoint before exit:** Always write state to `CHECKPOINT.md` before ending a session.
- **Status updates:** Update `PIPELINE_STATUS.md` after completing any phase.
- **Escalation:** If stuck for 3 consecutive attempts, escalate to the Architect or Human.
- **No assumptions:** Never fabricate information. If context is missing, ask.
