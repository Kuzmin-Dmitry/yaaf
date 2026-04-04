#!/usr/bin/env node
/**
 * CLI step: aggregate issues and format brief.
 * Stdin: JSON from ps-fetch (project + issues or terminal result).
 * Stdout: JSON — Ready result or pass-through terminal result.
 * Flag: --now <iso> for deterministic clock (default: now).
 */

const { aggregateStatus, formatBrief, formatTelegramBrief } = require('../project-status-model');
const { parseArg, runStdinStep } = require('./cli-io');

function aggregate(input, now) {
  const { project, issues } = input;
  const stats = aggregateStatus(issues, project.stale_after_days, now);
  const brief = formatBrief(project.key, stats);
  const telegram_brief = formatTelegramBrief(project.key, stats);

  return {
    type: 'Ready',
    project: { key: project.key, repo: project.repo },
    brief,
    telegram_brief,
    stats,
    generated_at: now.toISOString(),
  };
}

if (require.main === module) {
  const idx = process.argv.indexOf('--now');
  const now = idx !== -1 ? new Date(process.argv[idx + 1]) : new Date();

  runStdinStep(async (input) => aggregate(input, now));
}

module.exports = { aggregate };
