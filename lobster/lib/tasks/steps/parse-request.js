/**
 * Step 2: Parse Request
 *
 * Extract structured fields from the user message. If partial_state already
 * contains parsed fields, merge — new data overrides, existing data is preserved.
 *
 * This is the only step that touches an LLM. All other steps are deterministic.
 *
 * No early exit — even if parsing extracts nothing, an empty parsed is passed
 * to completeness check.
 */

const { withTimeout } = require('./with-timeout');

const DEFAULT_LLM_TIMEOUT_MS = 30000;
const MAX_REQUEST_LENGTH = 4000;

/**
 * Sanitize user input before sending to LLM.
 * Strips control characters (except newlines/tabs) and trims to max length.
 */
function sanitizeInput(text) {
  if (typeof text !== 'string') return '';
  // Remove control chars except \n and \t
  const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned.slice(0, MAX_REQUEST_LENGTH);
}

/**
 * @param {string} request - raw user message
 * @param {Object|null} partialState - accumulated state from prior iterations
 * @param {Object} context - enriched context from step 1
 * @param {Object} llm - LLM client with extractFields(request, context) → { title?, description? }
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=30000] - timeout for LLM call
 * @returns {Object} parsed - merged field set
 */
async function parseRequest(request, partialState, context, llm, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;
  const sanitizedRequest = sanitizeInput(request);
  const extracted = await withTimeout(llm.extractFields(sanitizedRequest, context), timeoutMs);

  // Merge: partial_state is the base, extracted overrides only non-null values
  const base = partialState || {};
  const merged = { ...base };

  if (extracted.title != null && extracted.title !== '') {
    merged.title = extracted.title;
  }
  if (extracted.description != null && extracted.description !== '') {
    merged.description = extracted.description;
  }

  return merged;
}

module.exports = { parseRequest, sanitizeInput };
