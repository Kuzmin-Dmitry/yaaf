/**
 * Tests for Aggregator (T1 story FACTORY-YAAF-F016-S03)
 * Run with: node test/usage/aggregator.test.js
 */

const assert = require('assert');
const { Aggregator } = require('../../lobster/lib/usage/aggregator');

// Helper: create a fixed time source
function createFixedClock(initialTime) {
  let offset = 0;
  return {
    now: () => initialTime + offset,
    advance: (ms) => { offset += ms; }
  };
}

// Test: basic update and daily aggregation
console.log('Test: basic update and daily aggregation');
(() => {
  const baseTime = new Date('2025-01-01T12:00:00Z').getTime();
  const clock = createFixedClock(baseTime);
  const agg = new Aggregator({ now: clock.now });

  const metrics1 = {
    timestamp: baseTime,
    input_tokens: 100,
    output_tokens: 50,
    context_usage: 75,
    session_id: 'sess1'
  };
  agg.update(metrics1);

  const daily1 = agg.get_daily();
  assert.strictEqual(daily1.total_tokens, 150);
  assert.strictEqual(daily1.request_count, 1);
  assert.strictEqual(daily1.unique_sessions, 1);
  assert.strictEqual(daily1.avg_context_pct, 75);

  // Second request same session
  const metrics2 = {
    timestamp: baseTime + 60000, // 1 minute later
    input_tokens: 200,
    output_tokens: 100,
    context_usage: 80,
    session_id: 'sess1'
  };
  agg.update(metrics2);

  const daily2 = agg.get_daily();
  assert.strictEqual(daily2.total_tokens, 450);
  assert.strictEqual(daily2.request_count, 2);
  assert.strictEqual(daily2.unique_sessions, 1);
  const expectedAvg2 = (75 + 80) / 2;
  assert.strictEqual(daily2.avg_context_pct, expectedAvg2);

  // New session
  const metrics3 = {
    timestamp: baseTime + 120000,
    input_tokens: 50,
    output_tokens: 25,
    context_usage: 60,
    session_id: 'sess2'
  };
  agg.update(metrics3);

  const daily3 = agg.get_daily();
  assert.strictEqual(daily3.total_tokens, 525);
  assert.strictEqual(daily3.request_count, 3);
  assert.strictEqual(daily3.unique_sessions, 2);
  assert.strictEqual(daily3.avg_context_pct, (75 + 80 + 60) / 3);
})();

// Test: hourly sliding window
console.log('Test: hourly sliding window');
(() => {
  const baseTime = new Date('2025-01-01T00:00:00Z').getTime();
  const clock = createFixedClock(baseTime);
  const agg = new Aggregator({ now: clock.now });

  // Add requests at various minutes
  // minute 0: 100 tokens
  agg.update({
    timestamp: baseTime,
    input_tokens: 100, output_tokens: 0, context_usage: 50, session_id: 's1'
  });
  // minute 1: 200 tokens
  agg.update({
    timestamp: baseTime + 60 * 1000,
    input_tokens: 200, output_tokens: 0, context_usage: 60, session_id: 's1'
  });
  // minute 59: 300 tokens
  agg.update({
    timestamp: baseTime + 59 * 60 * 1000,
    input_tokens: 300, output_tokens: 0, context_usage: 70, session_id: 's2'
  });

  // Advance clock to minute 59 so window includes minutes 0-59
  clock.advance(59 * 60 * 1000);

  // Now at minute 59, window includes minutes 0-59 (all 60)
  let hourly = agg.get_hourly();
  assert.strictEqual(hourly.total_tokens, 600);
  assert.strictEqual(hourly.request_count, 3);
  assert.strictEqual(hourly.avg_context_pct, (50 + 60 + 70) / 3);

  // Advance 1 minute to minute 60 (which is mod 0)
  clock.advance(60 * 1000);
  // Add new request at minute 60
  agg.update({
    timestamp: baseTime + 60 * 60 * 1000,
    input_tokens: 400, output_tokens: 0, context_usage: 80, session_id: 's3'
  });

  // Now window is minutes 1-60 (since now is minute 60, windowStart = 1)
  // Should include buckets for minutes 1,2,...,59,60 (minute 0 falls out)
  // Buckets:
  // minute 0: 100 tokens (should be excluded)
  // minute 1: 200 tokens
  // minute 59: 300 tokens
  // minute 60: 400 tokens (new bucket, idx=0 reset)
  hourly = agg.get_hourly();
  assert.strictEqual(hourly.total_tokens, 200 + 300 + 400); // 900
  assert.strictEqual(hourly.request_count, 3);
  assert.strictEqual(hourly.avg_context_pct, (60 + 70 + 80) / 3);
})();

// Test: hourly oldest minute exactly 60 minutes ago is excluded
console.log('Test: hourly boundary');
(() => {
  const base = new Date('2025-01-01T00:00:00Z').getTime();
  const clock = createFixedClock(base);
  const agg = new Aggregator({ now: clock.now });

  // Request at minute 0
  agg.update({
    timestamp: base,
    input_tokens: 100, output_tokens: 0, context_usage: 50, session_id: 's1'
  });

  // Move to minute 60 exactly
  clock.advance(60 * 60 * 1000);
  // Now request at minute 60
  agg.update({
    timestamp: base + 60 * 60 * 1000,
    input_tokens: 200, output_tokens: 0, context_usage: 60, session_id: 's1'
  });

  // At now = minute 60, windowStart = minute 1. Minute 0 should be out.
  let hourly = agg.get_hourly();
  assert.strictEqual(hourly.total_tokens, 200);
  assert.strictEqual(hourly.request_count, 1);
})();

// Test: daily reset on new UTC day
console.log('Test: daily reset');
(() => {
  // Use two consecutive days
  const base = new Date('2025-01-01T23:59:59Z').getTime();
  const clock = createFixedClock(base);
  const agg = new Aggregator({ now: clock.now });

  agg.update({
    timestamp: base,
    input_tokens: 100, output_tokens: 0, context_usage: 50, session_id: 's1'
  });
  let daily = agg.get_daily();
  assert.strictEqual(daily.total_tokens, 100);
  assert.strictEqual(daily.unique_sessions, 1);

  // Advance to next day (1 second later becomes 2025-01-02)
  clock.advance(1000);
  agg.update({
    timestamp: base + 1000,
    input_tokens: 200, output_tokens: 0, context_usage: 60, session_id: 's2'
  });
  daily = agg.get_daily();
  // Day should have reset, so only second request
  assert.strictEqual(daily.total_tokens, 200);
  assert.strictEqual(daily.unique_sessions, 1);
})();

console.log('All tests passed.');
