/**
 * Aggregator: In-memory sliding-window aggregator for usage metrics.
 *
 * Hourly: 60-minute sliding window, bucketed by minute.
 * Daily: Current UTC day aggregates.
 *
 * Zero persistence: resets on restart.
 */

class Aggregator {
  constructor(options = {}) {
    this.now = options.now || Date.now.bind(Date);
    // Hourly buckets: 60 slots, each { minute, tokens, contextSum, requests }
    this.hourlyBuckets = Array(60)
      .fill(null)
      .map(() => ({ minute: null, tokens: 0, contextSum: 0, requests: 0 }));
    // Daily data: { dayKey, totalTokens, contextSum, requests, sessionIds }
    this.dailyData = {
      dayKey: null,
      totalTokens: 0,
      contextSum: 0,
      requests: 0,
      sessionIds: new Set()
    };
  }

  _getCurrentMinute(ts) {
    return Math.floor(ts / 60000);
  }

  /**
   * Update aggregates with a new request metric.
   * @param {Object} metrics - Should contain:
   *   timestamp (number, ms since epoch)
   *   input_tokens (number)
   *   output_tokens (number)
   *   context_usage (number) - context window usage percentage (0-100)
   *   session_id (string)
   */
  update(metrics) {
    const ts = metrics.timestamp;
    const tokens = (metrics.input_tokens || 0) + (metrics.output_tokens || 0);
    const contextPct = metrics.context_usage || 0;
    const sessionId = metrics.session_id;

    // Hourly update
    const minute = this._getCurrentMinute(ts);
    const idx = minute % 60;
    const bucket = this.hourlyBuckets[idx];
    if (bucket.minute !== minute) {
      // Reset bucket for new minute cycle
      bucket.minute = minute;
      bucket.tokens = 0;
      bucket.contextSum = 0;
      bucket.requests = 0;
    }
    bucket.tokens += tokens;
    bucket.contextSum += contextPct;
    bucket.requests += 1;

    // Daily update
    const date = new Date(ts);
    const dayKey = date.toISOString().slice(0, 10); // UTC YYYY-MM-DD
    if (this.dailyData.dayKey !== dayKey) {
      // New day, reset
      this.dailyData.dayKey = dayKey;
      this.dailyData.totalTokens = 0;
      this.dailyData.contextSum = 0;
      this.dailyData.requests = 0;
      this.dailyData.sessionIds.clear();
    }
    this.dailyData.totalTokens += tokens;
    this.dailyData.contextSum += contextPct;
    this.dailyData.requests += 1;
    this.dailyData.sessionIds.add(sessionId);
  }

  /**
   * Get hourly aggregates for the last 60 minutes (sliding window).
   * @returns {{ total_tokens: number, avg_context_pct: number, request_count: number }}
   */
  get_hourly() {
    const now = this.now();
    const nowMinute = this._getCurrentMinute(now);
    const windowStartMinute = nowMinute - 59; // inclusive last 60 full minutes
    let totalTokens = 0;
    let totalContextSum = 0;
    let totalRequests = 0;

    for (const bucket of this.hourlyBuckets) {
      if (
        bucket.minute !== null &&
        bucket.minute >= windowStartMinute &&
        bucket.minute <= nowMinute
      ) {
        totalTokens += bucket.tokens;
        totalContextSum += bucket.contextSum;
        totalRequests += bucket.requests;
      }
    }

    const avgContext = totalRequests > 0 ? totalContextSum / totalRequests : 0;
    return {
      total_tokens: totalTokens,
      avg_context_pct: avgContext,
      request_count: totalRequests
    };
  }

  /**
   * Get daily aggregates for the current UTC day.
   * @returns {{ total_tokens: number, avg_context_pct: number, request_count: number, unique_sessions: number }}
   */
  get_daily() {
    const data = this.dailyData;
    const avgContext = data.requests > 0 ? data.contextSum / data.requests : 0;
    return {
      total_tokens: data.totalTokens,
      avg_context_pct: avgContext,
      request_count: data.requests,
      unique_sessions: data.sessionIds.size
    };
  }
}

module.exports = { Aggregator };
