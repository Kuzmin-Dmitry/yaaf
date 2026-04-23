# T5 verification — 2026-04-23 (SKIPPED)

- **Issue:** —
- **Transition tested:** —
- **Status:** **SKIPPED** — no `GITHUB_TOKEN` available in the current environment.

## Reason

The T5 protocol (`T5-manual-verification.md`) requires:

- Valid `GITHUB_TOKEN` with `repo` scope in `.env`.
- A live GitHub repository from `config/projects.json`.
- Observation of labels on a real issue during an `approveTask` run.

Neither the token nor live API access is available in this environment, so the steps cannot be executed.

## Coverage substitute

The atomic-swap contract is verified through `test/github/tracker-adapter.test.js` at the mock-HTTP level:

- **S1** — Draft → Backlog: exactly one `setLabels` call, correct target set, no `addLabels`/`removeLabel` calls.
- **S2** — Backlog → Ready with 3 non-status labels: all preserved; old `status:backlog` does not leak.
- **S3** — Issue without `status:*`: transition succeeds (treated as Draft), non-status label preserved.
- **S3b** — Ready (no valid transition): guard fires before any mutation; `setLabels` not called.
- **S4** — `setLabels` 500: wrapped as `TrackerError { code: 'transition_failed' }` with `cause` preserved; no side calls.

Run:

```bash
node test/github/tracker-adapter.test.js
```

All 5 scenarios pass (2026-04-23).

## Conclusion

- **Mock-level proof of atomicity:** pass.
- **Live verification:** **pending** — must be executed by an operator with a valid `GITHUB_TOKEN` before the feature is closed.
- **Feature status:** code-complete (T1–T4). Awaiting T5 live prove-out.

## Next action (for the operator)

1. Configure `.env` with `GITHUB_TOKEN`.
2. Follow `T5-manual-verification.md` steps 1–9.
3. Record findings in a new file `T5-verification-<YYYYMMDD>.md` in this directory.
4. Only after that file shows `Conclusion: pass`, merge the feature.
