/**
 * Normalizer: converts various provider-specific usage data into unified schema.
 *
 * Supported providers: OpenAI, Anthropic, StepFun (and extensible).
 */

class Normalizer {
  /**
   * Normalize a provider payload to unified telemetry format.
   * @param {Object} payload - provider-specific usage data
   * @param {string} provider - 'openai' | 'anthropic' | 'stepfun'
   * @param {Object} sessionMeta - { id, agent, channel, start_time, end_time, model }
   * @returns {Object} unified stats object for telemetry
   */
  normalize(payload, provider, sessionMeta) {
    const { input_tokens, output_tokens, total_tokens, context_usage, context_length, max_context_length, error } = payload;

    // Extract tokens: always capture input/output if provided; total may be given or computed
    const input = input_tokens != null ? input_tokens : 0;
    const output = output_tokens != null ? output_tokens : 0;
    let total = total_tokens != null ? total_tokens : input + output;

    const usage = {
      input_tokens: input,
      output_tokens: output,
      total_tokens: total,
      context_usage_pct: 0
    };

    // Context usage percentage
    if (context_usage != null) {
      usage.context_usage_pct = context_usage;
    } else if (context_length != null && max_context_length != null) {
      usage.context_usage_pct = (context_length / max_context_length) * 100;
    } else {
      usage.context_usage_pct = 0;
    }

    const result = {
      session: {
        id: sessionMeta.id,
        agent: sessionMeta.agent,
        channel: sessionMeta.channel,
        provider: provider,
        model: sessionMeta.model || (payload.model || undefined),
        duration_ms: sessionMeta.end_time - sessionMeta.start_time,
        start_time: sessionMeta.start_time,
        end_time: sessionMeta.end_time
      },
      usage: usage
    };

    if (error) {
      result.error = {
        message: error.message || String(error),
        stack: error.stack
      };
    }

    return result;
  }
}

module.exports = { Normalizer };
