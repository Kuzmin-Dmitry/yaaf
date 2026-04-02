# Reference: Configuration

This document collects the configuration knobs and value formats used in the repository.

## Environment Variables

| Variable | Used by | Meaning |
|---|---|---|
| `GITHUB_TOKEN` | GitHub client, tracker adapters, Symphony adapter | Primary GitHub PAT for REST and GraphQL calls |
| `OPENCLAW_HOME` | GitHub tracker adapter | Overrides default OpenClaw home used to find `auth-profiles.json` |
| `TELEMETRY_DISABLED` | Telemetry agent wrapper | Disables the singleton telemetry service |
| `TELEMETRY_DEBUG` | Telemetry service | Enables debug logging for queueing and send attempts |

## GitHub Token Resolution

For `createGitHubTracker()` the token is resolved in this order:

1. Explicit `token` passed to the factory.
2. `GITHUB_TOKEN` environment variable.
3. `auth-profiles.json` under the OpenClaw PM or main agent profile directories.

## `github_project` Format

Accepted by `publish_task`:

- `owner/repo`
- `owner/repo/projectNumber`

Examples:

- `Kuzmin-Dmitry/yaaf`
- `Kuzmin-Dmitry/yaaf/3`

## Symphony GitHub Tracker Config

Accepted by `parseGitHubTrackerConfig()`:

```yaml
tracker:
  kind: github
  repo: owner/repo
  api_key: $GITHUB_TOKEN
  endpoint: https://api.github.com/graphql
  label_prefix: status
  active_states:
    - status:todo
    - status:in-progress
  terminal_states:
    - status:done
    - status:cancelled
```

### Field rules

| Field | Rule |
|---|---|
| `kind` | Must be `github` |
| `repo` | Must be `owner/repo` |
| `api_key` | May be a literal token or `$ENV_NAME` |
| `active_states` | Must be an array if present |
| `terminal_states` | Must be an array if present |

## Telemetry Defaults

Current runtime defaults in `TelemetryService`:

| Setting | Default |
|---|---|
| Batch size | `10` |
| Batch timeout | `6000` ms |

## Validation Limits

Important constants enforced in code:

| Area | Value |
|---|---|
| `create_task` title max | `200` |
| `publish_task` title max | `300` |
| `publish_task` description max | `65536` |
| Max labels in `publish_task` | `50` |
| Max assignees in `publish_task` | `10` |