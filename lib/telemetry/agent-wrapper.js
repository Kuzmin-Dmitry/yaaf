/**
 * Agent Wrapper utilities for telemetry reporting.
 *
 * Each agent (jarvis, architect, drake, falcon) should call these
 * at the end of a session.
 *
 * Usage:
 *   const { onSuccess, onError } = require('../lib/telemetry/agent-wrapper');
 *   try {
 *     // ... agent work ...
 *     onSuccess(sessionMeta, usagePayload);
 *   } catch (err) {
 *     onError(sessionMeta, err);
 *   }
 */

const { TelemetryService } = require('./service');
const { Normalizer } = require('./normalizer');

// Singleton telemetry service
const telemetry = process.env.TELEMETRY_DISABLED === 'true' ? null : new TelemetryService();
const normalizer = new Normalizer();

/**
 * Report successful session completion.
 * @param {string} provider - 'openai' | 'anthropic' | 'stepfun'
 * @param {Object} sessionMeta - { id, agent, channel, start_time, end_time, model }
 * @param {Object} usagePayload - provider-specific usage data
 */
function onSuccess(provider, sessionMeta, usagePayload) {
  if (!telemetry) return; // disabled
  try {
    const stats = normalizer.normalize(usagePayload, provider, sessionMeta);
    telemetry.reportSuccess(stats);
  } catch (err) {
    console.error('[telemetry] onSuccess failed:', err);
  }
}

/**
 * Report session error.
 * @param {string} provider - provider name
 * @param {Object} sessionMeta - { id, agent, channel, start_time, end_time }
 * @param {Error} error - the error that occurred
 */
function onError(provider, sessionMeta, error) {
  if (!telemetry) return; // disabled
  try {
    const errorPayload = { error };
    const stats = normalizer.normalize(errorPayload, provider, sessionMeta);
    telemetry.reportError(stats);
  } catch (err) {
    console.error('[telemetry] onError failed:', err);
  }
}

/**
 * Flush telemetry queue (useful for testing or graceful shutdown).
 * @returns {Promise<void>}
 */
function flush() {
  return new Promise((resolve) => {
    if (!telemetry) return resolve();
    telemetry.once('flush', () => resolve());
    telemetry._flush();
  });
}

module.exports = { onSuccess, onError, flush, _getTelemetry: () => telemetry };
