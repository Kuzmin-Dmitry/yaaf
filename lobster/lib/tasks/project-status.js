/**
 * project_status — re-export facade.
 *
 * Orchestration is in lobster/workflows/project-status.lobster.
 * CLI steps: lobster/lib/tasks/cli/ps-resolve.js, ps-fetch.js, ps-aggregate.js.
 * Model: lobster/lib/tasks/project-status-model.js.
 *
 * No external consumers import from this file currently.
 * Tests import from CLI steps and model directly.
 * Kept for potential programmatic use.
 */

const { resolve } = require('./cli/ps-resolve');
const { fetchAllOpenIssues } = require('./cli/ps-fetch');
const { aggregate } = require('./cli/ps-aggregate');
const { resolveProject, listKnownProjects, aggregateStatus, formatBrief, formatTelegramBrief } = require('./project-status-model');

module.exports = { resolve, fetchAllOpenIssues, aggregate, resolveProject, listKnownProjects, aggregateStatus, formatBrief, formatTelegramBrief };
