# Create GitHub Issue Pipeline
# Runtime: Lobster
# Description: Resolve → validate type → enrich → review → dedup → approve → publish.
# Returns typed results: Ready | NeedInfo | NeedDecision | Rejected
#
# Agent flow:
#   Main agent (Telegram) → AI Factory agent → llm-task (classify + extract) → this pipeline → result → Telegram
#
# The AI Factory agent runs BEFORE this pipeline to:
#   1. Classify the message as AI Factory related
#   2. Identify the AIF Project
#   3. Identify the AIF Task type (bug/feature/chore)
#   4. Extract title and body via llm-task
#
# This pipeline handles:
#   1. Resolve AIF Project alias
#   2. Validate task type
#   3. Health-check GitHub + enrich context (fetch recent tasks)
#   4. Review & template the task via llm-task
#   5. Dedup check
#   6. Human approval gate
#   7. Publish GitHub Issue

name: create-github-issue
args:
  project_alias:
    default: ""
  task_type:
    default: ""
  title:
    default: ""
  body:
    default: ""
  partial_state_json:
    default: "null"
steps:
  - id: resolve
    command: node lobster/lib/tasks/cli/cgi-resolve.js --alias $project_alias

  - id: validate-type
    command: node lobster/lib/tasks/cli/cgi-type.js --type $task_type
    stdin: $resolve.stdout

  - id: enrich
    command: node lobster/lib/tasks/cli/cgi-enrich.js
    stdin: $validate-type.stdout

  - id: review
    command: >
      openclaw.invoke --tool llm-task --action json --args-json '{
        "prompt": "Review the following task and rewrite it to match the project template. Keep the original meaning but ensure the body has: Summary, Acceptance Criteria, and Technical Notes sections. Return JSON: {\"title\": \"...\", \"body\": \"...\"}",
        "input": {"title": "$title", "body": "$body"},
        "schema": {
          "type": "object",
          "properties": {
            "title": {"type": "string"},
            "body": {"type": "string"}
          },
          "required": ["title", "body"],
          "additionalProperties": false
        }
      }'

  - id: dedup
    command: node lobster/lib/tasks/cli/cgi-dedup.js --title "$title" --body "$body" --partial-state '$partial_state_json'
    stdin: $enrich.stdout

  - id: approve
    command: approve --preview-from-stdin --prompt 'Publish this GitHub issue?'
    stdin: $dedup.stdout
    approval: required

  - id: publish
    command: node lobster/lib/tasks/cli/cgi-publish.js
    stdin: $dedup.stdout
    condition: $approve.approved
