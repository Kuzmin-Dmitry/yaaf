# YAAF — Yet Another AI Factory - Development Guide

**Date:** 2026-04-06

## Introduction

YAAF is an autonomous software delivery system designed for high reliability and zero external dependencies. This guide provides information for setting up, developing, and testing the system.

## Prerequisites

- **Node.js (LTS)**: The project is written in pure Node.js (CommonJS).
- **GitHub Personal Access Token**: Required with `repo` scope for interacting with issues and labels.
- **OpenClaw Gateway (Optional)**: Required if you intend to run LLM-based tasks locally.

## Environment Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Kuzmin-Dmitry/yaaf.git
   cd yaaf
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in the following:
   ```bash
   GITHUB_TOKEN=your_token_here
   GATEWAY_TOKEN=your_llm_gateway_token_here
   GATEWAY_URL=http://127.0.0.1:18789/v1/chat/completions # Default
   ```

3. **Register Projects**:
   Edit `config/projects.json` to register the repositories you want YAAF to monitor.
   ```json
   {
     "projects": [{
       "name": "your-project",
       "owner": "your-username",
       "repo": "your-repo"
     }]
   }
   ```

## Local Development

### Running the Orchestrator (Symphony)

Symphony is the "When" layer. It polls GitHub and dispatches workflows.

```bash
npm run symphony
# or
node symphony/index.js
```

### Running Workflows (Lobster)

Lobster is the "How" layer. You can run individual workflows for testing.

```bash
node lobster/index.js run lobster/workflows/issue-review.lobster \
  --args-json '{"issue_number":1,"owner":"...","repo":"...","issue_title":"...","issue_body":"..."}'
```

## Testing Strategy

YAAF maintains a "zero-dependency" rule for testing as well. All tests use a custom HTTP mocking library found in `test/helpers/mock-http.js`.

### Running Tests

```bash
npm test
```

This will execute:
- **Unit tests** for individual steps (`test/tasks/`).
- **Workflow validation** for `.lobster` files (`test/workflows/`).
- **Orchestration tests** for Symphony (`test/symphony/`).
- **End-to-end integration tests** (`test/integration/`).

## Project Conventions

1. **Zero External Dependencies**: Do not add new entries to `package.json` dependencies. Use Node.js standard libraries only.
2. **Stateless Workflows**: Lobster workflows should not rely on local persistent state. Use GitHub labels or issue comments to track progress.
3. **CommonJS**: The project uses `require()` and `module.exports`.
4. **Custom Retry Logic**: Use `lobster/lib/retry.js` for network-sensitive operations.

## Contributing

- **New Steps**: Place new Node.js modules in `lobster/lib/tasks/steps/`.
- **New Workflows**: Place new `.lobster` files in `lobster/workflows/`.
- **New Agents**: Update `AGENTS.md` and ensure they are compatible with the OpenClaw runtime.

---

_Generated using BMAD Method `document-project` workflow_
