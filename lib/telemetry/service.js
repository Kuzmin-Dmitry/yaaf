/**
 * Telemetry Service for FACTORY-YAAF-F017
 * Collects session stats, normalizes data, batches, and sends to Telegram.
 */

const { EventEmitter } = require('events');

class TelemetryService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.debug = process.env.TELEMETRY_DEBUG === 'true';
    this.batchSize = options.batchSize || 10;
    this.batchTimeout = options.batchTimeout || 6000; // 6 seconds, configurable
    this.queue = [];
    this.batchTimer = null;
    this.batchStartTime = null;
  }

  /**
   * Report a successful session completion.
   * @param {Object} stats - session statistics
   */
  reportSuccess(stats) {
    if (this.debug) {
      console.log('[Telemetry] reportSuccess:', stats);
    }
    this._enqueue({ status: 'success', ...stats });
  }

  /**
   * Report an error session.
   * @param {Object} errorStats - must include session.id and error.message
   */
  reportError(errorStats) {
    if (this.debug) {
      console.log('[Telemetry] reportError:', errorStats);
    }
    this._enqueue({ status: 'error', ...errorStats });
  }

  _enqueue(event) {
    this.queue.push(event);
    this._startBatchTimer();

    if (this.queue.length >= this.batchSize) {
      this._flush();
    }
  }

  _startBatchTimer() {
    if (this.batchTimer) return; // already running
    this.batchStartTime = Date.now();
    this.batchTimer = setTimeout(() => {
      this._flush();
    }, this.batchTimeout);
  }

  _flush() {
    if (this.queue.length === 0) {
      this.emit('flush');
      return;
    }

    const batch = this.queue.splice(0, this.queue.length);
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.batchStartTime = null;

    this._sendBatch(batch).then(() => this.emit('flush'));
  }

  async _sendBatch(batch) {
    // Send each event to Telegram (could be batched further by Telegram sender)
    for (const event of batch) {
      try {
        await this._sendTelegram(event);
      } catch (err) {
        console.error('[Telemetry] Failed to send event:', err.message);
        // Do not throw — telemetry must not crash agents
      }
    }
  }

  async _sendTelegram(event) {
    // Placeholder: will implement using OpenClaw gateway or direct bot API
    if (this.debug) {
      console.log('[Telemetry] Sending to Telegram:', this._formatMessage(event));
    }
    // Integration point: call gateway or Telegram client
    // await sendTelegramMessage(this._formatMessage(event));
  }

  _formatMessage(event) {
    const { status, session, usage, error } = event;
    const sessionId = session?.id || '?';
    const provider = session?.provider || 'unknown';
    const model = session?.model || 'unknown';
    const duration = session?.duration_ms ? `${(session.duration_ms / 1000).toFixed(2)}s` : '?';
    const tokens = usage ? `${usage.total_tokens} (input=${usage.input_tokens}, output=${usage.output_tokens})` : '?';
    const ctxPct = usage ? `${usage.context_usage_pct.toFixed(1)}%` : '?';
    const agent = session?.agent || '?';
    const channel = session?.channel || '?';

    if (status === 'error') {
      const errorMsg = error?.message || 'unknown error';
      return `❌ Session *${sessionId}* failed on *${agent}* (${channel})\nProvider: ${provider}\nModel: ${model}\nDuration: ${duration}\nError: ${errorMsg}`;
    }

    return `✅ Session *${sessionId}*\nAgent: ${agent} (${channel})\nProvider: ${provider}\nModel: ${model}\nDuration: ${duration}\nTokens: ${tokens}\nContext: ${ctxPct}`;
  }
}

module.exports = { TelemetryService };
