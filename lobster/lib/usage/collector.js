/**
 * MetricCollector: collects request metrics and updates the aggregator.
 * This is a simple facade over Aggregator.
 */

const { Aggregator } = require('./aggregator');

class MetricCollector {
  constructor() {
    this.aggregator = new Aggregator();
  }

  /**
   * Record a request metric.
   * @param {Object} metrics - Same as Aggregator.update()
   */
  record(metrics) {
    this.aggregator.update(metrics);
  }

  /**
   * Get hourly aggregates.
   */
  getHourly() {
    return this.aggregator.get_hourly();
  }

  /**
   * Get daily aggregates.
   */
  getDaily() {
    return this.aggregator.get_daily();
  }
}

module.exports = { MetricCollector };
