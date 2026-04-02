/**
 * Tests for Telemetry Normalizer (FACTORY-YAAF-F017-S01)
 */

const assert = require('assert');
const { Normalizer } = require('../../lobster/lib/telemetry/normalizer');

const normalizer = new Normalizer();

function testOpenAINormalization() {
  console.log('Test: OpenAI normalization');
  // Flattened payload as expected by normalizer
  const payload = {
    input_tokens: 100,
    output_tokens: 50,
    total_tokens: 150,
    context_length: 200,
    max_context_length: 8192
  };
  const sessionMeta = {
    id: 'sess123',
    agent: 'drake',
    channel: 'internal',
    start_time: 1000,
    end_time: 2000,
    model: 'gpt-4'
  };

  const result = normalizer.normalize(payload, 'openai', sessionMeta);

  assert.strictEqual(result.session.provider, 'openai');
  assert.strictEqual(result.session.model, 'gpt-4');
  assert.strictEqual(result.usage.input_tokens, 100);
  assert.strictEqual(result.usage.output_tokens, 50);
  assert.strictEqual(result.usage.total_tokens, 150);
  assert.strictEqual(result.session.duration_ms, 1000);
  // Context usage %: 200 / 8192 * 100 ≈ 2.44%
  assert.ok(Math.abs(result.usage.context_usage_pct - (200 / 8192 * 100)) < 0.01);
  assert.strictEqual(result.status, undefined); // not set in normalize directly
}

function testAnthropicNormalization() {
  console.log('Test: Anthropic normalization');
  const payload = {
    input_tokens: 200,
    output_tokens: 100,
    total_tokens: 300
  };
  const sessionMeta = {
    id: 'sess456',
    agent: 'jarvis',
    channel: 'telegram',
    start_time: 500,
    end_time: 1500
  };

  const result = normalizer.normalize(payload, 'anthropic', sessionMeta);

  assert.strictEqual(result.session.provider, 'anthropic');
  assert.strictEqual(result.usage.input_tokens, 200);
  assert.strictEqual(result.usage.output_tokens, 100);
  assert.strictEqual(result.usage.total_tokens, 300);
  assert.strictEqual(result.session.duration_ms, 1000);
}

function testStepFunNormalization() {
  console.log('Test: StepFun normalization');
  const payload = {
    input_tokens: 150,
    output_tokens: 50,
    total_tokens: 200,
    context_usage: 75 // direct percentage
  };
  const sessionMeta = {
    id: 'sess789',
    agent: 'architect',
    channel: 'internal',
    start_time: 300,
    end_time: 1300
  };

  const result = normalizer.normalize(payload, 'stepfun', sessionMeta);

  assert.strictEqual(result.session.provider, 'stepfun');
  assert.strictEqual(result.usage.context_usage_pct, 75);
  assert.strictEqual(result.usage.total_tokens, 200);
}

function testErrorNormalization() {
  console.log('Test: Error normalization');
  const payload = {
    error: new Error('rate limit exceeded')
  };
  const sessionMeta = {
    id: 'sess-error',
    agent: 'falcon',
    channel: 'automated',
    start_time: 100,
    end_time: 200
  };

  const result = normalizer.normalize(payload, 'openai', sessionMeta);

  assert.ok(result.error);
  assert.strictEqual(result.error.message, 'rate limit exceeded');
  assert.strictEqual(result.session.duration_ms, 100);
}

function testContextUsageFallback() {
  console.log('Test: Context usage fallback (no explicit pct, no lengths)');
  const payload = {
    input_tokens: 100,
    output_tokens: 50
    // No total_tokens (computed), no context_length, no context_usage
  };
  const sessionMeta = {
    id: 'sess-fallback',
    agent: 'drake',
    channel: 'internal',
    start_time: 0,
    end_time: 100
  };

  const result = normalizer.normalize(payload, 'anthropic', sessionMeta);
  assert.strictEqual(result.usage.context_usage_pct, 0);
}

// Run all
console.log('=== Normalizer Tests ===');
testOpenAINormalization();
testAnthropicNormalization();
testStepFunNormalization();
testErrorNormalization();
testContextUsageFallback();
console.log('All normalizer tests passed.');
