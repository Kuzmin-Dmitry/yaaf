/**
 * Tests for TelemetryService batching (FACTORY-YAAF-F017-S01)
 */

const assert = require('assert');
const { TelemetryService } = require('../../lobster/lib/telemetry/service');

async function testBatchSizeThreshold() {
  console.log('Test: Batch size threshold (N=3 for test)');
  const service = new TelemetryService({ batchSize: 3, batchTimeout: 10000 });
  const sent = [];

  // Override _sendBatch to capture
  service._sendBatch = async (batch) => {
    sent.push(batch);
  };

  service.reportSuccess({
    session: { id: 's1' },
    usage: { total_tokens: 100 }
  });
  service.reportSuccess({
    session: { id: 's2' },
    usage: { total_tokens: 200 }
  });
  // Not yet flushed (size 2 < 3)
  assert.strictEqual(sent.length, 0);

  service.reportSuccess({
    session: { id: 's3' },
    usage: { total_tokens: 300 }
  });
  // Now should flush (size 3)
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].length, 3);
}

async function testBatchTimeout() {
  console.log('Test: Batch timeout');
  const service = new TelemetryService({ batchSize: 10, batchTimeout: 100 });
  const sent = [];

  service._sendBatch = async (batch) => {
    sent.push(batch);
  };

  service.reportSuccess({
    session: { id: 's1' },
    usage: { total_tokens: 100 }
  });

  assert.strictEqual(sent.length, 0);

  // Wait for timeout
  await new Promise(resolve => setTimeout(resolve, 120));

  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].length, 1);
}

async function testMixedSuccessAndError() {
  console.log('Test: Mixed success and error in batch');
  const service = new TelemetryService({ batchSize: 2, batchTimeout: 10000 });
  const sent = [];

  service._sendBatch = async (batch) => {
    sent.push(batch);
  };

  service.reportSuccess({
    session: { id: 's1' },
    usage: { total_tokens: 100 }
  });
  service.reportError({
    session: { id: 's2' },
    error: { message: 'fail' }
  });

  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].length, 2);
  assert.strictEqual(sent[0][0].status, 'success');
  assert.strictEqual(sent[0][1].status, 'error');
}

async function testBatchPausedAfterFlush() {
  console.log('Test: Batch timer cleared after flush');
  const service = new TelemetryService({ batchSize: 2, batchTimeout: 1000 });
  const sent = [];

  service._sendBatch = async (batch) => {
    sent.push(batch);
  };

  service.reportSuccess({ session: { id: 'a' }, usage: { total_tokens: 1 } });
  service.reportSuccess({ session: { id: 'b' }, usage: { total_tokens: 2 } });

  // Flush happened; timer cleared
  assert.ok(!service.batchTimer);

  // Add another event should start a new timer but not flush immediately
  service.reportSuccess({ session: { id: 'c' }, usage: { total_tokens: 3 } });
  assert.strictEqual(sent.length, 1); // still only 1 batch sent
}

async function testDebugFlag() {
  console.log('Test: Debug flag logging');
  // Set TELEMETRY_DEBUG for this test (it reads at construction)
  process.env.TELEMETRY_DEBUG = 'true';
  const service = new TelemetryService({ batchSize: 100, batchTimeout: 10000 });

  // Mock console.log to verify debug output
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args);

  service.reportSuccess({ session: { id: 'x' }, usage: { total_tokens: 5 } });

  console.log = origLog;
  process.env.TELEMETRY_DEBUG = 'false';

  assert.ok(logs.some(log => log.includes('[Telemetry] reportSuccess:')));
}

// Run all
console.log('=== TelemetryService Batching Tests ===');
(async () => {
  await testBatchSizeThreshold();
  await testBatchTimeout();
  await testMixedSuccessAndError();
  await testBatchPausedAfterFlush();
  await testDebugFlag();
  console.log('All batching tests passed.');
})().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
