# Project Status Pipeline
# Runtime: Lobster
# Description: Resolve alias → fetch open issues → aggregate → format brief.
# Fully deterministic, no LLM. Returns Ready | NeedInfo.

name: project-status
version: "1.0"
description: >
  Resolves a project alias, fetches all open GitHub issues,
  counts by status label, and returns a PM-ready brief.

input:
  request: string            # raw user message
  project_alias: string      # resolved by PM routing (may be null)

output:
  type: enum                 # Ready | NeedInfo
  payload: object

steps:
  - id: resolve-alias
    name: Resolve Project Alias
    description: Lookup alias in static config. NeedInfo if unknown.
    early_exit:
      condition: "!project"
      returns: NeedInfo

  - id: fetch-open-issues
    name: Fetch All Open Issues
    description: Paginate GitHub REST /issues, filter out PRs.
    on_failure: system-error

  - id: aggregate-and-format
    name: Aggregate & Format Brief
    description: Count by status:* labels, detect stale, format text brief.

pm_behavior:
  Ready: Send brief as Telegram message.
  NeedInfo: Ask which project. Suggest known_projects.
    missing: [project_alias]
    known_projects: [{ key, repo, aliases }]
