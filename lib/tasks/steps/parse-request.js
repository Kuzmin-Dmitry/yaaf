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

/**
 * @param {string} request - raw user message
 * @param {Object|null} partialState - accumulated state from prior iterations
 * @param {Object} context - enriched context from step 1
 * @param {Object} llm - LLM client with extractFields(request, context) → { title?, description? }
 * @returns {Object} parsed - merged field set
 */
async function parseRequest(request, partialState, context, llm) {
  const extracted = await llm.extractFields(request, context);

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

module.exports = { parseRequest };
