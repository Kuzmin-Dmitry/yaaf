---
title: 'Initialize OpenClaw AI Factory Repository Structure'
type: 'feature'
created: '2026-03-16'
status: 'done'
baseline_commit: '0e75f88'
context: []
---

# Initialize OpenClaw AI Factory Repository Structure

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The yaaf repository has no project structure beyond a stub README. The OpenClaw AI Factory requires a complete scaffold — role definitions, workflow templates, pipeline status tracking, and agent constitution — before any autonomous development work can begin.

**Approach:** Create the canonical directory layout (`agents/`, `skills/`, `workflows/`, `symphony/`, `scripts/`, `instructions/`) and populate six key files: README.md (vision/stack/quickstart/monitoring), agents/ROLES.md (5 agent roles), workflows/feature-lifecycle.lobster (YAML lifecycle template), PIPELINE_STATUS.md (live status template), and instructions/SYSTEM_PROMPT.md (agent constitution with checkpoint/test/escalation rules).

## Boundaries & Constraints

**Always:** Write all file content in English. Use Markdown for documentation files. Use YAML for the workflow template. Keep directory structure flat at root level.

**Ask First:** Any deviation from the 5-role model described in the original spec.

**Never:** Delete or modify existing `_bmad/` infrastructure. Do not create runtime code or scripts with executable logic. Do not invent tool names beyond Caclawphony, Lobster, and ACPX.

</frozen-after-approval>

## Code Map

- `README.md` -- Project entry point, overwrite with full OpenClaw vision/stack/quickstart/monitoring
- `agents/ROLES.md` -- Agent role definitions and protocols (PO, Architect, Coder, QA, Tech Writer)
- `workflows/feature-lifecycle.lobster` -- YAML workflow template for feature lifecycle stages
- `PIPELINE_STATUS.md` -- Real-time pipeline status template for agent updates
- `instructions/SYSTEM_PROMPT.md` -- Agent constitution: checkpoints, test rules, escalation protocol
- `agents/` -- Empty directory for agent definitions
- `skills/` -- Empty directory for skill definitions
- `workflows/` -- Directory for workflow files
- `symphony/` -- Empty directory for Caclawphony session configs
- `scripts/` -- Empty directory for automation scripts
- `instructions/` -- Directory for agent instructions

## Tasks & Acceptance

**Execution:**
- [ ] `README.md` -- Overwrite with complete project documentation containing Vision, Stack (Caclawphony + Lobster), Quick Start, and Monitoring sections
- [ ] `agents/ROLES.md` -- Create file defining 5 roles: Product Owner, System Architect, Implementation Lobster (Coder), QA & Validator, Technical Writer with protocols
- [ ] `workflows/feature-lifecycle.lobster` -- Create YAML workflow template with 5 stages: init-spec, plan-tasks, loop-coding, verify-build, update-docs
- [ ] `PIPELINE_STATUS.md` -- Create status template with Current Phase, Active Agent, Progress (X/Y), Last Logs fields
- [ ] `instructions/SYSTEM_PROMPT.md` -- Create agent constitution with checkpoint, test, and communication/escalation rules
- [ ] Create empty directories: `skills/`, `symphony/`, `scripts/` (via .gitkeep files)

**Acceptance Criteria:**
- Given the repository root, when listing directories, then `agents/`, `skills/`, `workflows/`, `symphony/`, `scripts/`, `instructions/`, `docs/` all exist
- Given `README.md`, when reading it, then it contains Vision, Stack, Quick Start, and Monitoring sections
- Given `agents/ROLES.md`, when reading it, then it describes exactly 5 roles with protocols
- Given `workflows/feature-lifecycle.lobster`, when reading it, then it contains 5 sequential stages in valid YAML
- Given `PIPELINE_STATUS.md`, when reading it, then it contains Current Phase, Active Agent, Progress, Last Logs fields
- Given `instructions/SYSTEM_PROMPT.md`, when reading it, then it contains checkpoint, test, and escalation rules

## Verification

**Manual checks:**
- All 7 directories exist at project root: agents/, skills/, workflows/, symphony/, scripts/, instructions/, docs/
- All 5 content files are present and non-empty
- README.md has 4 required sections
- feature-lifecycle.lobster parses as valid YAML
