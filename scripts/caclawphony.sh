#!/usr/bin/env bash

# Caclawphony — Symphony Runtime Engine
# YAML-driven state machine executor for feature lifecycle.
#
# Reads feature-lifecycle.yaml + dispatch-manifest.yaml, determines current
# state from PIPELINE_STATUS.md, computes the next transition, and dispatches
# the appropriate Lobster pipeline or shell action.
#
# Usage:
#   scripts/caclawphony.sh run-once              # Single transition step
#   scripts/caclawphony.sh poll [--interval 30]   # Daemon loop
#   scripts/caclawphony.sh status                 # Show current state
#   scripts/caclawphony.sh init <feature|story> <id> <doc>  # Start new lifecycle

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

LIFECYCLE_YAML="$ROOT/symphony/feature-lifecycle.yaml"
DISPATCH_YAML="$ROOT/symphony/dispatch-manifest.yaml"
STATUS_FILE="$HOME/.openclaw/workspace-factory-jarvis/PIPELINE_STATUS.md"
STATUS_HELPER="$ROOT/scripts/update-pipeline-state.sh"
CHECKPOINT_HELPER="$ROOT/scripts/write-checkpoint.sh"

POLL_INTERVAL="${CACLAWPHONY_POLL_INTERVAL:-30}"

log() {
  printf '[caclawphony %s] %s\n' "$(date -u +"%H:%M:%S")" "$1" >&2
}

die() {
  log "FATAL: $1"
  exit 1
}

_lifecycle_json=""
_dispatch_json=""

load_lifecycle() {
  if [[ -z "$_lifecycle_json" ]]; then
    [[ -f "$LIFECYCLE_YAML" ]] || die "lifecycle YAML not found: $LIFECYCLE_YAML"
    _lifecycle_json="$(npx --yes js-yaml "$LIFECYCLE_YAML" 2>/dev/null)"
  fi
  echo "$_lifecycle_json"
}

load_dispatch() {
  if [[ -z "$_dispatch_json" ]]; then
    [[ -f "$DISPATCH_YAML" ]] || die "dispatch manifest not found: $DISPATCH_YAML"
    _dispatch_json="$(npx --yes js-yaml "$DISPATCH_YAML" 2>/dev/null)"
  fi
  echo "$_dispatch_json"
}

read_pipeline_status() {
  [[ -f "$STATUS_FILE" ]] || die "status file not found: $STATUS_FILE"
  node -e '
    const fs = require("fs");
    const text = fs.readFileSync(process.argv[1], "utf8");
    const fields = {};
    const re = /^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      fields[m[1].trim()] = m[2].trim();
    }
    process.stdout.write(JSON.stringify(fields));
  ' "$STATUS_FILE"
}

read_stories_table() {
  node -e '
    const fs = require("fs");
    const text = fs.readFileSync(process.argv[1], "utf8");
    const lines = text.split("\n");
    let inTable = false;
    let headers = [];
    const stories = [];
    for (const line of lines) {
      if (line.startsWith("## Stories")) { inTable = true; continue; }
      if (inTable && line.startsWith("|") && line.includes("Story ID")) {
        headers = line.split("|").map(h => h.trim()).filter(Boolean);
        continue;
      }
      if (inTable && line.match(/^\|[\s-|]+\|$/)) continue;
      if (inTable && line.startsWith("|")) {
        const cells = line.split("|").map(c => c.trim()).filter(Boolean);
        if (cells[0] === "—" || cells[0] === "") continue;
        const row = {};
        headers.forEach((h, i) => { row[h] = cells[i] || ""; });
        stories.push(row);
      }
      if (inTable && line.startsWith("---")) break;
    }
    process.stdout.write(JSON.stringify(stories));
  ' "$STATUS_FILE"
}

update_story_row() {
  local story_id="$1"
  local field="$2"
  local value="$3"

  local col_index
  col_index="$(node -e '
    const fs = require("fs");
    const text = fs.readFileSync(process.argv[1], "utf8");
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("|") && line.includes("Story ID")) {
        const headers = line.split("|").map(h => h.trim()).filter(Boolean);
        const idx = headers.indexOf(process.argv[2]);
        process.stdout.write(String(idx));
        process.exit(0);
      }
    }
    process.stdout.write("-1");
  ' "$STATUS_FILE" "$field")"

  if [[ "$col_index" == "-1" ]]; then
    log "WARN: story table column '$field' not found"
    return 1
  fi

  node -e '
    const fs = require("fs");
    const storyId = process.argv[2];
    const colIndex = parseInt(process.argv[3], 10);
    const newValue = process.argv[4];
    const filePath = process.argv[1];
    const text = fs.readFileSync(filePath, "utf8");
    const lines = text.split("\n");
    const result = lines.map(line => {
      if (!line.startsWith("|") || !line.includes(storyId)) return line;
      const cells = line.split("|");
      const filtered = [];
      let idx = 0;
      for (let i = 0; i < cells.length; i++) {
        if (i === 0 || i === cells.length - 1) { filtered.push(cells[i]); continue; }
        if (idx === colIndex) {
          filtered.push(" " + newValue + " ");
        } else {
          filtered.push(cells[i]);
        }
        idx++;
      }
      return filtered.join("|");
    });
    fs.writeFileSync(filePath, result.join("\n"));
  ' "$STATUS_FILE" "$story_id" "$col_index" "$value"
}

check_all_stories_done() {
  local feature_id="$1"
  local stories_json
  stories_json="$(read_stories_table)"

  local all_done
  all_done="$(node -e '
    const stories = JSON.parse(process.argv[1]);
    const real = stories.filter(s => s["Story ID"] && s["Story ID"] !== "—");
    const allDone = real.length > 0 && real.every(s => s.Status === "done" || s.Status === "merged");
    process.stdout.write(String(allDone));
  ' "$stories_json")"

  if [[ "$all_done" == "true" ]]; then
    log "All stories complete for $feature_id — transitioning to INTEGRATION"
    bash "$STATUS_HELPER" set-fields \
      "Current Phase=\`INTEGRATION\`" \
      "Current Gate=all-stories-done" \
      "Active Agent=lobster" \
      "Active Pipeline=_none_" \
      "Progress=all stories done" \
      "Last Updated=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  fi
}

dispatch_for_phase() {
  local status_json lifecycle_json dispatch_json
  status_json="$(read_pipeline_status)"
  lifecycle_json="$(load_lifecycle)"
  dispatch_json="$(load_dispatch)"

  local phase feature gate
  phase="$(node -e 'process.stdout.write((JSON.parse(process.argv[1])["Current Phase"] || "idle").replace(/`/g, ""))' "$status_json")"
  feature="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).Feature || "_none_")' "$status_json")"
  gate="$(node -e 'process.stdout.write(JSON.parse(process.argv[1])["Current Gate"] || "_none_")' "$status_json")"

  if [[ "$phase" == "idle" || "$phase" == "_none_" ]]; then
    log "Pipeline idle — nothing to do"
    return 0
  fi

  local workflow
  workflow="$(node -e '
    const dispatch = JSON.parse(process.argv[1]);
    const phase = process.argv[2];
    const state = (dispatch.states || {})[phase];
    if (!state) { process.stdout.write(""); process.exit(0); }
    if (state.managed_by) { process.stdout.write("managed:" + state.managed_by); process.exit(0); }
    const routes = state.routes || {};
    const defaultRoute = routes.default || routes.feature || Object.values(routes)[0];
    if (defaultRoute && defaultRoute.workflow) {
      process.stdout.write(defaultRoute.workflow);
    } else if (state.command) {
      process.stdout.write("command:" + state.command);
    } else {
      process.stdout.write("");
    }
  ' "$dispatch_json" "$phase")"

  if [[ -z "$workflow" ]]; then
    log "No dispatch route for phase $phase"
    return 0
  fi

  if [[ "$workflow" == managed:* ]]; then
    log "Phase $phase is managed by ${workflow#managed:} — waiting"
    return 0
  fi

  if [[ "$workflow" == command:* ]]; then
    local cmd="${workflow#command:}"
    log "Executing shell command for phase $phase: $cmd"
    eval "$cmd"
    return $?
  fi

  if [[ "$phase" == "IMPLEMENTATION" ]]; then
    local impl_status_json impl_feature_id next_story_json
    impl_status_json="$(read_pipeline_status)"
    impl_feature_id="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).Feature || "")' "$impl_status_json")"

    if [[ -n "$impl_feature_id" ]]; then
      export FEATURE_ID="$impl_feature_id"
    fi

    next_story_json="$(
      node -e '
        const stories = JSON.parse(process.argv[1]);
        const next = stories.find(s => s.Status === "not-started");
        if (!next) { process.stdout.write(""); process.exit(0); }
        process.stdout.write(JSON.stringify(next));
      ' "$(read_stories_table)"
    )"

    if [[ -z "$next_story_json" ]]; then
      log "No not-started stories remaining — checking if all done"
      check_all_stories_done "${FEATURE_ID:-_none_}"
      return 0
    fi

    export STORY_ID="$(node -e 'process.stdout.write(JSON.parse(process.argv[1])["Story ID"])' "$next_story_json")"
    export STORY_TIER="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).Tier)' "$next_story_json")"

    log "Selected story $STORY_ID (tier: $STORY_TIER) for implementation"
    update_story_row "$STORY_ID" "Status" "in-progress"
  fi

  log "Dispatching routed pipeline: $workflow"

  bash "$CHECKPOINT_HELPER" \
    --pipeline "caclawphony" \
    --step "dispatch-$phase" \
    --feature "${FEATURE_ID:-_none_}" \
    --story "${STORY_ID:-_none_}" \
    --verdict "dispatching" \
    --approval "_none_" \
    --resume "bash ./scripts/caclawphony.sh run-once" \
    --notes "Dispatching $workflow for phase $phase"

  if bash "$ROOT/scripts/lobster-dispatch.sh" "$workflow"; then
    log "Pipeline $workflow completed successfully"
    bash "$STATUS_HELPER" set-last-logs "Pipeline $workflow completed for phase $phase"

    if [[ "$phase" == "IMPLEMENTATION" ]]; then
      local verdict_file="$ROOT/.lobster-state/dev-cycle-verdict.json"
      if [[ -f "$verdict_file" ]]; then
        local verdict_label
        verdict_label="$(node -e 'const v=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(v.verdict||"unknown")' "$verdict_file")"
        log "Dev-cycle verdict: $verdict_label"

        case "$verdict_label" in
          story-done)
            update_story_row "${STORY_ID:-}" "Status" "done"
            log "Story ${STORY_ID:-} marked done"
            ;;
          needs-iteration)
            local current_iter="${ITERATION:-1}"
            local next_iter=$((current_iter + 1))
            if [[ $next_iter -gt 3 ]]; then
              log "Story ${STORY_ID:-} exceeded max iterations — escalating"
              update_story_row "${STORY_ID:-}" "Status" "escalated"
            else
              export ITERATION="$next_iter"
              log "Story ${STORY_ID:-} needs iteration $next_iter"
            fi
            ;;
          needs-escalation)
            update_story_row "${STORY_ID:-}" "Status" "escalated"
            log "Story ${STORY_ID:-} escalated to architect"
            ;;
        esac
      fi
    fi
  else
    log "Pipeline $workflow FAILED for phase $phase"
    bash "$STATUS_HELPER" set-last-logs "Pipeline $workflow FAILED for phase $phase"
    bash "$CHECKPOINT_HELPER" \
      --pipeline "caclawphony" \
      --step "dispatch-$phase-failed" \
      --feature "${FEATURE_ID:-_none_}" \
      --story "${STORY_ID:-_none_}" \
      --verdict "failed" \
      --approval "_none_" \
      --resume "bash ./scripts/lobster-dispatch.sh $workflow" \
      --notes "Pipeline $workflow failed"
    return 1
  fi
}

cmd_run_once() {
  log "run-once: reading state"
  dispatch_for_phase
}

cmd_poll() {
  local pid_file="$ROOT/.caclawphony.pid"
  local log_file="$ROOT/.caclawphony.log"

  echo $$ > "$pid_file"
  log "Starting poll mode (interval: ${POLL_INTERVAL}s)"

  while true; do
    cmd_run_once >> "$log_file" 2>&1 || true
    sleep "$POLL_INTERVAL"
  done
}

cmd_status() {
  local status_json
  status_json="$(read_pipeline_status)"
  node -e '
    const s = JSON.parse(process.argv[1]);
    const fields = ["Feature","Current Phase","Active Agent","Active Pipeline","Current Gate","Progress","Last Updated"];
    for (const f of fields) {
      console.log(f + ": " + (s[f] || "_none_"));
    }
  ' "$status_json"
}

cmd_init() {
  local kind=""
  local id=""
  local doc=""
  local phase=""
  local gate=""
  local source="main"

  # Parse positional and optional args
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --phase) phase="${2:-}"; shift 2 ;;
      --gate) gate="${2:-}"; shift 2 ;;
      --source) source="${2:-}"; shift 2 ;;
      -*)
        die "unknown option: $1"
        ;;
      *)
        if [[ -z "$kind" ]]; then kind="$1"
        elif [[ -z "$id" ]]; then id="$1"
        elif [[ -z "$doc" ]]; then doc="$1"
        fi
        shift
        ;;
    esac
  done

  [[ -n "$kind" ]] || die "init requires: <feature|story> <id> <doc>"
  [[ -n "$id" ]] || die "init requires: <feature|story> <id> <doc>"
  [[ -n "$doc" ]] || die "init requires: <feature|story> <id> <doc>"

  # Default phase is INTAKE; Jarvis can skip ahead with --phase
  if [[ -z "$phase" ]]; then
    phase="INTAKE"
  fi

  # Determine initial agent and gate based on phase
  local agent="pm"
  case "$phase" in
    INTAKE)
      agent="pm"
      gate="${gate:-_none_}"
      ;;
    DRAFT_ARTIFACT)
      agent="jarvis"
      gate="${gate:-requirements-ready}"
      ;;
    USER_REVIEW)
      agent="jarvis"
      gate="${gate:-draft-ready}"
      ;;
    ARCH_REVIEW)
      agent="architect"
      gate="${gate:-approved-for-work}"
      ;;
    IMPLEMENTATION)
      agent="symphony"
      gate="${gate:-scope-approved}"
      ;;
    *)
      agent="symphony"
      gate="${gate:-_none_}"
      ;;
  esac

  log "Initializing $kind lifecycle for $id (phase: $phase, source: $source)"

  bash "$STATUS_HELPER" set-fields \
    "Session ID=$(uuidgen 2>/dev/null || date +%s)" \
    "Feature=$id" \
    "Feature Doc=$doc" \
    "Current Phase=\`$phase\`" \
    "Active Agent=$agent" \
    "Active Pipeline=_none_" \
    "Current Gate=$gate" \
    "Resume Token=_none_" \
    "Pending Approval=_none_" \
    "Progress=initialized by $source" \
    "Started=$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    "Last Updated=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  bash "$CHECKPOINT_HELPER" \
    --pipeline "caclawphony" \
    --step "init" \
    --feature "$id" \
    --story "_none_" \
    --verdict "$gate" \
    --approval "_none_" \
    --resume "bash ./scripts/caclawphony.sh run-once" \
    --notes "Lifecycle init: $kind $id, phase=$phase, source=$source"

  log "Lifecycle initialized: $kind $id → phase $phase (source: $source)"
}

case "${1:-}" in
  run-once) cmd_run_once ;;
  poll) shift; cmd_poll "$@" ;;
  status) cmd_status ;;
  init) shift; cmd_init "$@" ;;
  run)
    log "run: executing single cycle"
    cmd_run_once
    ;;
  *)
    echo "Usage: scripts/caclawphony.sh {run-once|poll|status|init|run}" >&2
    exit 1
    ;;
esac
