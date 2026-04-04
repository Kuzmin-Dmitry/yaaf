/**
 * Project Status Model — alias resolution, aggregation, formatting.
 *
 * Pure, deterministic functions. No LLM, no I/O.
 */

const STATUS_LABEL_PREFIX = 'status';
const STATUS_BUCKETS = ['draft', 'backlog', 'ready', 'todo', 'in-progress', 'in-review', 'rework', 'done'];

// --- Project alias registry ---

const PROJECTS = [
  {
    key: 'yaaf',
    repo: 'Kuzmin-Dmitry/yaaf',
    aliases: ['yaaf'],
    stale_after_days: 7,
  },
];

function resolveProject(alias) {
  if (!alias) return null;
  const normalized = alias.toLowerCase().trim();
  if (!normalized) return null;
  return PROJECTS.find(
    (p) => p.key === normalized || p.aliases.includes(normalized)
  ) || null;
}

function listKnownProjects() {
  return PROJECTS.map((p) => ({ key: p.key, repo: p.repo, aliases: p.aliases }));
}

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

const STATUS_EMOJI = {
  draft: '\u{1F4DD}',
  backlog: '\u{1F4CB}',
  ready: '\u2705',
  todo: '\u{1F4CC}',
  'in-progress': '\u{1F527}',
  'in-review': '\u{1F440}',
  rework: '\u{1F504}',
  done: '\u2714\uFE0F',
  unlabeled: '\u2753',
};

/**
 * Format a Telegram-friendly brief (HTML parse_mode).
 *
 * One status per line with emoji prefix, bold header. Only non-zero statuses shown.
 *
 * @param {string} projectKey
 * @param {{ total_open, by_status, stale_count }} stats
 * @returns {string}
 */
function formatTelegramBrief(projectKey, stats) {
  const lines = [`\u{1F4CA} <b>Status: ${projectKey}</b> \u2014 ${stats.total_open} open`];

  const breakdown = [];
  for (const status of STATUS_BUCKETS) {
    const count = stats.by_status[status];
    if (count > 0) {
      const emoji = STATUS_EMOJI[status] || '';
      breakdown.push(`${emoji} ${status}: ${count}`);
    }
  }
  if (stats.by_status.unlabeled > 0) {
    breakdown.push(`${STATUS_EMOJI.unlabeled} unlabeled: ${stats.by_status.unlabeled}`);
  }
  if (breakdown.length > 0) {
    lines.push('');
    lines.push(...breakdown);
  }

  if (stats.stale_count > 0) {
    lines.push('');
    lines.push(`\u26A0\uFE0F Stale: ${stats.stale_count}`);
  }

  return lines.join('\n');
}

/**
 * Plain-text version of telegram brief (strips HTML tags).
 */
function formatBrief(projectKey, stats) {
  return formatTelegramBrief(projectKey, stats).replace(/<[^>]+>/g, '');
}

module.exports = { PROJECTS, resolveProject, listKnownProjects, aggregateStatus, formatBrief, formatTelegramBrief };
