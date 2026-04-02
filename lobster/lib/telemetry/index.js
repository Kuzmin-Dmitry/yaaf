/**
 * Telemetry module export
 */
const { TelemetryService } = require('./service');
const { Normalizer } = require('./normalizer');
const { onSuccess, onError, flush } = require('./agent-wrapper');

module.exports = {
  TelemetryService,
  Normalizer,
  onSuccess,
  onError,
  flush,
};
