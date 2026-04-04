# Project Status Pipeline
# Runtime: Lobster
# Description: Resolve alias → fetch open issues → aggregate → format brief.
# Fully deterministic, no LLM. Returns Ready | NeedInfo as JSON envelope.

name: project-status
args:
  project_alias:
    default: ""
steps:
  - id: resolve
    command: node lobster/lib/tasks/cli/ps-resolve.js --alias $project_alias
  - id: fetch
    command: node lobster/lib/tasks/cli/ps-fetch.js
    stdin: $resolve.stdout
  - id: aggregate
    command: node lobster/lib/tasks/cli/ps-aggregate.js
    stdin: $fetch.stdout
