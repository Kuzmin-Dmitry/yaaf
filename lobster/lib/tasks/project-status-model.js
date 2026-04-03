/**
 * Project Status Model — aggregation and formatting.
 *
 * Pure, deterministic functions. No LLM, no I/O.
 */

const STATUS_LABEL_PREFIX = 'status';
const STATUS_BUCKETS = ['draft', 'backlog', 'ready', 'todo', 'in-progress', 'in-review', 'rework', 'done'];

/**
 * Aggregate issues into status counts.
 *
 * @param {Array} issues - { number, title, url, labels, updated_at }
 * @param {number} staleDays - threshold for stale detection
 * @param {Date} now - current time (injected for determinism)
 * @returns {{ total_open, by_status, stale_count }}
 */
function aggregateStatus(issues, staleDays, now) {
  const by_status = { draft: 0, backlog: 0, ready: 0, todo: 0, 'in-progress': 0, 'in-review': 0, rework: 0, done: 0, unlabeled: 0 };
  const staleMs = staleDays * 24 * 60 * 60 * 1000;
  let stale_count = 0;

  for (const issue of issues) {
    const statusLabels = issue.labels
      .filter((name) => name.startsWith(`${STATUS_LABEL_PREFIX}:`))
      .sort();

    if (statusLabels.length === 0) {
      by_status.unlabeled++;
    } else {
      const status = statusLabels[0].slice(STATUS_LABEL_PREFIX.length + 1);
      if (STATUS_BUCKETS.includes(status)) {
        by_status[status]++;
      } else {
        by_status.unlabeled++;
      }
    }

    if ((now - new Date(issue.updated_at)) > staleMs) {
      stale_count++;
    }
  }

  return { total_open: issues.length, by_status, stale_count };
}

/**
 * Format a concise PM brief from aggregated stats.
 *
 * @param {string} projectKey
 * @param {{ total_open, by_status, stale_count }} stats
 * @returns {string}
 */
function formatBrief(projectKey, stats) {
  const parts = [`Status ${projectKey}: ${stats.total_open} open issues.`];

  const breakdown = [];
  if (stats.by_status.draft > 0) breakdown.push(`draft: ${stats.by_status.draft}`);
  if (stats.by_status.backlog > 0) breakdown.push(`backlog: ${stats.by_status.backlog}`);
  if (stats.by_status.ready > 0) breakdown.push(`ready: ${stats.by_status.ready}`);
  if (stats.by_status['in-progress'] > 0) breakdown.push(`in progress: ${stats.by_status['in-progress']}`);
  if (stats.by_status['in-review'] > 0) breakdown.push(`in review: ${stats.by_status['in-review']}`);
  if (stats.by_status.todo > 0) breakdown.push(`todo: ${stats.by_status.todo}`);
  if (stats.by_status.rework > 0) breakdown.push(`rework: ${stats.by_status.rework}`);
  if (stats.by_status.done > 0) breakdown.push(`done: ${stats.by_status.done}`);
  if (stats.by_status.unlabeled > 0) breakdown.push(`unlabeled: ${stats.by_status.unlabeled}`);
  if (breakdown.length > 0) parts.push(breakdown.join(', ') + '.');

  if (stats.stale_count > 0) {
    parts.push(`Stale: ${stats.stale_count}.`);
  }

  return parts.join(' ');
}

module.exports = { aggregateStatus, formatBrief };
