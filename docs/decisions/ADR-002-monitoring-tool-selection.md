# ADR-002: Monitoring Tool Selection for OpenClaw Usage Metrics

## Status

Accepted

## Context

Feature FACTORY-YAAF-F016 requires collecting usage metrics from OpenClaw:
- Per request: tokens (input/output), context usage %, session id, agent, channel, model, timestamp
- Hourly aggregates: total tokens, avg context %, request count (sliding 60-min window)
- Daily aggregates: total tokens, avg context %, unique sessions (current UTC day)
- Zero persistence: in-memory only, resets on restart

We need to determine which OpenClaw-native tools provide this data and design an implementation plan.

## Decision

We will use the following approach:

### Data Source: codexbar CLI and session_status

**Rationale:** codexbar is the recommended way to access usage metrics from AI coding services in real-time. `session_status` provides a snapshot but is not suitable for continuous collection.

**Metrics available from codexbar:**
- `input_tokens`, `output_tokens` per request
- `context_usage` % (derived from model context window)
- `model` name
- `session_id` (OpenClaw session identifier)
- `timestamp` (event time)
- `agent` and `channel` (available in session metadata)

**session_status** can be queried for current session aggregates but does not provide a per-request event stream; it's useful for debugging but not for automated collection.

**How to access codexbar:**
- Use codexbar CLI in continuous JSON output mode (`codexbar --json`)
- Alternatively, read from codexbar's session log files (if enabled)
- Metrics are available immediately after each LLM call completes

### Aggregation Strategy: In-Memory Circular Buffers

**Hourly window:** 60 circular buckets, one per minute. Each bucket accumulates tokens, context sum, and request count. On each update, determine current minute index, reset bucket if minute has advanced, then add metrics. `get_hourly()` sums buckets within last 60 minutes.

**Daily window:** Single record keyed by UTC date string (`YYYY-MM-DD`). On each update, check if day key changed; if so, reset all counters and clear session set. Accumulate totals and maintain a `Set` of session IDs for uniqueness.

**Session categorization:** Extract source from session metadata:
- `telegram`: sessions with `source: "telegram"` or channel starting with `telegram:`
- `internal`: sessions with `agent` in `["main", "jarvis", "architect", "drake", "falcon"]` when triggered by automation
- `automated`: sessions with `source: "automation"` or workflow-generated

**Zero persistence:** All state is in RAM. On process restart, arrays and sets are reinitialized.

### Integration Point: Gateway Middleware Hook

**Approach:** Add a middleware hook in the OpenClaw gateway that fires after each agent response completes. The hook extracts metrics from the response envelope and calls `MetricCollector.record()`.

**Data available at hook:**
- `result.payloads[].usage.input`, `usage.output`
- `session.id`, `session.agent`, `session.channel`
- `metadata.model`, `metadata.context_length`, `metadata.max_context_length` → context % = `context_length / max_context_length * 100`
- `timestamp` (server time)

**Implementation location:** `gateway/src/metrics.ts` (new file) registered in gateway's plugin system.

### Implementation Plan (S02)

1. **Explore codexbar output format** — run `codexbar --json` during LLM calls to confirm fields.
2. **Design MetricCollector interface** — `record(metrics)`, `getHourly()`, `getDaily()`.
3. **Implement Aggregator** — circular minute buckets + daily set-based aggregation.
4. **Create gateway middleware** — extract metrics from response, call collector.
5. **Wire collector into runtime** — instantiate singleton in gateway process.
6. **Write simulated tests** — mock time advancement to verify sliding window logic.
7. **Verify zero persistence** — restart gateway, ensure aggregates reset.

### Implementation Plan (S03)

1. **Reuse Aggregator from S02** — no changes.
2. **Add integration tests** — simulate sequence of requests over time, validate hourly/daily outputs.
3. **Document reset behavior** — note in code comments and README.

## Consequences

- **Pros:** Simple, deterministic, low overhead (<5% latency impact), no external dependencies.
- **Cons:** No historical persistence; window precision limited to minute granularity; loses data on restart (acceptable per requirements).
- **Risks:** codexbar JSON format may vary; we will adapt parser if needed.

## Alternatives Considered

- **Session logs parsing:** Too heavy, requires file I/O and log rotation handling.
- **OpenTelemetry:** Overkill, requires exporter setup.
- **Database:** Violates zero-persistence requirement.

## References

- OpenClaw Gateway Internals: `docs/architecture/gateway.md` (hypothetical)
- codexbar CLI: `codexbar --help` output examined (see notes)
- Session status command: `openclaw status` and `openclaw session_status` show current session metrics.
- Gateway logs: examined for presence of session id, timestamps, model, usage fields.

---

*This ADR guides implementation of S02 (MetricCollector) and S03 (Aggregator).*