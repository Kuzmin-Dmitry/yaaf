/**
 * Step 4: Dedup Check
 *
 * Compare parsed.title against existing tasks (case-insensitive exact match).
 * Skips if partial_state includes dedup_decision.
 *
 * Early exit: NeedDecision if match found.
 */

const { RESULT_TYPES } = require('../model');

/**
 * @param {Object} parsed - merged field set
 * @param {Object} context - contains recentTasks from step 1
 * @returns {{ clear: boolean, result?: Object }}
 */
function dedupCheck(parsed, context) {
  // Skip if user already decided
  if (parsed.dedup_decision) {
    return { clear: true };
  }

  const title = parsed.title.trim().toLowerCase();
  const candidates = (context.recentTasks || []).filter(
    (task) => task.state !== 'Done' && task.title.trim().toLowerCase() === title
  );

  if (candidates.length > 0) {
    return {
      clear: false,
      result: {
        type: RESULT_TYPES.NeedDecision,
        reason: 'duplicate_candidate',
        candidates: candidates.map((t) => ({ id: t.id, title: t.title, state: t.state })),
        parsed_so_far: { ...parsed },
      },
    };
  }

  return { clear: true };
}

module.exports = { dedupCheck };
