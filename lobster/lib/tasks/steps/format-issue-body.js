/**
 * Step: Format issue body
 *
 * Deterministic. Assembles Markdown body from description + metadata footer.
 * Adds creation date, source attribution, and optional cross-reference.
 *
 * No early exit.
 */

/**
 * @param {Object} params - publish task input
 * @param {Object} [options]
 * @param {string} [options.date] - override date for deterministic testing (ISO date string)
 * @returns {string} formatted Markdown body
 */
function formatIssueBody(params, options = {}) {
  const date = options.date || new Date().toISOString().split('T')[0];
  const parts = [];

  if (params.description) {
    parts.push(params.description);
  }

  parts.push('');
  parts.push('---');
  parts.push(`_Created via [yaaf](https://github.com/Kuzmin-Dmitry/yaaf) on ${date}_`);

  if (params.source_id) {
    parts.push(`_Source task: ${params.source_id}_`);
  }

  return parts.join('\n');
}

module.exports = { formatIssueBody };
