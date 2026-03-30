#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF' >&2
Usage:
  scripts/run-draft-review-place.sh --request "..." [options]
  scripts/run-draft-review-place.sh --request-file path [options]

Options:
  --kind auto|feature|story              Force artifact kind (default: auto)
  --artifact-id ID                       Use a specific artifact id/filename stem
  --approve yes|no                       Move approved draft into active folder (default: no)
  --continue-on-clarification yes|no     Continue to draft even when intake says clarification is needed (default: no)
  --register-lifecycle yes|no            Register with Symphony for remaining phases (default: yes)

Jarvis can call this script directly via his own channel.
Symphony picks up the remaining lifecycle phases automatically.

Requires:
  OPENCLAW_URL
  OPENCLAW_GATEWAY_TOKEN
EOF
  exit 1
}

raw_request=""
raw_request_file=""
kind="auto"
artifact_id=""
approve="no"
continue_on_clarification="no"
register_lifecycle="yes"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --request)
      raw_request="${2:-}"
      shift 2
      ;;
    --request-file)
      raw_request_file="${2:-}"
      shift 2
      ;;
    --kind)
      kind="${2:-}"
      shift 2
      ;;
    --artifact-id)
      artifact_id="${2:-}"
      shift 2
      ;;
    --approve)
      approve="${2:-}"
      shift 2
      ;;
    --continue-on-clarification)
      continue_on_clarification="${2:-}"
      shift 2
      ;;
    --register-lifecycle)
      register_lifecycle="${2:-}"
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

[[ -n "${OPENCLAW_URL:-}" ]] || { echo "OPENCLAW_URL required" >&2; exit 2; }
[[ -n "${OPENCLAW_GATEWAY_TOKEN:-}" ]] || { echo "OPENCLAW_GATEWAY_TOKEN required" >&2; exit 2; }

if [[ -n "$raw_request_file" ]]; then
  if [[ "$raw_request_file" = /* ]]; then
    request_path="$raw_request_file"
  else
    request_path="$ROOT/$raw_request_file"
  fi
  [[ -f "$request_path" ]] || { echo "request file not found: $raw_request_file" >&2; exit 3; }
  raw_request="$(cat "$request_path")"
fi

[[ -n "$raw_request" ]] || usage

intake_file="$(mktemp)"
trap 'rm -f "$intake_file"' EXIT

RAW_REQUEST="$raw_request" bash "$ROOT/scripts/lobster-dispatch.sh" workflows/feature-intake-dispatch.lobster >"$intake_file"

intake_summary="$(
  node - "$intake_file" "$kind" <<'NODE'
const fs = require("fs");
const raw = fs.readFileSync(process.argv[2], "utf8").trim();
let data;
try {
  data = JSON.parse(raw);
} catch {
  const match = raw.match(/({[\s\S]*}|\[[\s\S]*])\s*$/);
  if (!match) throw new Error("unable to parse intake JSON");
  data = JSON.parse(match[1]);
}
const forcedKind = process.argv[3];
const item = data.output?.[0] ?? {};
const inferredKind =
  forcedKind !== "auto"
    ? forcedKind
    : (item.scopeAssessment === "feature" || item.scopeAssessment === "story")
      ? item.scopeAssessment
      : (item.requestType === "feature" || item.requestType === "story")
        ? item.requestType
        : "unclear";
process.stdout.write(JSON.stringify({
  inferredKind,
  summary: item.summary ?? "",
  project: item.project ?? null,
  projectMode: item.projectMode ?? "unknown",
  requestType: item.requestType ?? "unclear",
  scopeAssessment: item.scopeAssessment ?? "unclear",
  needsClarification: Boolean(item.needsClarification),
  missingInfo: item.missingInfo ?? [],
  jarvisReply: item.jarvisReply ?? ""
}));
NODE
)"

resolved_kind="$(node -e 'const d=JSON.parse(process.argv[1]);process.stdout.write(d.inferredKind);' "$intake_summary")"
needs_clarification="$(node -e 'const d=JSON.parse(process.argv[1]);process.stdout.write(String(d.needsClarification));' "$intake_summary")"

if [[ "$resolved_kind" != "feature" && "$resolved_kind" != "story" ]]; then
  echo "unable to determine artifact kind from intake" >&2
  node -e 'console.log(process.argv[1])' "$intake_summary"
  exit 4
fi

if [[ "$needs_clarification" == "true" && "$continue_on_clarification" != "yes" ]]; then
  node - "$intake_summary" <<'NODE'
const intake = JSON.parse(process.argv[2]);
console.log(JSON.stringify({
  status: "needs_clarification",
  phase: "intake",
  artifactKind: intake.inferredKind,
  intake
}, null, 2));
NODE
  exit 10
fi

if [[ -z "$artifact_id" ]]; then
  timestamp="$(date -u +"%Y%m%d-%H%M%S")"
  artifact_id="DRAFT-${resolved_kind^^}-${timestamp}"
fi

safe_name="$(printf '%s' "$artifact_id" | tr '[:space:]' '-' | tr -cd '[:alnum:]-_')"

if [[ "$resolved_kind" == "feature" ]]; then
  review_rel="docs/features/review/${safe_name}.md"
  active_rel="docs/features/active/${safe_name}.md"
  env_name="FEATURE"
  workflow="workflows/feature-draft.lobster"
else
  review_rel="docs/stories/review/${safe_name}.md"
  active_rel="docs/stories/active/${safe_name}.md"
  env_name="STORY"
  workflow="workflows/story-draft.lobster"
fi

printf '%s\n' "$raw_request" >"$ROOT/$review_rel"

if [[ "$resolved_kind" == "feature" ]]; then
  FEATURE_ID="$safe_name" FEATURE_DOC="$review_rel" \
    bash "$ROOT/scripts/lobster-dispatch.sh" "$workflow" >/dev/null
else
  STORY_ID="$safe_name" STORY_DOC="$review_rel" \
    bash "$ROOT/scripts/lobster-dispatch.sh" "$workflow" >/dev/null
fi

placed_path="null"
if [[ "$approve" == "yes" ]]; then
  placed_output="$(bash "$ROOT/scripts/place-reviewed-artifact.sh" "$resolved_kind" "$review_rel")"
  placed_path="$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$placed_output")"
fi

# ── Register with Symphony for remaining lifecycle phases ──────────────

next_phase=""

if [[ "$register_lifecycle" == "yes" ]]; then
  if [[ "$approve" == "yes" ]]; then
    if [[ "$resolved_kind" == "feature" ]]; then
      next_phase="ARCH_REVIEW"
    else
      next_phase="IMPLEMENTATION"
    fi
  else
    next_phase="USER_REVIEW"
  fi

  bash "$ROOT/scripts/Symphony.sh" init \
    "$resolved_kind" "$safe_name" "$review_rel" \
    --phase "$next_phase" \
    --source "jarvis"
fi

# ── Emit result ──────────────────────────────────────────────────────────

node - "$intake_summary" "$review_rel" "$placed_path" "$resolved_kind" "$safe_name" "$active_rel" "$next_phase" <<'NODE'
const intake = JSON.parse(process.argv[2]);
const reviewDoc = process.argv[3];
const placedPath = process.argv[4];
const artifactKind = process.argv[5];
const artifactId = process.argv[6];
const activeRel = process.argv[7];
const registeredPhase = process.argv[8] || null;
console.log(JSON.stringify({
  status: "ok",
  artifactKind,
  artifactId,
  intake,
  reviewDoc,
  activeDoc: placedPath === "null" ? null : JSON.parse(placedPath),
  suggestedActiveDoc: activeRel,
  lifecycleRegistered: Boolean(registeredPhase),
  nextPhase: registeredPhase
}, null, 2));
NODE
